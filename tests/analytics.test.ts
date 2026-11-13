import { describe, expect, it } from "vitest";
import { limparUrlAnalytics } from "@/lib/analytics";

describe("limparUrlAnalytics", () => {
  it("tira parâmetros e o trecho depois de #", () => {
    expect(limparUrlAnalytics("https://axis.app/empresas?busca=GoCoffee")).toBe("https://axis.app/empresas");
    expect(limparUrlAnalytics("https://axis.app/auth/confirmar?token_hash=abc&type=magiclink#x")).toBe(
      "https://axis.app/auth/confirmar",
    );
  });

  it("troca ids por :id", () => {
    expect(
      limparUrlAnalytics("https://axis.app/central/e1cebce1-1234-4abc-9def-0123456789ab/financeiro?aba=dre&de=2026-10-01"),
    ).toBe("https://axis.app/central/:id/financeiro");
  });

  it("aguenta endereço relativo", () => {
    expect(limparUrlAnalytics("/empresas/E1CEBCE1-1234-4ABC-9DEF-0123456789AB?x=1")).toBe("/empresas/:id");
  });
});
