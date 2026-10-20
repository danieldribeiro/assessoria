import { describe, expect, it, vi } from "vitest";
import { corDoIndicador, TOLERANCIA_PADRAO, type Indicador } from "@/lib/dominio";

// Linha de base do semáforo atual, antes das mudanças da 0006. Registra o comportamento, não o aprova.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ criarCliente: vi.fn() }));

type Entrada = Parameters<typeof corDoIndicador>[0];
const base: Entrada = { valor: null, ref_min: null, ref_max: null, tolerancia: null, cor_manual: null };
// Aceita texto nas faixas porque o banco devolve numeric como string.
const cor = (i: Record<string, unknown>) => corDoIndicador({ ...base, ...i } as Entrada);

describe("corDoIndicador", () => {
  it("usa folga padrão de 20%", () => {
    expect(TOLERANCIA_PADRAO).toBe(20);
  });

  it("cor manual prevalece sobre a faixa", () => {
    expect(cor({ valor: 50, ref_min: 0, ref_max: 100, cor_manual: "ruim" })).toBe("ruim");
  });

  it("sem faixa ou sem valor, não há cor", () => {
    expect(cor({ valor: 50 })).toBeNull();
    expect(cor({ ref_min: 0, ref_max: 100 })).toBeNull();
  });

  it("faixa com as duas pontas: folga sobre a largura", () => {
    const faixa = { ref_min: 55, ref_max: 65 }; // largura 10, folga 2
    expect(cor({ ...faixa, valor: 60 })).toBe("bom");
    expect(cor({ ...faixa, valor: 55 })).toBe("bom");
    expect(cor({ ...faixa, valor: 66 })).toBe("atencao");
    expect(cor({ ...faixa, valor: 53 })).toBe("atencao");
    expect(cor({ ...faixa, valor: 67.5 })).toBe("ruim");
  });

  it("só máximo: folga sobre o próprio valor", () => {
    expect(cor({ ref_max: 10, valor: 9 })).toBe("bom");
    expect(cor({ ref_max: 10, valor: 12 })).toBe("atencao");
    expect(cor({ ref_max: 10, valor: 12.5 })).toBe("ruim");
  });

  it("só mínimo, com folga própria", () => {
    expect(cor({ ref_min: 100, tolerancia: 5, valor: 96 })).toBe("atencao");
    expect(cor({ ref_min: 100, tolerancia: 5, valor: 94 })).toBe("ruim");
  });

  it("aceita os números que o banco devolve como texto", () => {
    expect(cor({ valor: 60, ref_min: "55", ref_max: "65" })).toBe("bom");
  });
});

describe("comCores", () => {
  it("busca o valor anterior pelo nome do indicador", async () => {
    const { comCores } = await import("@/lib/central");
    const ind = (nome: string, valor: number | null) => ({ ...base, nome, valor }) as unknown as Indicador;
    const [a, b] = comCores([ind("Ticket médio", 10), ind("Novo", 5)], [ind("Ticket médio", 8), ind("Outro", 1)]);
    expect(a.anterior).toBe(8);
    expect(b.anterior).toBeNull();
  });
});
