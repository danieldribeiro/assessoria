// Painel e resultado gerencial: regras puras, sem banco (docs/axis-financeiro/evolucao-modulo-financeiro.md, seção 3).
// Cada parte do rateio de um lançamento vira uma "parcela", contada uma vez só, em centavos e com sinal:
// entrada soma, saída subtrai. Os totais da DRE, do painel e da lista de lançamentos saem todos das mesmas parcelas.
import { SECOES_DRE, type ContaPlano, type Direcao, type Lancamento } from "@/lib/financeiro/dominio";

// Competência: data de competência, previstos e realizados (regra C6). Caixa: data do pagamento, só realizados.
export type Base = "competencia" | "caixa";

export type Filtros = {
  caixa?: string | null; // conta de caixa
  conta?: string | null; // conta do plano (grupo ou analítica); grupo vale pelas contas abaixo dele
  tipo?: Direcao | null;
  secoes?: number[] | null; // seções da DRE
};

export type Parcela = {
  lancamento: Lancamento;
  conta: ContaPlano;
  data: string;
  mes: string; // AAAA-MM-01
  centavos: number; // + entrada, − saída
};

// As seções que formam o resultado operacional (linha 9 da DRE v4).
export const SECAO_FATURAMENTO = 1;
export const SECOES_DESPESA = [2, 3, 5, 6, 8] as const;

export const centavos = (v: number) => Math.round(Number(v) * 100);
export const reais = (c: number) => c / 100;

export function dataNaBase(l: Lancamento, base: Base) {
  if (base === "caixa") return l.situacao === "realizado" ? l.data_liquidacao : null;
  return l.situacao === "cancelado" ? null : l.data_competencia;
}

// Contas analíticas da seleção: a própria conta, ou todas as analíticas abaixo do grupo.
export function contasDaSelecao(contas: ContaPlano[], contaId: string | null | undefined) {
  if (!contaId) return null;
  const filhos = new Map<string | null, ContaPlano[]>();
  for (const c of contas) filhos.set(c.conta_pai_id, [...(filhos.get(c.conta_pai_id) ?? []), c]);
  const ids = new Set<string>();
  const visitar = (c: ContaPlano, passos: number) => {
    if (passos > 1000) return;
    if (c.tipo === "analitica") ids.add(c.id);
    for (const f of filhos.get(c.id) ?? []) visitar(f, passos + 1);
  };
  const raiz = contas.find((c) => c.id === contaId);
  if (raiz) visitar(raiz, 0);
  return ids;
}

export function parcelas(
  lancamentos: Lancamento[],
  contas: ContaPlano[],
  base: Base,
  filtros: Filtros,
  inicio: string,
  fim: string,
): Parcela[] {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const selecao = contasDaSelecao(contas, filtros.conta);
  const secoes = filtros.secoes?.length ? new Set(filtros.secoes) : null;
  const saida: Parcela[] = [];
  for (const l of lancamentos) {
    const data = dataNaBase(l, base);
    if (!data || data < inicio || data > fim) continue;
    if (filtros.caixa && l.conta_caixa_id !== filtros.caixa) continue;
    if (filtros.tipo && l.direcao !== filtros.tipo) continue;
    const sinal = l.direcao === "entrada" ? 1 : -1;
    for (const r of l.rateios) {
      const conta = porId.get(r.conta_id);
      if (!conta) continue;
      if (selecao && !selecao.has(conta.id)) continue;
      if (secoes && !secoes.has(conta.dre_secao ?? 0)) continue;
      saida.push({ lancamento: l, conta, data, mes: `${data.slice(0, 7)}-01`, centavos: sinal * centavos(r.valor) });
    }
  }
  return saida;
}

const somar = (v: number[]) => v.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// DRE gerencial: as 12 linhas fixas da v4, mês a mês
// ---------------------------------------------------------------------------

export type LinhaContaDre = { id: string; codigo: string; nome: string; valores: number[]; total: number };
export type LinhaDre = {
  numero: number;
  nome: string;
  calculada: boolean;
  valores: number[];
  total: number;
  contas: LinhaContaDre[];
};
export type Dre = { meses: string[]; linhas: LinhaDre[]; foraDaDre: number };

// Linhas calculadas: cada uma soma a anterior com as seções entre elas.
const CALCULADAS: Record<number, number[]> = { 4: [1, 2, 3], 7: [4, 5, 6], 9: [7, 8], 12: [9, 10, 11] };

