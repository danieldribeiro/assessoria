import { describe, expect, it } from "vitest";
import { formatarValor } from "@/lib/datas";

// Regressão: a exibição dos valores não muda com o novo leitor de números.
// O Intl separa "R$" do número com espaço sem quebra (U+00A0).
const nbsp = " ";

describe("formatarValor", () => {
  it.each([
    [47.5, "%", "47,5%"],
    [0, "%", "0%"],
    [0, "R$", `R$${nbsp}0,00`],
    [122003.2, "R$", `R$${nbsp}122.003,20`],
    [1240, "qtd", "1.240 qtd"],
    [1234.567, null, "1.234,57"],
  ])("%d com unidade %j vira %j", (valor, unidade, esperado) => {
    expect(formatarValor(valor, unidade)).toBe(esperado);
  });

  it("devolve null sem valor", () => {
    expect(formatarValor(null, "%")).toBeNull();
  });
});
