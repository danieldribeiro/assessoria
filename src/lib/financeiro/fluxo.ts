// Fluxo de caixa: árvore do plano de contas com subtotais por mês, separada por atividade (plano v2, seção 3.2).
// Regras puras, sem banco. Os valores são somados em centavos para não acumular erro de ponto flutuante.
import { ATIVIDADES, compararCodigo, type Atividade, type ContaPlano } from "@/lib/financeiro/dominio";

export type MovimentoConta = { conta_id: string; mes: string; entradas: number; saidas: number };

export type LinhaFluxo = {
  id: string;
  codigo: string;
  nome: string;
  nivel: number;
  grupo: boolean;
  ativa: boolean;
  valores: number[]; // um por mês, entradas − saídas
  total: number;
};

export type SecaoFluxo = { atividade: Atividade; linhas: LinhaFluxo[]; valores: number[]; total: number };

export type Fluxo = {
  meses: string[];
  secoes: SecaoFluxo[];
  entradas: number[];
  saidas: number[];
  variacao: number[];
  total: { entradas: number; saidas: number; variacao: number };
  // Movimento em conta que não aparece em nenhuma atividade. O banco não deixa isso acontecer;
  // se acontecer, a tela mostra o valor em vez de escondê-lo.
  foraDasAtividades: number;
};

const centavos = (v: number) => Math.round(Number(v) * 100);
const reais = (c: number) => c / 100;

// "2026-09" → ["2026-09-01", ...] até "2026-11" inclusive.
export function mesesEntre(de: string, ate: string) {
  const meses: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [af, mf] = ate.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    meses.push(`${a}-${String(m).padStart(2, "0")}-01`);
    if (++m > 12) {
      m = 1;
      a++;
    }
    if (meses.length > 120) break;
  }
  return meses;
}

export function ultimoDiaDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function diaAnterior(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d - 1));
  return data.toISOString().slice(0, 10);
}

export function montarFluxo(contas: ContaPlano[], movimentos: MovimentoConta[], meses: string[]): Fluxo {
  const indiceMes = new Map(meses.map((m, i) => [m, i]));
  const porConta = new Map<string, number[]>();
  const entradas = meses.map(() => 0);
  const saidas = meses.map(() => 0);
  for (const mv of movimentos) {
    const i = indiceMes.get(mv.mes.slice(0, 10));
    if (i === undefined) continue;
    const valores = porConta.get(mv.conta_id) ?? meses.map(() => 0);
    valores[i] += centavos(mv.entradas) - centavos(mv.saidas);
    porConta.set(mv.conta_id, valores);
    entradas[i] += centavos(mv.entradas);
    saidas[i] += centavos(mv.saidas);
  }

  const filhos = new Map<string | null, ContaPlano[]>();
  for (const c of contas) {
    const irmas = filhos.get(c.conta_pai_id) ?? [];
    irmas.push(c);
    filhos.set(c.conta_pai_id, irmas);
  }
  for (const irmas of filhos.values()) irmas.sort((a, b) => a.ordem - b.ordem || compararCodigo(a.codigo, b.codigo));

  const usadas = new Set<string>();
  const secoes = ATIVIDADES.map((atividade) => {
    const linhas: LinhaFluxo[] = [];
    // Devolve os valores do ramo nesta atividade, ou null se nada do ramo aparece nela.
    function visitar(conta: ContaPlano, nivel: number): number[] | null {
      if (conta.tipo === "analitica") {
        if (conta.comportamento_caixa !== atividade) return null;
        const valores = porConta.get(conta.id);
        // Conta inativa só aparece se teve movimento no período.
        if (!conta.ativa && !valores) return null;
        const v = valores ?? meses.map(() => 0);
        if (valores) usadas.add(conta.id);
        linhas.push(linha(conta, nivel, v));
        return v;
      }
      const posicao = linhas.length;
      const soma = meses.map(() => 0);
      let algum = false;
      for (const filha of filhos.get(conta.id) ?? []) {
        const v = visitar(filha, nivel + 1);
        if (!v) continue;
        algum = true;
        v.forEach((x, i) => (soma[i] += x));
      }
      if (!algum) return null;
      linhas.splice(posicao, 0, linha(conta, nivel, soma));
      return soma;
    }
    const valores = meses.map(() => 0);
    for (const raiz of filhos.get(null) ?? []) {
      const v = visitar(raiz, 0);
      v?.forEach((x, i) => (valores[i] += x));
    }
    return { atividade, linhas: linhas.map(emReais), valores: valores.map(reais), total: reais(somar(valores)) };
  });

  let foraDasAtividades = 0;
  for (const [id, valores] of porConta) if (!usadas.has(id)) foraDasAtividades += somar(valores);

  const variacao = entradas.map((e, i) => e - saidas[i]);
  return {
    meses,
    secoes,
    entradas: entradas.map(reais),
    saidas: saidas.map(reais),
    variacao: variacao.map(reais),
    total: { entradas: reais(somar(entradas)), saidas: reais(somar(saidas)), variacao: reais(somar(variacao)) },
    foraDasAtividades: reais(foraDasAtividades),
  };
}

function somar(valores: number[]) {
  return valores.reduce((a, b) => a + b, 0);
}

function linha(c: ContaPlano, nivel: number, valores: number[]): LinhaFluxo {
  return { id: c.id, codigo: c.codigo, nome: c.nome, nivel, grupo: c.tipo === "grupo", ativa: c.ativa, valores: [...valores], total: somar(valores) };
}

function emReais(l: LinhaFluxo): LinhaFluxo {
  return { ...l, valores: l.valores.map(reais), total: reais(l.total) };
}

// Conferência do período: saldo inicial + saldos de contas abertas no período + entradas − saídas = saldo final.
// As transferências entre contas da mesma empresa se anulam no total.
export function conferirSaldos({
  saldoAntes,
  aberturas,
  variacao,
  saldoFinal,
}: {
  saldoAntes: number;
  aberturas: number;
  variacao: number;
  saldoFinal: number;
}) {
  const esperado = centavos(saldoAntes) + centavos(aberturas) + centavos(variacao);
  const diferenca = reais(centavos(saldoFinal) - esperado);
  return { esperado: reais(esperado), diferenca, confere: diferenca === 0 };
}
