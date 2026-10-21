import { describe, expect, it } from "vitest";
import type { ContaPlano, Lancamento } from "@/lib/financeiro/dominio";
import {
  contasDaSelecao,
  despesasPorConta,
  filtrarLancamentos,
  maioresDespesas,
  montarDre,
  ordenar,
  parcelas,
  periodoAnterior,
  resumir,
  seriesMensais,
  variacao,
} from "@/lib/financeiro/painel";
import { escala } from "@/components/graficos";

function conta(id: string, codigo: string, pai: string | null, extra: Partial<ContaPlano> = {}): ContaPlano {
  const analitica = extra.tipo !== "grupo";
  return {
    id,
    empresa_id: "e1",
    conta_pai_id: pai,
    codigo,
    nome: id,
    descricao: null,
    tipo: analitica ? "analitica" : "grupo",
    natureza: null,
    classificacao: null,
    comportamento_caixa: analitica ? "operacional" : null,
    dre_secao: null,
    custo_cmv: false,
    ordem: 0,
    ativa: true,
    ...extra,
  };
}

// Plano de uma clínica: receitas (1), deduções (2), impostos (3), custos (5), despesas variáveis (6),
// operacionais (8), financeiro (10), IR (11) e duas contas fora da DRE.
const plano = [
  conta("rec", "1", null, { tipo: "grupo" }),
  conta("consultas", "1.01", "rec", { dre_secao: 1 }),
  conta("proc", "1.02", "rec", { dre_secao: 1 }),
  conta("desp", "3", null, { tipo: "grupo" }),
  conta("taxa_cartao", "3.01", "desp", { dre_secao: 2 }),
  conta("simples", "3.02", "desp", { dre_secao: 3 }),
  conta("material", "3.03", "desp", { dre_secao: 5 }),
  conta("comissao", "3.04", "desp", { dre_secao: 6 }),
  conta("aluguel", "3.05", "desp", { dre_secao: 8 }),
  conta("juros", "3.06", "desp", { dre_secao: 10 }),
  conta("irpj", "3.07", "desp", { dre_secao: 11 }),
  conta("equip", "4.01", null, { comportamento_caixa: "investimento" }),
  conta("emprestimo", "5.01", null, { comportamento_caixa: "financiamento" }),
];

let seq = 0;
function lanc(
  direcao: "entrada" | "saida",
  rateios: [string, number][],
  datas: { competencia: string; liquidacao?: string; vencimento?: string },
  extra: Partial<Lancamento> = {},
): Lancamento {
  const valor = rateios.reduce((a, [, v]) => a + v, 0);
  return {
    id: `l${++seq}`,
    direcao,
    valor_total: Math.round(valor * 100) / 100,
    conta_caixa_id: "banco",
    data_competencia: datas.competencia,
    data_vencimento: datas.vencimento ?? null,
    data_liquidacao: datas.liquidacao ?? null,
    situacao: datas.liquidacao ? "realizado" : "previsto",
    descricao: `lançamento ${seq}`,
    documento: null,
    juros_nao_segregados: false,
    rateios: rateios.map(([conta_id, valor]) => ({ conta_id, valor })),
    ...extra,
  };
}

// Setembro e outubro de 2026.
const lancamentos = [
  // Serviço de setembro recebido em outubro: competência setembro, caixa outubro.
  lanc("entrada", [["consultas", 1000]], { competencia: "2026-09-20", liquidacao: "2026-10-05" }),
  lanc("entrada", [["proc", 2500.1]], { competencia: "2026-09-25", liquidacao: "2026-09-25" }),
  // Previsto em outubro: entra na competência, não no caixa.
  lanc("entrada", [["consultas", 800]], { competencia: "2026-10-10", vencimento: "2026-10-30" }),
  // Rateio entre material (5) e aluguel (8).
  lanc("saida", [["material", 300.3], ["aluguel", 1200]], { competencia: "2026-09-10", liquidacao: "2026-09-10" }),
  lanc("saida", [["taxa_cartao", 50]], { competencia: "2026-09-25", liquidacao: "2026-09-25" }),
  lanc("saida", [["simples", 200]], { competencia: "2026-09-30", liquidacao: "2026-10-20" }),
  lanc("saida", [["comissao", 100]], { competencia: "2026-10-05", liquidacao: "2026-10-05" }),
  lanc("saida", [["juros", 40]], { competencia: "2026-09-30", liquidacao: "2026-10-05" }),
  lanc("saida", [["irpj", 60]], { competencia: "2026-09-30", liquidacao: "2026-10-30" }),
  // Fora da DRE: investimento e empréstimo.
  lanc("saida", [["equip", 5000]], { competencia: "2026-09-15", liquidacao: "2026-09-15" }),
  lanc("entrada", [["emprestimo", 10000]], { competencia: "2026-09-01", liquidacao: "2026-09-01" }),
  // Cancelado: não entra em nada.
  lanc("saida", [["aluguel", 999]], { competencia: "2026-09-10", liquidacao: "2026-09-10" }, { situacao: "cancelado" }),
  // Fora do período.
  lanc("entrada", [["consultas", 7777]], { competencia: "2026-08-31", liquidacao: "2026-08-31" }),
  // Estorno de despesa (entrada numa conta de despesa) reduz a despesa.
  lanc("entrada", [["aluguel", 200]], { competencia: "2026-10-15", liquidacao: "2026-10-15" }),
  // Outra conta de caixa.
  lanc("entrada", [["proc", 400]], { competencia: "2026-10-12", liquidacao: "2026-10-12" }, { conta_caixa_id: "caixinha" }),
];
const meses = ["2026-09-01", "2026-10-01"];
const P = (base: "competencia" | "caixa", filtros = {}) => parcelas(lancamentos, plano, base, filtros, "2026-09-01", "2026-10-31");

