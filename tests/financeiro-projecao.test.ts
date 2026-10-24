import { describe, expect, it } from "vitest";
import { itensContas } from "@/lib/financeiro/apagar";
import type { ContaPlano, Fatura, Lancamento } from "@/lib/financeiro/dominio";
import { alvoDoMes, estimativa, menorPonto, operacaoDaJanela, projetarDiario, resumirProjecao } from "@/lib/financeiro/projecao";

const HOJE = "2026-10-29";

function conta(id: string, dre_secao: number | null) {
  return { id, dre_secao } as ContaPlano;
}
const CONTAS = [conta("venda", 1), conta("taxa", 2), conta("insumo", 5), conta("comissao", 6), conta("aluguel", 8), conta("simples", 3)];

function lanc(id: string, extra: Partial<Lancamento> & { conta?: string }): Lancamento {
  const valor = extra.valor_total ?? 100;
  return {
    id,
    direcao: "saida",
    valor_total: valor,
    conta_caixa_id: "nubank",
    data_competencia: "2026-10-10",
    data_vencimento: null,
    data_liquidacao: null,
    situacao: "realizado",
    descricao: id,
    documento: null,
    juros_nao_segregados: false,
    rateios: [{ conta_id: extra.conta ?? "venda", valor }],
    ...extra,
  };
}

describe("estimativa da operação (média de 28 dias)", () => {
  const janela = [
    lanc("venda", { direcao: "entrada", valor_total: 2800, data_liquidacao: "2026-10-01", conta: "venda" }),
    lanc("venda stone", { direcao: "entrada", valor_total: 1400, data_liquidacao: "2026-10-28", conta: "venda", conta_caixa_id: "stone" }),
    lanc("taxa", { valor_total: 140, data_liquidacao: "2026-10-10", conta: "taxa" }),
    lanc("insumo", { valor_total: 560, data_liquidacao: "2026-10-15", conta: "insumo" }),
    lanc("comissao", { valor_total: 28, data_liquidacao: "2026-10-20", conta: "comissao" }),
    // Fora da média: fixo, tributo, previsto, hoje e antes da janela.
    lanc("aluguel", { valor_total: 2000, data_liquidacao: "2026-10-05", conta: "aluguel" }),
    lanc("simples", { valor_total: 300, data_liquidacao: "2026-10-20", conta: "simples" }),
    lanc("previsto", { direcao: "entrada", valor_total: 999, situacao: "previsto", data_vencimento: "2026-10-20", conta: "venda" }),
    lanc("hoje", { direcao: "entrada", valor_total: 500, data_liquidacao: HOJE, conta: "venda" }),
    lanc("antes", { direcao: "entrada", valor_total: 500, data_liquidacao: "2026-09-30", conta: "venda" }),
  ];

  it("soma vendas menos linhas 2, 5 e 6, só realizados dos 28 dias antes de hoje", () => {
    expect(operacaoDaJanela(janela, CONTAS, "2026-10-01", HOJE)).toBe((2800 + 1400 - 140 - 560 - 28) * 100);
  });

  it("com 27 dias de histórico não há estimativa; com 28 há", () => {
    expect(operacaoDaJanela(janela, CONTAS, "2026-10-01", "2026-10-28")).toBeNull();
    expect(operacaoDaJanela(janela, CONTAS, "2026-10-01", "2026-10-29")).not.toBeNull();
    expect(operacaoDaJanela(janela, CONTAS, null, HOJE)).toBeNull();
  });

  it("filtro por caixa usa só os lançamentos daquele caixa", () => {
    expect(operacaoDaJanela(janela, CONTAS, "2026-10-01", HOJE, "stone")).toBe(140000);
  });

  it("estimativa proporcional aos dias, arredondada no centavo", () => {
    expect(estimativa(347200, 2)).toBe(248);
    expect(estimativa(100, 1)).toBe(0.04);
    expect(estimativa(-280000, 7)).toBe(-700);
  });
});

