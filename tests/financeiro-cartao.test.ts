import { describe, expect, it } from "vitest";
import { candidatosFatura, diaNoMes, referenciaDaCompra, totalDaFatura } from "@/lib/financeiro/cartao";
import type { Fatura } from "@/lib/financeiro/dominio";

// Os mesmos cartões dos testes do banco (supabase/testes/0011): as duas contas precisam dar a mesma fatura.
const ca01 = { dia_fechamento: 25, dia_vencimento: 5 };
const ca02 = { dia_fechamento: 3, dia_vencimento: 10 };
const ca04 = { dia_fechamento: 31, dia_vencimento: 10 };

describe("fatura em que a compra cai", () => {
  it("compra antes do fechamento vai para a fatura que fecha no mês", () => {
    expect(referenciaDaCompra(ca01, "2026-09-10")).toBe("2026-10");
    expect(referenciaDaCompra(ca02, "2026-10-02")).toBe("2026-10");
  });
  it("no dia do fechamento ou depois, vai para a seguinte", () => {
    expect(referenciaDaCompra(ca01, "2026-09-25")).toBe("2026-11");
    expect(referenciaDaCompra(ca02, "2026-10-03")).toBe("2026-11");
  });
  it("fechamento no dia 31 usa o último dia do mês curto", () => {
    expect(referenciaDaCompra(ca04, "2026-09-15")).toBe("2026-10");
    expect(referenciaDaCompra(ca04, "2026-09-30")).toBe("2026-11");
    expect(diaNoMes("2026-02", 31)).toBe("2026-02-28");
    expect(diaNoMes("2028-02-10", 30)).toBe("2028-02-29");
  });
  it("vira o ano", () => {
    expect(referenciaDaCompra(ca01, "2026-12-26")).toBe("2027-02");
  });
});

describe("total da fatura", () => {
  it("soma saídas, desconta estornos e ignora canceladas, sem erro de centavos", () => {
    const c = (direcao: "entrada" | "saida", valor_total: number, situacao = "previsto" as const) => ({ direcao, valor_total, situacao });
    expect(totalDaFatura([c("saida", 0.1), c("saida", 0.2), c("entrada", 0.05), { ...c("saida", 99), situacao: "cancelado" }])).toBe(0.25);
  });
});

describe("faturas que explicam uma saída do extrato", () => {
  const fatura = (id: string, extra: Partial<Fatura & { total: number }>) => ({
    id,
    cartao_id: "ca01",
    referencia: "2026-10-01",
    data_fechamento: "2026-09-25",
    data_vencimento: "2026-10-05",
    situacao: "aberta" as const,
    data_pagamento: null,
    valor_pago: null,
    total: 1000,
    ...extra,
  });
  const caixa = new Map([["ca01", "c101"]]);
  const mov = { conta_caixa_id: "c101", data: "2026-10-06", valor: -1000 };

  it("acha a aberta pelo total e a paga pelo valor pago, perto da data", () => {
    const r = candidatosFatura(mov, [fatura("a", {}), fatura("p", { situacao: "paga", data_pagamento: "2026-10-06", valor_pago: 1000, total: 1000 })], caixa, new Set());
    expect(r.map((x) => x.fatura.id)).toEqual(["p", "a"]);
  });
  it("deixa de fora valor diferente, outra conta, entrada, longe da data ou já conciliada", () => {
    expect(candidatosFatura(mov, [fatura("a", { total: 999.99 })], caixa, new Set())).toEqual([]);
    expect(candidatosFatura({ ...mov, conta_caixa_id: "c102" }, [fatura("a", {})], caixa, new Set())).toEqual([]);
    expect(candidatosFatura({ ...mov, valor: 1000 }, [fatura("a", {})], caixa, new Set())).toEqual([]);
    expect(candidatosFatura({ ...mov, data: "2026-11-06" }, [fatura("a", {})], caixa, new Set())).toEqual([]);
    expect(candidatosFatura(mov, [fatura("a", {})], caixa, new Set(["a"]))).toEqual([]);
  });
});
