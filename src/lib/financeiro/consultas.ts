import "server-only";
import { notFound } from "next/navigation";
import type { Cartao, ContaCaixa, ContaPlano, Contraparte, Extrato, Fatura, Lancamento, Movimento, Saldo, Transferencia } from "@/lib/financeiro/dominio";
import { diaAnterior, resumoContagem, variacoesEstoque, type Contagem, type ItemEstoque, type LinhaContagem, type LinhaFicha, type LinhaVenda, type Produto, type VendaMes } from "@/lib/financeiro/estoque";
import { montarDre, parcelas } from "@/lib/financeiro/painel";
import { ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import type { MovimentoConta } from "@/lib/financeiro/fluxo";
import { criarCliente } from "@/lib/supabase/server";

// Tudo passa pela sessão de quem está logado: as regras de acesso do banco (pode_usar_financeiro) decidem o que volta.

// Tabela que ainda não existe no banco (migration não aplicada): a tela esconde o recurso em vez de quebrar.
function semTabela(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message));
}

// Na central da clínica (origem "central"), o cliente não lê a tabela empresas: o nome vem de
// central_financeiro_empresa, que volta vazio se a chave do financeiro estiver desligada.
async function carregarEmpresa(supabase: Awaited<ReturnType<typeof criarCliente>>, empresaId: string, origem: "equipe" | "central") {
  if (origem === "central") {
    const { data, error } = await supabase.rpc("central_financeiro_empresa", { p_empresa: empresaId });
    if (error && !/central_financeiro_empresa/.test(error.message)) throw new Error(error.message);
    return { data: (data ?? null) as Record<string, unknown> | null };
  }
  // "*" e não a lista de colunas: financeiro_na_central só existe depois da migration 0012.
  const { data } = await supabase.from("empresas").select("*").eq("id", empresaId).maybeSingle();
  return { data: (data ?? null) as Record<string, unknown> | null };
}

export async function carregarBaseFinanceira(empresaId: string, origem: "equipe" | "central" = "equipe") {
  const supabase = await criarCliente();
  const [
    { data: empresa },
    { data: contas, error: e1 },
    { data: caixas, error: e2 },
    { data: contrapartes, error: e3 },
    { error: e4 },
    { data: cartoes, error: e5 },
    { error: e6 },
    { error: e7 },
  ] = await Promise.all([
      carregarEmpresa(supabase, empresaId, origem),
      supabase.from("fin_contas").select("*").eq("empresa_id", empresaId),
      supabase.from("fin_contas_caixa").select("*").eq("empresa_id", empresaId).order("ordem").order("nome"),
      supabase.from("fin_contrapartes").select("id, empresa_id, nome, tipo, documento, ativa").eq("empresa_id", empresaId).order("nome"),
      supabase.from("fin_extratos").select("id").eq("empresa_id", empresaId).limit(1),
      supabase.from("fin_cartoes").select("id, empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento, ativo").eq("empresa_id", empresaId).order("nome"),
      supabase.from("fin_estoque_contagens").select("id").eq("empresa_id", empresaId).limit(1),
      supabase.from("fin_estoque_produtos").select("id").eq("empresa_id", empresaId).limit(1),
    ]);
  if (!empresa) notFound();
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  if (e3 && !semTabela(e3)) throw new Error(e3.message);
  if (e4 && !semTabela(e4)) throw new Error(e4.message);
  if (e5 && !semTabela(e5)) throw new Error(e5.message);
  if (e6 && !semTabela(e6)) throw new Error(e6.message);
  if (e7 && !semTabela(e7)) throw new Error(e7.message);
  return {
    empresa: { id: empresa.id, nome: empresa.nome, segmento: empresa.segmento ?? null } as { id: string; nome: string; segmento: string | null },
    // A chave da 0012: o financeiro desta empresa aparece na central da clínica (só para ver).
    naCentral: empresa.financeiro_na_central === true,
    // A opção da 0018: esta empresa controla estoque (insumos, contagens e variação de estoque na DRE).
    // Na central o nome vem por outra função, sem a opção: lá o resultado fica sem a variação.
    estoqueAtivo: empresa.estoque_ativo === true && !e6,
    contas: (contas ?? []) as ContaPlano[],
    caixas: (caixas ?? []).map((c) => ({ ...c, saldo_inicial: Number(c.saldo_inicial) })) as ContaCaixa[],
    contrapartes: (contrapartes ?? []) as Contraparte[],
    cartoes: (cartoes ?? []) as Cartao[],
    // Recursos das migrations 0009, 0010 e 0011: só aparecem depois de aplicadas.
    recursos: { fornecedores: !e3, extratos: !e4, cartoes: !e5, estoque: !e6, fichas: !e7 },
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

// Faturas com vencimento ou pagamento no período, e as compras de cada uma (com o rateio atual).
export async function carregarFaturas(empresaId: string, inicio: string, fim: string, cartao?: string | null) {
  const supabase = await criarCliente();
  let consulta = supabase
    .from("fin_faturas")
    .select("*")
    .eq("empresa_id", empresaId)
    .or(`and(data_vencimento.gte.${inicio},data_vencimento.lte.${fim}),and(data_pagamento.gte.${inicio},data_pagamento.lte.${fim})`);
  if (cartao) consulta = consulta.eq("cartao_id", cartao);
  const { data, error } = await consulta.order("data_vencimento", { ascending: false });
  if (error) {
    if (semTabela(error)) return [];
    throw new Error(error.message);
  }
  const faturas = (data ?? []).map((f) => ({ ...f, valor_pago: f.valor_pago === null ? null : Number(f.valor_pago) })) as Fatura[];
  const compras = await carregarComprasDasFaturas(empresaId, faturas.map((f) => f.id));
  return faturas.map((f) => ({ ...f, compras: compras.filter((c) => c.fatura_id === f.id) }));
}

export async function carregarFaturasPorId(empresaId: string, ids: string[]) {
  if (!ids.length) return [];
  const supabase = await criarCliente();
  const { data, error } = await supabase.from("fin_faturas").select("*").eq("empresa_id", empresaId).in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({ ...f, valor_pago: f.valor_pago === null ? null : Number(f.valor_pago) })) as Fatura[];
}

export async function carregarComprasDasFaturas(empresaId: string, faturas: string[]) {
  if (!faturas.length) return [];
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_lancamentos")
    .select("*, rateios:fin_lancamento_rateios(conta_id, valor)")
    .eq("empresa_id", empresaId)
    .in("fatura_id", faturas)
    .is("rateios.substituido_em", null)
    .order("data_competencia")
    .order("criado_em");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({
    ...l,
    valor_total: Number(l.valor_total),
    rateios: (l.rateios ?? []).map((r: { conta_id: string; valor: number }) => ({ ...r, valor: Number(r.valor) })),
  })) as Lancamento[];
}

