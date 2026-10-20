import { describe, expect, it } from "vitest";
import { lerNumeroBR, mensagemNumeroInvalido, paraCampoBR } from "@/lib/numeros";

describe("lerNumeroBR", () => {
  it.each([
    ["0", 0],
    ["47", 47],
    ["47,5", 47.5],
    ["0,475", 0.475],
    ["1.240", 1240],
    ["47.500", 47500],
    ["1.234,56", 1234.56],
    ["122.003,2", 122003.2],
    ["1.000.000", 1000000],
    ["-12,3", -12.3],
    ["-1.240", -1240],
    ["  47,5  ", 47.5],
  ])("aceita %j como %d", (entrada, valor) => {
    expect(lerNumeroBR(entrada)).toEqual({ estado: "valido", valor });
  });

  it.each([null, undefined, "", "   "])("trata %j como vazio", (entrada) => {
    expect(lerNumeroBR(entrada)).toEqual({ estado: "vazio" });
  });

  it.each([
    "47.5", // ponto decimal: ambíguo
    "1.24", // milhar com menos de três dígitos
    "1.2345",
    "12.34.567",
    ",5",
    "5,",
    "1,2,3",
    "1,234.56", // padrão americano
    "47,5%",
    "R$ 10",
    "10 qtd",
    "não lançar",
    "+5",
    "−5", // sinal de menos tipográfico, não hífen
    "- 5",
    "5-",
    "1 240",
    "1e3",
    "Infinity",
    "NaN",
    "0x10",
  ])("recusa %j", (entrada) => {
    expect(lerNumeroBR(entrada)).toEqual({ estado: "invalido", texto: entrada.trim() });
  });
});

describe("paraCampoBR", () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])("escreve %j como vazio", (valor) => {
    expect(paraCampoBR(valor)).toBe("");
  });

  it.each([
    [47.5, "47,5"],
    [0, "0"],
    [-12.3, "-12,3"],
    [1240, "1240"],
    [122003.2, "122003,2"],
    [0.475, "0,475"],
    [1234.56, "1234,56"],
    [0.0000001, "0,0000001"],
  ])("escreve %d como %j e lê de volta o mesmo valor", (valor, campo) => {
    expect(paraCampoBR(valor)).toBe(campo);
    expect(lerNumeroBR(paraCampoBR(valor))).toEqual({ estado: "valido", valor });
  });

  it("aceita o valor numérico que o banco devolve como texto", () => {
    expect(paraCampoBR("47.5" as unknown as number)).toBe("47,5");
  });
});

describe("mensagemNumeroInvalido", () => {
  it("nomeia o campo, repete o texto e mostra os formatos aceitos", () => {
    const msg = mensagemNumeroInvalido("Valor", "47.5");
    expect(msg).toContain("Valor inválido");
    expect(msg).toContain("“47.5”");
    expect(msg).toContain("47,5 · 1.240 · 1.234,56");
  });
});