export function montarDre(lista: Parcela[], meses: string[]): Dre {
  const indice = new Map(meses.map((m, i) => [m, i]));
  const vazio = () => meses.map(() => 0);
  const porSecao = new Map<number, number[]>();
  const porConta = new Map<string, { conta: ContaPlano; valores: number[] }>();
  let fora = 0;
  for (const p of lista) {
    const i = indice.get(p.mes);
    if (i === undefined) continue;
    const secao = p.conta.dre_secao;
    if (!secao) {
      fora += p.centavos;
      continue;
    }
    const v = porSecao.get(secao) ?? vazio();
    v[i] += p.centavos;
    porSecao.set(secao, v);
    const c = porConta.get(p.conta.id) ?? { conta: p.conta, valores: vazio() };
    c.valores[i] += p.centavos;
    porConta.set(p.conta.id, c);
  }

  const valores = new Map<number, number[]>();
  for (const s of SECOES_DRE) {
    const partes = CALCULADAS[s.numero];
    valores.set(
      s.numero,
      partes ? meses.map((_, i) => somar(partes.map((n) => valores.get(n)![i]))) : (porSecao.get(s.numero) ?? vazio()),
    );
  }

  const linhas = SECOES_DRE.map((s) => {
    const v = valores.get(s.numero)!;
    const contas = [...porConta.values()]
      .filter((c) => c.conta.dre_secao === s.numero)
      .sort((a, b) => a.conta.codigo.localeCompare(b.conta.codigo, "pt-BR", { numeric: true }))
      .map((c) => ({
        id: c.conta.id,
        codigo: c.conta.codigo,
        nome: c.conta.nome,
        valores: c.valores.map(reais),
        total: reais(somar(c.valores)),
      }));
    return { numero: s.numero, nome: s.nome, calculada: !s.recebe, valores: v.map(reais), total: reais(somar(v)), contas };
  });
  return { meses, linhas, foraDaDre: reais(fora) };
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export type Resumo = { faturamento: number; despesas: number; resultadoOperacional: number; resultadoPeriodo: number };

export function resumir(lista: Parcela[]): Resumo {
  let faturamento = 0;
  let despesas = 0;
  let periodo = 0;
  for (const p of lista) {
    const s = p.conta.dre_secao;
    if (!s) continue;
    periodo += p.centavos;
    if (s === SECAO_FATURAMENTO) faturamento += p.centavos;
    else if ((SECOES_DESPESA as readonly number[]).includes(s)) despesas -= p.centavos;
  }
  return {
    faturamento: reais(faturamento),
    despesas: reais(despesas),
    resultadoOperacional: reais(faturamento - despesas),
    resultadoPeriodo: reais(periodo),
  };
}

export type SerieMensal = { mes: string; faturamento: number; despesas: number; resultado: number };

export function seriesMensais(lista: Parcela[], meses: string[]): SerieMensal[] {
  return meses.map((mes) => {
    const r = resumir(lista.filter((p) => p.mes === mes));
    return { mes, faturamento: r.faturamento, despesas: r.despesas, resultado: r.resultadoOperacional };
  });
}

export type FatiaDespesa = { id: string | null; nome: string; valor: number; participacao: number };

// Despesas (linhas 2, 3, 5, 6 e 8) por conta, da maior para a menor. Além de `maximo` contas, o resto vira "Outras".
export function despesasPorConta(lista: Parcela[], maximo = 7): FatiaDespesa[] {
  const porConta = new Map<string, { conta: ContaPlano; c: number }>();
  for (const p of lista) {
    if (!(SECOES_DESPESA as readonly number[]).includes(p.conta.dre_secao ?? 0)) continue;
    const x = porConta.get(p.conta.id) ?? { conta: p.conta, c: 0 };
    x.c -= p.centavos;
    porConta.set(p.conta.id, x);
  }
  const ordenadas = [...porConta.values()].filter((x) => x.c !== 0).sort((a, b) => b.c - a.c);
  const total = somar(ordenadas.map((x) => x.c));
  const fatia = (id: string | null, nome: string, c: number) => ({
    id,
    nome,
    valor: reais(c),
    participacao: total ? c / total : 0,
  });
  const primeiras = ordenadas.slice(0, maximo).map((x) => fatia(x.conta.id, `${x.conta.codigo} ${x.conta.nome}`, x.c));
  const resto = ordenadas.slice(maximo);
  if (resto.length) primeiras.push(fatia(null, `Outras ${resto.length} contas`, somar(resto.map((x) => x.c))));
  return primeiras;
}

export type MaiorDespesa = { lancamento: Lancamento; valor: number };

// Os lançamentos com a maior parte em despesa (só a parte do rateio que é despesa).
export function maioresDespesas(lista: Parcela[], maximo = 8): MaiorDespesa[] {
  const porLancamento = new Map<string, { lancamento: Lancamento; c: number }>();
  for (const p of lista) {
    if (!(SECOES_DESPESA as readonly number[]).includes(p.conta.dre_secao ?? 0)) continue;
    const x = porLancamento.get(p.lancamento.id) ?? { lancamento: p.lancamento, c: 0 };
    x.c -= p.centavos;
    porLancamento.set(p.lancamento.id, x);
  }
  return [...porLancamento.values()]
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c)
    .slice(0, maximo)
    .map((x) => ({ lancamento: x.lancamento, valor: reais(x.c) }));
}