// Faturas já ligadas a uma movimentação do extrato.
export async function carregarFaturasConciliadas(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase.from("fin_extrato_movimentos").select("fatura_id").eq("empresa_id", empresaId).not("fatura_id", "is", null);
  if (error) {
    if (semTabela(error) || /fatura_id/.test(error.message)) return new Set<string>();
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((m) => m.fatura_id as string));
}

export async function carregarMovimentosExtrato(empresaId: string, inicio: string, fim: string, caixa?: string | null, comFatura = false) {
  const supabase = await criarCliente();
  let consulta = supabase
    .from("fin_extrato_movimentos")
    .select("id, extrato_id, conta_caixa_id, data, valor, tipo_ofx, descricao, fitid, documento, situacao, lancamento_id, transferencia_id, motivo" + (comFatura ? ", fatura_id" : ""))
    .eq("empresa_id", empresaId)
    .gte("data", inicio)
    .lte("data", fim);
  if (caixa) consulta = consulta.eq("conta_caixa_id", caixa);
  const { data, error } = await consulta.order("data", { ascending: false }).order("valor");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Movimento[]).map((m) => ({ ...m, valor: Number(m.valor) }));
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

// Previstos (contas a pagar e a receber) que vencem até a data, inclusive os já vencidos.
export async function carregarPrevistos(empresaId: string, ate: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_lancamentos")
    .select("*, rateios:fin_lancamento_rateios(conta_id, valor)")
    .eq("empresa_id", empresaId)
    .eq("situacao", "previsto")
    .lte("data_vencimento", ate)
    .is("rateios.substituido_em", null)
    .order("data_vencimento")
    .order("criado_em");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({
    ...l,
    valor_total: Number(l.valor_total),
    rateios: (l.rateios ?? []).map((r: { conta_id: string; valor: number }) => ({ ...r, valor: Number(r.valor) })),
  })) as Lancamento[];
}

// Data do primeiro lançamento realizado da empresa: a estimativa da projeção só aparece com 28 dias de histórico.
export async function carregarPrimeiroRealizado(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_lancamentos")
    .select("data_liquidacao")
    .eq("empresa_id", empresaId)
    .eq("situacao", "realizado")
    .not("data_liquidacao", "is", null)
    .order("data_liquidacao")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data_liquidacao as string | undefined) ?? null;
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

// ---------------------------------------------------------------------------
// Estoque (0018)
// ---------------------------------------------------------------------------

const numeroOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function carregarItensEstoque(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase.from("fin_estoque_itens").select("*").eq("empresa_id", empresaId).order("categoria", { nullsFirst: false }).order("nome");
  if (error) throw new Error(error.message);
  // conteudo só existe depois da 0021: sem ela, fica undefined e a ficha não converte g/ml de insumo contado por unidade.
  return (data ?? []).map((i) => ({
    ...i,
    custo_unitario: numeroOuNulo(i.custo_unitario),
    ...("conteudo" in i ? { conteudo: numeroOuNulo(i.conteudo) } : {}),
  })) as ItemEstoque[];
}

const lerLinha = (l: Record<string, unknown>) =>
  ({ ...l, quantidade: Number(l.quantidade), custo_unitario: numeroOuNulo(l.custo_unitario) }) as LinhaContagem;

// Contagens com as linhas (poucas por mês: cabem inteiras).
export async function carregarContagens(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_estoque_contagens")
    .select("*, linhas:fin_estoque_contagem_itens(*)")
    .eq("empresa_id", empresaId)
    .order("data", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ linhas, ...c }) => ({
    ...(c as Contagem),
    linhas: ((linhas ?? []) as Record<string, unknown>[]).map(lerLinha).sort((a, b) => a.ordem - b.ordem),
  }));
}

// Valor de cada contagem fechada entre as datas, para a variação de estoque da DRE.
export async function carregarValoresContagens(empresaId: string, inicio: string, fim: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_estoque_contagens")
    .select("data, situacao, linhas:fin_estoque_contagem_itens(quantidade, custo_unitario, fora_do_cmv)")
    .eq("empresa_id", empresaId)
    .eq("situacao", "fechada")
    .gte("data", inicio)
    .lte("data", fim);
  if (error) {
    if (semTabela(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((c) => ({
    data: c.data as string,
    situacao: c.situacao as Contagem["situacao"],
    centavos: resumoContagem(((c.linhas ?? []) as Record<string, unknown>[]).map((l) => ({
      quantidade: Number(l.quantidade),
      custo_unitario: numeroOuNulo(l.custo_unitario),
      fora_do_cmv: l.fora_do_cmv === true,
    }))).centavos,
  }));
}

// Variação de estoque de cada mês (para a linha 5 da DRE), pelas contagens fechadas.
export async function carregarVariacoes(empresaId: string, meses: string[], inicio: string, fim: string) {
  if (!meses.length) return [];
  const contagens = await carregarValoresContagens(empresaId, diaAnterior(meses[0]), fim);
  return variacoesEstoque(contagens, meses, inicio, fim);
}

// Produtos vendidos com a ficha técnica de cada um (0019).
export async function carregarProdutos(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_estoque_produtos")
    .select("*, ficha:fin_estoque_ficha_itens(*)")
    .eq("empresa_id", empresaId)
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ ficha, ...p }) => ({
    ...(p as Produto),
    ficha: ((ficha ?? []) as LinhaFicha[]).map((l) => ({ ...l, quantidade: Number(l.quantidade) })).sort((a, b) => a.ordem - b.ordem),
  }));
}

// Relatórios de vendas importados, do mês mais recente para o mais antigo, com as linhas.
export async function carregarVendas(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("fin_estoque_vendas")
    .select("*, linhas:fin_estoque_vendas_itens(*)")
    .eq("empresa_id", empresaId)
    .order("mes", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ linhas, ...v }) => ({
    ...(v as VendaMes),
    linhas: ((linhas ?? []) as LinhaVenda[])
      .map((l) => ({ ...l, quantidade: Number(l.quantidade), valor: l.valor === null ? null : Number(l.valor), ...("custo_unitario" in l ? { custo_unitario: numeroOuNulo(l.custo_unitario) } : {}) }))
      .sort((a, b) => a.ordem - b.ordem),
  }));
}

// CMV real de um mês (AAAA-MM-01), em centavos: compras da linha 5 da DRE (competência) menos a variação de estoque.
// Sem as duas contagens fechadas, a variação fica null e o CMV real são só as compras.
export async function carregarCmvReal(empresaId: string, contas: ContaPlano[], mes: string) {
  const fim = ultimoDiaDoMes(mes.slice(0, 7));
  const [lancamentos, [variacao]] = await Promise.all([
    carregarLancamentos(empresaId, mes, fim, "competencia"),
    carregarVariacoes(empresaId, [mes], mes, fim),
  ]);
  const dre = montarDre(parcelas(lancamentos, contas, "competencia", {}, mes, fim), [mes], contas);
  const compras = -Math.round(dre.linhas[4].total * 100);
  const centavos = variacao?.centavos ?? null;
  return { compras, variacao: centavos, cmv: centavos === null ? compras : compras - centavos, motivo: centavos === null ? variacao : null };
}
