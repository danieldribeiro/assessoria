import "server-only";
import { notFound } from "next/navigation";
import type { ContaCaixa, ContaPlano, Contraparte, Extrato, Lancamento, Movimento, Saldo, Transferencia } from "@/lib/financeiro/dominio";
import type { MovimentoConta } from "@/lib/financeiro/fluxo";
import { criarCliente } from "@/lib/supabase/server";

// Tudo passa pela sessão de quem está logado: as regras de acesso do banco (pode_usar_financeiro) decidem o que volta.

// Tabela que ainda não existe no banco (migration não aplicada): a tela esconde o recurso em vez de quebrar.
function semTabela(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message));
}

export async function carregarBaseFinanceira(empresaId: string) {
  const supabase = await criarCliente();
  const [{ data: empresa }, { data: contas, error: e1 }, { data: caixas, error: e2 }, { data: contrapartes, error: e3 }, { error: e4 }] =
    await Promise.all([
      supabase.from("empresas").select("id, nome, segmento").eq("id", empresaId).maybeSingle(),
      supabase.from("fin_contas").select("*").eq("empresa_id", empresaId),
      supabase.from("fin_contas_caixa").select("*").eq("empresa_id", empresaId).order("ordem").order("nome"),
      supabase.from("fin_contrapartes").select("id, empresa_id, nome, tipo, documento, ativa").eq("empresa_id", empresaId).order("nome"),
      supabase.from("fin_extratos").select("id").eq("empresa_id", empresaId).limit(1),
    ]);
  if (!empresa) notFound();
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  if (e3 && !semTabela(e3)) throw new Error(e3.message);
  if (e4 && !semTabela(e4)) throw new Error(e4.message);
  return {
    empresa: empresa as { id: string; nome: string; segmento: string | null },
    contas: (contas ?? []) as ContaPlano[],
    caixas: (caixas ?? []).map((c) => ({ ...c, saldo_inicial: Number(c.saldo_inicial) })) as ContaCaixa[],
    contrapartes: (contrapartes ?? []) as Contraparte[],
    // Recursos das migrations 0009 e 0010: só aparecem depois de aplicadas.
    recursos: { fornecedores: !e3, extratos: !e4 },
  };
}

export type BaseFinanceira = Awaited<ReturnType<typeof carregarBaseFinanceira>>;

export async function carregarExtratos(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_extratos")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("importado_em", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({ ...e, saldo_banco: e.saldo_banco === null ? null : Number(e.saldo_banco) })) as Extrato[];
}

export async function carregarMovimentosExtrato(empresaId: string, inicio: string, fim: string, caixa?: string | null) {
  const supabase = await criarCliente();
  let consulta = supabase
    .from("fin_extrato_movimentos")
    .select("id, extrato_id, conta_caixa_id, data, valor, tipo_ofx, descricao, fitid, documento, situacao, lancamento_id, transferencia_id, motivo")
    .eq("empresa_id", empresaId)
    .gte("data", inicio)
    .lte("data", fim);
  if (caixa) consulta = consulta.eq("conta_caixa_id", caixa);
  const { data, error } = await consulta.order("data", { ascending: false }).order("valor");
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ ...m, valor: Number(m.valor) })) as Movimento[];
}

// Movimentações do extrato ligadas a estes lançamentos (para marcar "conciliado" na lista).
export async function carregarConciliados(empresaId: string, lancamentos: string[]) {
  if (!lancamentos.length) return new Set<string>();
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_extrato_movimentos")
    .select("lancamento_id")
    .eq("empresa_id", empresaId)
    .in("lancamento_id", lancamentos);
  if (error) {
    if (semTabela(error)) return new Set<string>();
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((m) => m.lancamento_id as string));
}

// Chaves e "assinaturas" (data|valor|descrição) já gravadas na conta de caixa, para a prévia da importação.
export async function carregarChavesExistentes(empresaId: string, caixa: string, inicio: string, fim: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_extrato_movimentos")
    .select("chave, data, valor, descricao")
    .eq("empresa_id", empresaId)
    .eq("conta_caixa_id", caixa)
    .gte("data", inicio)
    .lte("data", fim);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ ...m, valor: Number(m.valor) })) as { chave: string; data: string; valor: number; descricao: string }[];
}

export async function carregarMovimentos(empresaId: string, inicio: string, fim: string, base: "realizado" | "previsto") {
  const supabase = await criarCliente();
  const { data, error } = await supabase.rpc("fin_fluxo_caixa", { p_empresa: empresaId, p_inicio: inicio, p_fim: fim, p_base: base });
  if (error) throw new Error(error.message);
  return (data ?? []) as MovimentoConta[];
}

export async function carregarSaldos(empresaId: string, data: string) {
  const supabase = await criarCliente();
  const { data: linhas, error } = await supabase.rpc("fin_saldos", { p_empresa: empresaId, p_data: data });
  if (error) throw new Error(error.message);
  return ((linhas ?? []) as Saldo[]).map((s) => ({
    ...s,
    saldo_inicial: Number(s.saldo_inicial),
    saldo: s.saldo === null ? null : Number(s.saldo),
  }));
}

// Lançamentos do período. Pelo movimento: liquidação (realizado) ou vencimento (previsto e cancelado sem liquidação).
// Pela competência: data de competência, em qualquer situação.
export async function carregarLancamentos(
  empresaId: string,
  inicio: string,
  fim: string,
  criterio: "movimento" | "competencia" = "movimento",
) {
  const supabase = await criarCliente();
  let consulta = supabase
    .from("fin_lancamentos")
    .select("*, rateios:fin_lancamento_rateios(conta_id, valor)")
    .eq("empresa_id", empresaId)
    .is("rateios.substituido_em", null);
  consulta =
    criterio === "competencia"
      ? consulta.gte("data_competencia", inicio).lte("data_competencia", fim)
      : consulta.or(
          `and(data_liquidacao.gte.${inicio},data_liquidacao.lte.${fim}),and(data_liquidacao.is.null,data_vencimento.gte.${inicio},data_vencimento.lte.${fim})`,
        );
  const { data, error } = await consulta
    .order("data_liquidacao", { ascending: false, nullsFirst: false })
    .order("data_vencimento", { ascending: false })
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({
    ...l,
    valor_total: Number(l.valor_total),
    rateios: (l.rateios ?? []).map((r: { conta_id: string; valor: number }) => ({ ...r, valor: Number(r.valor) })),
  })) as Lancamento[];
}

export async function carregarTransferencias(empresaId: string, inicio: string, fim: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_transferencias")
    .select("*")
    .eq("empresa_id", empresaId)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({ ...t, valor: Number(t.valor) })) as Transferencia[];
}