describe("saldo projetado", () => {
  const fatura: Fatura = {
    id: "f1",
    cartao_id: "k1",
    referencia: "2026-11-01",
    data_fechamento: "2026-11-03",
    data_vencimento: "2026-11-10",
    situacao: "aberta",
    data_pagamento: null,
    valor_pago: null,
  };
  const previstos = [
    lanc("ar 1/10", { situacao: "previsto", data_vencimento: "2026-09-11", valor_total: 595, conta: "insumo" }),
    lanc("contabilidade", { situacao: "previsto", data_vencimento: "2026-10-30", valor_total: 300, conta: "aluguel" }),
    lanc("energia", { situacao: "previsto", data_vencimento: "2026-10-30", valor_total: 1021.64, conta: "aluguel", conta_caixa_id: "banrisul" }),
    lanc("repasse", { situacao: "previsto", direcao: "entrada", data_vencimento: "2026-10-29", valor_total: 50.01, conta: "venda" }),
    lanc("compra 1", { situacao: "previsto", data_vencimento: "2026-11-10", valor_total: 100.1, fatura_id: "f1", conta: "insumo" }),
    lanc("compra 2", { situacao: "previsto", data_vencimento: "2026-11-10", valor_total: 200.2, fatura_id: "f1", conta: "insumo" }),
  ];
  const itens = itensContas(previstos, [fatura]);

  it("saldo de hoje − a pagar + a receber até a data, com as vencidas, conferido no centavo", () => {
    const r = resumirProjecao(65637.15, itens, HOJE, "2026-10-31", null);
    expect(r.pagar).toBe(1916.64);
    expect(r.receber).toBe(50.01);
    expect(r.soContas).toBe(63770.52);
    expect(r.operacao).toBeNull();
    expect(r.projetado).toBeNull();
  });

  it("soma a estimativa só dos dias depois de hoje", () => {
    const r = resumirProjecao(1000, itens, HOJE, "2026-10-31", 280000);
    expect(r.dias).toBe(2);
    expect(r.operacao).toBe(200);
    expect(r.projetado).toBe(Math.round((r.soContas + 200) * 100) / 100);
  });

  it("a fatura aberta entra uma vez, pelo total, no vencimento dela", () => {
    const r = resumirProjecao(0, itens, HOJE, "2026-11-10", null);
    expect(r.pagar).toBe(1916.64 + 300.3);
  });

  it("filtro por caixa projeta só aquele caixa", () => {
    const r = resumirProjecao(0, itens, HOJE, "2026-10-31", null, "banrisul");
    expect(r.pagar).toBe(1021.64);
    expect(r.receber).toBe(0);
  });

  it("dia a dia: vencida pesa amanhã, o que vence hoje já entra no ponto de hoje", () => {
    const pontos = projetarDiario(1000, itens, HOJE, 12, null);
    expect(pontos).toHaveLength(13);
    expect(pontos[0]).toEqual({ dia: HOJE, soContas: 1050.01, comOperacao: null });
    expect(pontos[1].soContas).toBe(1050.01 - 595 - 300 - 1021.64);
    expect(pontos[12].dia).toBe("2026-11-10");
    expect(pontos[12].soContas).toBe(Math.round((1050.01 - 1916.64 - 300.3) * 100) / 100);
    expect(menorPonto(pontos.map((p) => p.soContas))).toBe(12);
  });

  it("dia a dia com a operação estimada", () => {
    const pontos = projetarDiario(0, [], HOJE, 3, 280000);
    expect(pontos.map((p) => p.comOperacao)).toEqual([0, 100, 200, 300]);
  });

  it("card do painel olha o fim do mês; no último dia, o fim do mês seguinte", () => {
    expect(alvoDoMes("2026-10-24")).toBe("2026-10-31");
    expect(alvoDoMes("2026-10-31")).toBe("2026-11-30");
  });
});

describe("eixo do gráfico de projeção", () => {
  it("sem o zero, o eixo fica em volta dos saldos", async () => {
    const { escala } = await import("@/components/graficos");
    expect(escala(63125.51, 65637.15, 4, false)).toEqual({ lo: 63000, hi: 66000, marcas: [63000, 64000, 65000, 66000] });
    expect(escala(1000, 1000, 4, false).lo).toBeLessThan(1000);
  });
});