describe("parcelas", () => {
  it("competência: previstos e realizados, sem cancelados, pela data de competência", () => {
    const r = resumir(P("competencia"));
    // 1000 + 2500,10 + 800 + 400
    expect(r.faturamento).toBe(4700.1);
    // 300,30 + 1200 + 50 + 200 + 100 − 200 (estorno)
    expect(r.despesas).toBe(1650.3);
    expect(r.resultadoOperacional).toBe(3049.8);
    // − juros 40 − IR 60
    expect(r.resultadoPeriodo).toBe(2949.8);
  });

  it("caixa: só realizados, pela data do pagamento", () => {
    const r = resumir(P("caixa"));
    // O previsto de 800 fica de fora.
    expect(r.faturamento).toBe(3900.1);
    expect(r.despesas).toBe(1650.3);
  });

  it("o mês muda conforme a visão", () => {
    const comp = seriesMensais(P("competencia"), meses);
    const caixa = seriesMensais(P("caixa"), meses);
    expect(comp.map((m) => m.faturamento)).toEqual([3500.1, 1200]);
    expect(caixa.map((m) => m.faturamento)).toEqual([2500.1, 1400]);
    // A soma dos meses bate com o total.
    expect(comp.reduce((a, m) => a + m.resultado, 0)).toBeCloseTo(3049.8, 10);
  });

  it("investimento, financiamento e cancelado nunca viram receita ou despesa", () => {
    const lista = P("caixa");
    expect(lista.some((p) => p.conta.id === "equip")).toBe(true);
    const r = resumir(lista.filter((p) => p.conta.id === "equip" || p.conta.id === "emprestimo"));
    expect(r).toEqual({ faturamento: 0, despesas: 0, resultadoOperacional: 0, resultadoPeriodo: 0 });
    expect(lista.some((p) => p.lancamento.situacao === "cancelado")).toBe(false);
  });

  it("filtros por conta de caixa, tipo, grupo e linha da DRE", () => {
    expect(resumir(P("competencia", { caixa: "caixinha" })).faturamento).toBe(400);
    expect(resumir(P("competencia", { tipo: "saida" })).faturamento).toBe(0);
    // Só saídas: o estorno (entrada) sai da conta, então as despesas sobem 200.
    expect(resumir(P("competencia", { tipo: "saida" })).despesas).toBe(1850.3);
    expect(resumir(P("competencia", { conta: "rec" })).faturamento).toBe(4700.1);
    expect(resumir(P("competencia", { conta: "rec" })).despesas).toBe(0);
    expect(resumir(P("competencia", { secoes: [1] })).despesas).toBe(0);
  });

  it("grupo seleciona as analíticas abaixo dele", () => {
    expect([...contasDaSelecao(plano, "rec")!].sort()).toEqual(["consultas", "proc"]);
    expect([...contasDaSelecao(plano, "aluguel")!]).toEqual(["aluguel"]);
    expect(contasDaSelecao(plano, null)).toBeNull();
  });
});

