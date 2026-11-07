import { describe, expect, it } from "vitest";
import { atalhoAtivo, deslocar, lerPeriodo, nomePeriodo, periodoAtalho, somarMeses, textoPeriodo } from "@/lib/financeiro/periodo";

describe("período do financeiro", () => {
  it("anda meses atravessando o ano", () => {
    expect(somarMeses("2026-10", 1)).toBe("2026-11");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-06", -5)).toBe("2026-01");
  });

  it("lê meses, dias e o padrão", () => {
    expect(lerPeriodo(undefined, undefined, "2026-10-22")).toMatchObject({ de: "2026-10", ate: "2026-10", inicio: "2026-10-01", fim: "2026-10-31", emMeses: true });
    expect(lerPeriodo("2026-10-01", "2026-10-05", "2026-10-22")).toMatchObject({ de: "2026-10-01", ate: "2026-10-05", emMeses: false });
    expect(lerPeriodo("2026-10-01", "2026-10-01", "2026-10-22")).toMatchObject({ inicio: "2026-10-01", fim: "2026-10-01" });
    // Dias que fecham meses inteiros voltam à forma de mês.
    expect(lerPeriodo("2026-09-01", "2026-10-31", "2026-10-22")).toMatchObject({ de: "2026-09", ate: "2026-10", emMeses: true });
    // Fora de ordem inverte; data inválida cai no mês de hoje.
    expect(lerPeriodo("2026-10", "2026-08", "2026-10-22")).toMatchObject({ inicio: "2026-08-01", fim: "2026-10-31" });
    expect(lerPeriodo("2026-02-30", undefined, "2026-10-22")).toMatchObject({ de: "2026-10", ate: "2026-10" });
    expect(lerPeriodo("2026-10-05", undefined, "2026-10-22")).toMatchObject({ inicio: "2026-10-05", fim: "2026-10-05" });
  });

  it("lista os meses tocados e o período anterior do mesmo tamanho", () => {
    const dias = lerPeriodo("2026-09-28", "2026-10-03", "2026-10-22");
    expect(dias.meses).toEqual(["2026-09-01", "2026-10-01"]);
    expect(dias.anterior).toMatchObject({ inicio: "2026-09-22", fim: "2026-09-27" });
    const meses = lerPeriodo("2026-06", "2026-10", "2026-10-22");
    expect(meses.anterior).toMatchObject({ inicio: "2026-01-01", fim: "2026-05-31" });
  });

  it("as setas andam o tamanho do período", () => {
    expect(deslocar(lerPeriodo("2026-10", "2026-10", "x"), 1)).toEqual({ de: "2026-11", ate: "2026-11" });
    expect(deslocar(lerPeriodo("2026-06", "2026-10", "x"), -1)).toEqual({ de: "2026-01", ate: "2026-05" });
    expect(deslocar(lerPeriodo("2026-10-01", "2026-10-05", "x"), 1)).toEqual({ de: "2026-10-06", ate: "2026-10-10" });
    expect(deslocar(lerPeriodo("2026-12-31", "2026-12-31", "x"), 1)).toEqual({ de: "2027-01-01", ate: "2027-01-01" });
  });

  it("dá nome ao período", () => {
    expect(nomePeriodo(lerPeriodo("2026-10", "2026-10", "x"))).toBe("Outubro 2026");
    expect(nomePeriodo(lerPeriodo("2026-06", "2026-10", "x"))).toBe("Junho a Outubro 2026");
    expect(nomePeriodo(lerPeriodo("2025-11", "2026-02", "x"))).toBe("Novembro 2025 a Fevereiro 2026");
    expect(nomePeriodo(lerPeriodo("2026-10-01", "2026-10-05", "x"))).toBe("01/10/26 – 05/10/26");
    expect(nomePeriodo(lerPeriodo("2026-10-01", "2026-10-01", "x"))).toBe("01/10/26");
    expect(textoPeriodo("2026-10-01", "2026-10-31")).toBe("out/26");
    expect(textoPeriodo("2026-10-01", "2026-10-05")).toBe("01/10/26 a 05/10/26");
  });

  it("monta os atalhos Mês, YTD e 1 ano a partir de hoje", () => {
    expect(periodoAtalho("mes", "2026-11-07")).toEqual({ de: "2026-11", ate: "2026-11" });
    expect(periodoAtalho("ytd", "2026-11-07")).toEqual({ de: "2026-01", ate: "2026-11" });
    expect(periodoAtalho("12m", "2026-11-07")).toEqual({ de: "2025-12", ate: "2026-11" });
    expect(periodoAtalho("12m", "2026-01-15")).toEqual({ de: "2025-02", ate: "2026-01" });
  });

  it("reconhece o atalho do período em uso", () => {
    const hoje = "2026-11-07";
    const ler = (de: string, ate: string) => lerPeriodo(de, ate, hoje);
    expect(atalhoAtivo(ler("2026-11", "2026-11"), hoje)).toBe("mes");
    expect(atalhoAtivo(ler("2026-08", "2026-08"), hoje)).toBe("mes");
    expect(atalhoAtivo(ler("2026-01", "2026-11"), hoje)).toBe("ytd");
    expect(atalhoAtivo(ler("2025-12", "2026-11"), hoje)).toBe("12m");
    expect(atalhoAtivo(ler("2026-06", "2026-10"), hoje)).toBeNull();
    expect(atalhoAtivo(ler("2026-10-01", "2026-10-05"), hoje)).toBeNull();
    // Em janeiro, YTD é um mês só: fica "Mês".
    expect(atalhoAtivo(lerPeriodo("2026-01", "2026-01", "2026-01-10"), "2026-01-10")).toBe("mes");
  });
});
