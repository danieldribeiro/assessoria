import { describe, expect, it } from "vitest";
import { emCentavos, lerRateio } from "@/lib/financeiro/rateio";

function formulario(linhas: [string, string][]) {
  const dados = new FormData();
  for (const [conta, valor] of linhas) {
    dados.append("rateio_conta", conta);
    dados.append("rateio_valor", valor);
  }
  return dados;
}

describe("emCentavos", () => {
  it("converte valores com até duas casas", () => {
    expect(emCentavos(10)).toBe(1000);
    expect(emCentavos(0.29)).toBe(29);
    expect(emCentavos(1234.56)).toBe(123456);
  });

  it("recusa mais de duas casas", () => {
    expect(emCentavos(1.234)).toBeNull();
  });
});

describe("lerRateio", () => {
  it("uma linha sem valor leva o total", () => {
    expect(lerRateio(formulario([["c1", ""]]), 15000)).toEqual({ linhas: [{ conta_id: "c1", valor: 150 }] });
  });

  it("várias linhas com soma exata", () => {
    expect(lerRateio(formulario([["c1", "100,10"], ["c2", "49,90"]]), 15000)).toEqual({
      linhas: [
        { conta_id: "c1", valor: 100.1 },
        { conta_id: "c2", valor: 49.9 },
      ],
    });
  });

  it("ignora linhas totalmente vazias", () => {
    expect(lerRateio(formulario([["c1", "150"], ["", ""]]), 15000)).toEqual({ linhas: [{ conta_id: "c1", valor: 150 }] });
  });

  it("recusa soma diferente do total, mesmo por um centavo", () => {
    const r = lerRateio(formulario([["c1", "100"], ["c2", "49,99"]]), 15000);
    expect(r).toEqual({ erro: expect.stringContaining("A soma precisa ser exata") });
  });

  it("recusa valor vazio quando há mais de uma conta", () => {
    expect(lerRateio(formulario([["c1", "100"], ["c2", ""]]), 15000)).toEqual({ erro: "Informe o valor da linha 2 do rateio." });
  });

  it("recusa linha com valor e sem conta", () => {
    expect(lerRateio(formulario([["c1", "100"], ["", "50"]]), 15000)).toEqual({ erro: "Escolha a conta da linha 2 do rateio." });
  });

  it("recusa mais de duas casas, zero e texto inválido", () => {
    expect(lerRateio(formulario([["c1", "150,001"]]), 15000)).toEqual({ erro: expect.stringContaining("mais de duas casas") });
    expect(lerRateio(formulario([["c1", "0"], ["c2", "150"]]), 15000)).toEqual({ erro: expect.stringContaining("maior que zero") });
    expect(lerRateio(formulario([["c1", "15O"]]), 15000)).toEqual({ erro: expect.stringContaining("Valor da linha 1") });
  });

  it("exige ao menos uma conta", () => {
    expect(lerRateio(formulario([]), 15000)).toEqual({ erro: "Escolha ao menos uma conta do plano." });
  });
});
