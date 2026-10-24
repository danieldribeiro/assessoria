import { describe, expect, it } from "vitest";
import { agruparContas, diasDeAtraso, grupoDoVencimento, limiteContas } from "@/lib/financeiro/apagar";
import type { Fatura, Lancamento } from "@/lib/financeiro/dominio";

const HOJE = "2026-10-24";

function lanc(id: string, vencimento: string, valor: number, extra: Partial<Lancamento> = {}): Lancamento {
  return {
    id,
    direcao: "saida",
    valor_total: valor,
    conta_caixa_id: "cx",
    data_competencia: vencimento,
    data_vencimento: vencimento,
    data_liquidacao: null,
    situacao: "previsto",
    descricao: id,
    documento: null,
    juros_nao_segregados: false,
    rateios: [{ conta_id: "c1", valor }],
    ...extra,
  };
}

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

describe("contas a pagar e a receber", () => {
  it("limite é o fim do sexto mês depois do atual", () => {
    expect(limiteContas(HOJE)).toBe("2027-04-30");
  });

  it("dias de atraso contam a partir do dia seguinte ao vencimento", () => {
    expect(diasDeAtraso("2026-09-11", HOJE)).toBe(43);
    expect(diasDeAtraso("2026-10-23", HOJE)).toBe(1);
    expect(diasDeAtraso(HOJE, HOJE)).toBe(0);
    expect(diasDeAtraso("2026-10-30", HOJE)).toBe(0);
  });

  it("separa vencidas, próximos 7 dias, resto do mês e meses seguintes", () => {
    expect(grupoDoVencimento("2026-10-23", HOJE)).toBe("vencidas");
    expect(grupoDoVencimento(HOJE, HOJE)).toBe("semana");
    expect(grupoDoVencimento("2026-10-30", HOJE)).toBe("semana");
    expect(grupoDoVencimento("2026-10-31", HOJE)).toBe("mes");
    expect(grupoDoVencimento("2026-12-05", HOJE)).toBe("mes:2026-12");
    expect(grupoDoVencimento("2027-05-01", HOJE)).toBeNull();
  });

  it("agrupa, ordena e soma em centavos", () => {
    const grupos = agruparContas(
      [
        lanc("energia", "2026-10-30", 1021.64),
        lanc("ar", "2026-09-11", 595),
        lanc("contabilidade", "2026-10-28", 300),
        lanc("venda", "2026-10-28", 0.1, { direcao: "entrada" }),
        lanc("outra venda", "2026-10-29", 0.2, { direcao: "entrada" }),
        lanc("longe", "2027-06-10", 50),
        lanc("dez", "2026-12-10", 595),
      ],
      [],
      HOJE,
    );
    expect(grupos.map((g) => g.chave)).toEqual(["vencidas", "semana", "mes:2026-12"]);
    const semana = grupos[1];
    expect(semana.itens.map((i) => i.id)).toEqual(["contabilidade", "venda", "outra venda", "energia"]);
    expect(semana.pagar).toBe(1321.64);
    expect(semana.receber).toBe(0.3);
    expect(grupos[0].pagar).toBe(595);
  });

  it("compras de uma fatura aberta viram uma linha só, com o total e o vencimento da fatura", () => {
    const grupos = agruparContas(
      [
        lanc("café", "2026-11-10", 100.1, { fatura_id: "f1" }),
        lanc("copos", "2026-11-10", 200.2, { fatura_id: "f1" }),
        lanc("estorno", "2026-11-10", 50, { fatura_id: "f1", direcao: "entrada" }),
      ],
      [fatura],
      HOJE,
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].chave).toBe("mes:2026-11");
    expect(grupos[0].itens).toHaveLength(1);
    const item = grupos[0].itens[0];
    expect(item.tipo).toBe("fatura");
    expect(item.vencimento).toBe("2026-11-10");
    expect(item.direcao).toBe("saida");
    expect(item.valor).toBe(250.3);
    expect(grupos[0].pagar).toBe(250.3);
  });

  it("ignora realizados, cancelados e faturas zeradas", () => {
    const grupos = agruparContas(
      [
        lanc("pago", "2026-10-25", 10, { situacao: "realizado" }),
        lanc("cancelado", "2026-10-25", 10, { situacao: "cancelado" }),
        lanc("compra", "2026-11-10", 30, { fatura_id: "f1" }),
        lanc("estorno", "2026-11-10", 30, { fatura_id: "f1", direcao: "entrada" }),
      ],
      [fatura],
      HOJE,
    );
    expect(grupos).toEqual([]);
  });
});
