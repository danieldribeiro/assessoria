import { describe, expect, it } from "vitest";
import { colarMoeda, formatarCentavos, mascararMoeda, moedaParaCampo } from "@/lib/moeda";
import { lerNumeroBR } from "@/lib/numeros";

// Simula a digitação: cada tecla acrescenta um caractere ao texto que já está no campo.
function digitar(teclas: string, negativo = false) {
  let campo = "";
  for (const t of teclas) campo = mascararMoeda(campo + t, campo, negativo);
  return campo;
}

function apagar(campo: string, vezes: number) {
  for (let i = 0; i < vezes; i++) campo = mascararMoeda(campo.slice(0, -1), campo);
  return campo;
}

describe("mascararMoeda", () => {
  it("os dígitos entram pela direita", () => {
    expect(digitar("1")).toBe("0,01");
    expect(digitar("150")).toBe("1,50");
    expect(digitar("150000")).toBe("1.500,00");
    expect(digitar("123456789")).toBe("1.234.567,89");
  });

  it("aceita zero", () => {
    expect(digitar("0")).toBe("0,00");
    expect(digitar("000")).toBe("0,00");
  });

  it("apagar tira o último dígito e, no fim, esvazia o campo", () => {
    expect(apagar("1.500,00", 1)).toBe("150,00");
    expect(apagar("1,50", 2)).toBe("0,01");
    expect(apagar("0,01", 1)).toBe("");
    expect(apagar("0,00", 1)).toBe("");
  });

  it("ignora letras e símbolos", () => {
    expect(mascararMoeda("12a3", "0,12")).toBe("1,23");
    expect(mascararMoeda("abc", "")).toBe("");
  });

  it("sinal de menos só quando o campo permite, e cada “-” troca o sinal", () => {
    expect(digitar("-12345")).toBe("123,45");
    expect(digitar("-12345", true)).toBe("-123,45");
    expect(mascararMoeda("-123,45-", "-123,45", true)).toBe("123,45");
    expect(digitar("-", true)).toBe("-");
  });

  it("limita a 13 dígitos (cabe no banco)", () => {
    expect(digitar("12345678901234567")).toBe("12.345.678.901,23");
  });

  it("o texto mascarado é lido pelo servidor com o mesmo valor", () => {
    for (const [teclas, valor] of [["150000", 1500], ["1", 0.01], ["123456789", 1234567.89], ["0", 0]] as const) {
      expect(lerNumeroBR(digitar(teclas))).toEqual({ estado: "valido", valor });
    }
    expect(lerNumeroBR(digitar("-5050", true))).toEqual({ estado: "valido", valor: -50.5 });
  });
});

describe("colarMoeda", () => {
  it("lê valores colados no padrão brasileiro, com ou sem R$", () => {
    expect(colarMoeda("R$ 1.234,56")).toBe("1.234,56");
    expect(colarMoeda("1234,5")).toBe("1.234,50");
    expect(colarMoeda("80")).toBe("80,00");
  });

  it("recusa o que não consegue ler, para cair na máscara comum", () => {
    expect(colarMoeda("12.5")).toBeNull();
    expect(colarMoeda("abc")).toBeNull();
    expect(colarMoeda("-80")).toBeNull();
    expect(colarMoeda("-80", true)).toBe("-80,00");
  });
});

describe("moedaParaCampo e formatarCentavos", () => {
  it("mostra o valor guardado com duas casas", () => {
    expect(moedaParaCampo(1500)).toBe("1.500,00");
    expect(moedaParaCampo("245.3")).toBe("245,30");
    expect(moedaParaCampo(-12.5)).toBe("-12,50");
    expect(moedaParaCampo(0)).toBe("0,00");
    expect(moedaParaCampo(null)).toBe("");
    expect(formatarCentavos(-1)).toBe("-0,01");
  });
});
