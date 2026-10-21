import "server-only";
import { notFound } from "next/navigation";
import type { ContaCaixa, ContaPlano, Lancamento, Saldo, Transferencia } from "@/lib/financeiro/dominio";
import type { MovimentoConta } from "@/lib/financeiro/fluxo";
import { criarCliente } from "@/lib/supabase/server";

// Tudo passa pela sessão de quem está logado: as regras de acesso do banco (pode_usar_financeiro) decidem o que volta.

export async function carregarBaseFinanceira(empresaId: string) {
  const supabase = await criarCliente();
  const [{ data: empresa }, { data: contas, error: e1 }, { data: caixas, error: e2 }] = await Promise.all([
    supabase.from("empresas").select("id, nome, segmento").eq("id", empresaId).maybeSingle(),
    supabase.from("fin_contas").select("*").eq("empresa_id", empresaId),
    supabase.from("fin_contas_caixa").select("*").eq("empresa_id", empresaId).order("ordem").order("nome"),
  ]);
  if (!empresa) notFound();
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  return {
    empresa: empresa as { id: string; nome: string; segmento: string | null },
    contas: (contas ?? []) as ContaPlano[],
    caixas: (caixas ?? []).map((c) => ({ ...c, saldo_inicial: Number(c.saldo_inicial) })) as ContaCaixa[],
  };
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