// Variação contra o período anterior. Sem base (anterior zero), o percentual fica vazio.
export function variacao(atual: number, anterior: number) {
  const diferenca = reais(centavos(atual) - centavos(anterior));
  return { diferenca, percentual: anterior === 0 ? null : diferenca / Math.abs(anterior) };
}

// Período anterior de mesmo tamanho, em meses: "2026-07".."2026-09" → "2026-04".."2026-06".
export function periodoAnterior(de: string, ate: string) {
  const mesesDe = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
  const n = mesesDe(ate) - mesesDe(de) + 1;
  const texto = (m: number) => `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
  return { de: texto(mesesDe(de) - n), ate: texto(mesesDe(de) - 1) };
}

// ---------------------------------------------------------------------------
// Lista de lançamentos com os mesmos filtros: o "valor na seleção" é a soma das parcelas que passam no filtro,
// então a soma da lista bate com o número do painel que levou até ela.
// ---------------------------------------------------------------------------

export type LancamentoFiltrado = { lancamento: Lancamento; valorSelecao: number; parcial: boolean };

export function filtrarLancamentos(
  lancamentos: Lancamento[],
  contas: ContaPlano[],
  filtros: Filtros,
): LancamentoFiltrado[] {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const selecao = contasDaSelecao(contas, filtros.conta);
  const secoes = filtros.secoes?.length ? new Set(filtros.secoes) : null;
  const saida: LancamentoFiltrado[] = [];
  for (const l of lancamentos) {
    if (filtros.caixa && l.conta_caixa_id !== filtros.caixa) continue;
    if (filtros.tipo && l.direcao !== filtros.tipo) continue;
    const partes = l.rateios.filter((r) => {
      const c = porId.get(r.conta_id);
      if (selecao && !(c && selecao.has(c.id))) return false;
      if (secoes && !(c && secoes.has(c.dre_secao ?? 0))) return false;
      return true;
    });
    if (partes.length === 0) continue;
    const sinal = l.direcao === "entrada" ? 1 : -1;
    const soma = somar(partes.map((r) => centavos(r.valor)));
    saida.push({ lancamento: l, valorSelecao: reais(sinal * soma), parcial: soma !== centavos(l.valor_total) });
  }
  return saida;
}

export const ORDENS = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  maior: "Maior valor",
  menor: "Menor valor",
} as const;
export type Ordem = keyof typeof ORDENS;

export function ordenar(lista: LancamentoFiltrado[], ordem: Ordem, data: (l: Lancamento) => string) {
  const copia = [...lista];
  const porData = (a: LancamentoFiltrado, b: LancamentoFiltrado) => data(a.lancamento).localeCompare(data(b.lancamento));
  const porValor = (a: LancamentoFiltrado, b: LancamentoFiltrado) => Math.abs(a.valorSelecao) - Math.abs(b.valorSelecao);
  if (ordem === "antigos") copia.sort(porData);
  else if (ordem === "maior") copia.sort((a, b) => porValor(b, a));
  else if (ordem === "menor") copia.sort(porValor);
  else copia.sort((a, b) => porData(b, a));
  return copia;
}
