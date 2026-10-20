import { describe, expect, it } from "vitest";
import type { ContaPlano } from "@/lib/financeiro/dominio";
import { conferirSaldos, diaAnterior, mesesEntre, montarFluxo, ultimoDiaDoMes } from "@/lib/financeiro/fluxo";

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

// Plano: 1 Receitas (1.1 Consultas, 1.2 Procedimentos), 2 Despesas (2.1 Aluguel, 2.2 Equipamento [investimento]),
// 3 Empréstimo [financiamento], 4 Transferência interna.
const plano = [
  conta("rec", "1", null, { tipo: "grupo" }),
  conta("consultas", "1.1", "rec"),
  conta("proc", "1.2", "rec"),
  conta("desp", "2", null, { tipo: "grupo" }),
  conta("aluguel", "2.1", "desp"),
  conta("equip", "2.2", "desp", { comportamento_caixa: "investimento" }),
  conta("emprestimo", "3", null, { comportamento_caixa: "financiamento" }),
  conta("antiga", "1.3", "rec", { ativa: false }),
];
const meses = ["2026-09-01", "2026-10-01"];

describe("datas do período", () => {
  it("lista os meses entre dois meses, virando o ano", () => {
    expect(mesesEntre("2026-11", "2027-02")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(mesesEntre("2026-10", "2026-10")).toEqual(["2026-10-01"]);
    expect(mesesEntre("2026-10", "2026-09")).toEqual([]);
  });

  it("último dia do mês e dia anterior, inclusive fevereiro bissexto", () => {
    expect(ultimoDiaDoMes("2028-02-01")).toBe("2028-02-29");
    expect(ultimoDiaDoMes("2026-02-01")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2026-12-01")).toBe("2026-12-31");
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
    expect(diaAnterior("2026-03-01")).toBe("2026-02-28");
  });
});

describe("montarFluxo", () => {
  const fluxo = montarFluxo(
    plano,
    [
      { conta_id: "consultas", mes: "2026-09-01", entradas: 1000.1, saidas: 0 },
      { conta_id: "consultas", mes: "2026-10-01", entradas: 2000.2, saidas: 0 },
      { conta_id: "proc", mes: "2026-10-01", entradas: 500, saidas: 0 },
      { conta_id: "aluguel", mes: "2026-09-01", entradas: 0, saidas: 300.3 },
      { conta_id: "equip", mes: "2026-10-01", entradas: 0, saidas: 1200 },
      { conta_id: "emprestimo", mes: "2026-10-01", entradas: 5000, saidas: 100 },
      { conta_id: "consultas", mes: "2026-08-01", entradas: 999, saidas: 0 }, // fora do período
    ],
    meses,
  );
  const [operacional, investimento, financiamento] = fluxo.secoes;
  const linha = (s: typeof operacional, id: string) => s.linhas.find((l) => l.id === id);

  it("separa as três atividades", () => {
    expect(fluxo.secoes.map((s) => s.atividade)).toEqual(["operacional", "investimento", "financiamento"]);
  });

  it("monta a árvore com o grupo antes das filhas e subtotal por mês", () => {
    expect(operacional.linhas.map((l) => [l.codigo, l.nivel])).toEqual([
      ["1", 0],
      ["1.1", 1],
      ["1.2", 1],
      ["2", 0],
      ["2.1", 1],
    ]);
    expect(linha(operacional, "rec")).toMatchObject({ grupo: true, valores: [1000.1, 2500.2], total: 3500.3 });
    expect(operacional.valores).toEqual([699.8, 2500.2]);
    expect(operacional.total).toBe(3200);
  });

  it("o grupo só soma as filhas que aparecem naquela atividade, sem contar duas vezes", () => {
    expect(linha(operacional, "desp")).toMatchObject({ valores: [-300.3, 0], total: -300.3 });
    expect(linha(investimento, "desp")).toMatchObject({ valores: [0, -1200], total: -1200 });
    expect(linha(investimento, "aluguel")).toBeUndefined();
    expect(financiamento.linhas.map((l) => l.id)).toEqual(["emprestimo"]);
    expect(financiamento.total).toBe(4900);
  });

  it("conta inativa sem movimento não aparece", () => {
    expect(linha(operacional, "antiga")).toBeUndefined();
  });

  it("conta inativa com movimento aparece", () => {
    const f = montarFluxo(plano, [{ conta_id: "antiga", mes: "2026-09-01", entradas: 10, saidas: 0 }], meses);
    expect(f.secoes[0].linhas.find((l) => l.id === "antiga")).toMatchObject({ ativa: false, total: 10 });
  });

  it("totais batem com a soma das atividades e ignoram meses fora do período", () => {
    expect(fluxo.entradas).toEqual([1000.1, 7500.2]);
    expect(fluxo.saidas).toEqual([300.3, 1300]);
    expect(fluxo.variacao).toEqual([699.8, 6200.2]);
    expect(fluxo.total).toEqual({ entradas: 8500.3, saidas: 1600.3, variacao: 6900 });
    expect(fluxo.secoes.reduce((a, s) => a + s.total, 0)).toBeCloseTo(fluxo.total.variacao, 2);
    expect(fluxo.foraDasAtividades).toBe(0);
  });

  it("soma em centavos, sem erro de ponto flutuante", () => {
    const f = montarFluxo(
      plano,
      [
        { conta_id: "consultas", mes: "2026-09-01", entradas: 0.1, saidas: 0 },
        { conta_id: "proc", mes: "2026-09-01", entradas: 0.2, saidas: 0 },
      ],
      meses,
    );
    expect(f.total.entradas).toBe(0.3);
  });

  it("mostra o movimento em conta fora das atividades em vez de escondê-lo", () => {
    const comSemCaixa = [...plano, conta("ajuste", "9", null, { comportamento_caixa: "sem_caixa" })];
    const f = montarFluxo(comSemCaixa, [{ conta_id: "ajuste", mes: "2026-09-01", entradas: 0, saidas: 42 }], meses);
    expect(f.foraDasAtividades).toBe(-42);
    expect(f.secoes.every((s) => s.linhas.every((l) => l.id !== "ajuste"))).toBe(true);
  });

  it("aceita os valores numéricos como texto, como o banco devolve", () => {
    const f = montarFluxo(plano, [{ conta_id: "consultas", mes: "2026-09-01", entradas: "12.34" as unknown as number, saidas: 0 }], meses);
    expect(f.total.entradas).toBe(12.34);
  });
});

describe("conferirSaldos", () => {
  it("confere quando saldo inicial + aberturas + resultado = saldo final", () => {
    expect(conferirSaldos({ saldoAntes: 1000.1, aberturas: 200.2, variacao: -50.3, saldoFinal: 1150 })).toEqual({
      esperado: 1150,
      diferenca: 0,
      confere: true,
    });
  });

  it("mostra a diferença quando não confere", () => {
    expect(conferirSaldos({ saldoAntes: 100, aberturas: 0, variacao: 10, saldoFinal: 109.99 })).toEqual({
      esperado: 110,
      diferenca: -0.01,
      confere: false,
    });
  });
});
