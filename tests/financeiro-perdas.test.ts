import { describe, expect, it } from "vitest";
import { resumoPerdas, rotuloMotivo, valorPerda } from "@/lib/financeiro/perdas";

describe("perdas de estoque", () => {
  it("valoriza pela quantidade × custo gravado, em centavos", () => {
    expect(valorPerda({ quantidade: 2.5, custo_unitario: 5.99 })).toBe(1498);
    expect(valorPerda({ quantidade: 3, custo_unitario: null })).toBe(0);
  });

  it("soma por motivo, na ordem da lista, e conta as que ficaram sem custo", () => {
    const r = resumoPerdas([
      { quantidade: 1, custo_unitario: 10, motivo: "quebra" },
      { quantidade: 2, custo_unitario: 4, motivo: "vencido" },
      { quantidade: 1, custo_unitario: 1.5, motivo: "vencido" },
      { quantidade: 1, custo_unitario: null, motivo: "outro" },
    ]);
    expect(r.total).toBe(1950);
    expect(r.semCusto).toBe(1);
    expect(r.porMotivo).toEqual([
      { motivo: "vencido", rotulo: "Vencido", valor: 950 },
      { motivo: "quebra", rotulo: "Quebra ou dano", valor: 1000 },
      { motivo: "outro", rotulo: "Outro", valor: 0 },
    ]);
    expect(rotuloMotivo("cortesia")).toBe("Cortesia");
  });
});