describe("DRE gerencial", () => {
  const dre = montarDre(P("competencia"), meses);
  const linha = (n: number) => dre.linhas.find((l) => l.numero === n)!;

  it("tem as 12 linhas da v4 e calcula as linhas de resultado", () => {
    expect(dre.linhas.map((l) => l.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(linha(1).total).toBe(4700.1);
    expect(linha(2).total).toBe(-50);
    expect(linha(3).total).toBe(-200);
    expect(linha(4).total).toBe(4450.1);
    expect(linha(5).total).toBe(-300.3);
    expect(linha(6).total).toBe(-100);
    expect(linha(7).total).toBe(4049.8);
    expect(linha(8).total).toBe(-1000);
    expect(linha(9).total).toBe(3049.8);
    expect(linha(10).total).toBe(-40);
    expect(linha(11).total).toBe(-60);
    expect(linha(12).total).toBe(2949.8);
  });

  it("a linha 9 é igual ao resultado operacional do painel e a 12 ao resultado do período", () => {
    const r = resumir(P("competencia"));
    expect(linha(9).total).toBe(r.resultadoOperacional);
    expect(linha(12).total).toBe(r.resultadoPeriodo);
  });

  it("mês a mês e por conta", () => {
    expect(linha(1).valores).toEqual([3500.1, 1200]);
    expect(linha(8).contas).toEqual([{ id: "aluguel", codigo: "3.05", nome: "aluguel", valores: [-1200, 200], total: -1000 }]);
    expect(linha(9).valores.reduce((a, b) => a + b, 0)).toBeCloseTo(linha(9).total, 10);
  });

  it("o que fica fora da DRE aparece separado", () => {
    expect(dre.foraDaDre).toBe(5000);
  });
});

describe("rankings", () => {
  it("despesas por conta, com participação, e o resto em Outras", () => {
    const f = despesasPorConta(P("competencia"), 2);
    expect(f.map((x) => [x.id, x.valor])).toEqual([
      ["aluguel", 1000],
      ["material", 300.3],
      [null, 350],
    ]);
    expect(f.reduce((a, x) => a + x.participacao, 0)).toBeCloseTo(1, 10);
    expect(f[2].nome).toBe("Outras 3 contas");
  });

  it("maiores despesas contam só a parte do rateio que é despesa", () => {
    const m = maioresDespesas(P("competencia"), 3);
    expect(m.map((x) => x.valor)).toEqual([1500.3, 200, 100]);
  });
});

describe("comparação com o período anterior", () => {
  it("período anterior de mesmo tamanho, virando o ano", () => {
    expect(periodoAnterior("2026-07", "2026-09")).toEqual({ de: "2026-04", ate: "2026-06" });
    expect(periodoAnterior("2026-01", "2026-02")).toEqual({ de: "2025-11", ate: "2025-12" });
    expect(periodoAnterior("2026-10", "2026-10")).toEqual({ de: "2026-09", ate: "2026-09" });
  });

  it("variação em valor e percentual, sem dividir por zero", () => {
    expect(variacao(150, 100)).toEqual({ diferenca: 50, percentual: 0.5 });
    expect(variacao(-50, -100)).toEqual({ diferenca: 50, percentual: 0.5 });
    expect(variacao(100, 0)).toEqual({ diferenca: 100, percentual: null });
    expect(variacao(0.3, 0.1).diferenca).toBe(0.2);
  });
});

describe("lista de lançamentos com o mesmo filtro", () => {
  it("o total da lista bate com o número do painel", () => {
    const naBase = lancamentos.filter(
      (l) => l.situacao !== "cancelado" && l.data_competencia >= "2026-09-01" && l.data_competencia <= "2026-10-31",
    );
    const lista = filtrarLancamentos(naBase, plano, { secoes: [2, 3, 5, 6, 8] });
    const total = lista.reduce((a, f) => a + Math.round(f.valorSelecao * 100), 0) / 100;
    expect(-total).toBe(resumir(P("competencia")).despesas);
    // O lançamento com rateio aparece inteiro, marcado como parcial só se parte dele ficou de fora.
    const rateado = lista.find((f) => f.lancamento.rateios.length === 2)!;
    expect(rateado.parcial).toBe(false);
    const soMaterial = filtrarLancamentos(naBase, plano, { conta: "material" });
    expect(soMaterial).toHaveLength(1);
    expect(soMaterial[0]).toMatchObject({ valorSelecao: -300.3, parcial: true });
  });

  it("ordena por data ou valor", () => {
    const lista = filtrarLancamentos(lancamentos.slice(0, 4), plano, {});
    const data = (l: Lancamento) => l.data_competencia;
    expect(ordenar(lista, "maior", data).map((f) => f.valorSelecao)).toEqual([2500.1, -1500.3, 1000, 800]);
    expect(ordenar(lista, "menor", data)[0].valorSelecao).toBe(800);
    expect(ordenar(lista, "recentes", data)[0].lancamento.data_competencia).toBe("2026-10-10");
    expect(ordenar(lista, "antigos", data)[0].lancamento.data_competencia).toBe("2026-09-10");
  });
});

describe("eixo dos gráficos", () => {
  it("marcas redondas que incluem o zero e os extremos", () => {
    expect(escala(0, 4700)).toEqual({ lo: 0, hi: 6000, marcas: [0, 2000, 4000, 6000] });
    const e = escala(-300, 1200);
    expect(e.lo).toBeLessThanOrEqual(-300);
    expect(e.hi).toBeGreaterThanOrEqual(1200);
    expect(e.marcas).toContain(0);
    expect(escala(0, 0)).toEqual({ lo: 0, hi: 1, marcas: [0] });
  });
});
