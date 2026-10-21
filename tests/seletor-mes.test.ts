import { describe, expect, it } from "vitest";
import { nomePeriodo, somarMeses } from "@/app/(app)/empresas/[id]/financeiro/seletor-mes";

describe("seletor de mês", () => {
  it("anda meses atravessando o ano", () => {
    expect(somarMeses("2026-10", 1)).toBe("2026-11");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-06", -5)).toBe("2026-01");
  });
  it("dá nome ao período", () => {
    expect(nomePeriodo("2026-10", "2026-10")).toBe("Outubro 2026");
    expect(nomePeriodo("2026-06", "2026-10")).toBe("Junho a Outubro 2026");
    expect(nomePeriodo("2025-11", "2026-02")).toBe("Novembro 2025 a Fevereiro 2026");
  });
});
