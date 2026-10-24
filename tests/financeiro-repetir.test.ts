import { describe, expect, it } from "vitest";
import { datasDaSerie, somarMesesData } from "@/lib/financeiro/repetir";

describe("repetir todo mês", () => {
  it("mantém o dia, ou usa o último dia de meses mais curtos", () => {
    expect(somarMesesData("2026-10-28", 1)).toBe("2026-11-28");
    expect(somarMesesData("2027-01-31", 1)).toBe("2027-02-28");
    expect(somarMesesData("2027-01-31", 2)).toBe("2027-03-31");
    expect(somarMesesData("2027-12-15", 1)).toBe("2028-01-15");
    expect(somarMesesData("2028-01-30", 1)).toBe("2028-02-29");
  });

  it("monta a série a começar pelo mês informado, com a competência andando junto", () => {
    const serie = datasDaSerie("2026-10-30", "2026-10-01", 3);
    expect(serie).toEqual([
      { vencimento: "2026-10-30", competencia: "2026-10-01" },
      { vencimento: "2026-11-30", competencia: "2026-11-01" },
      { vencimento: "2026-12-30", competencia: "2026-12-01" },
    ]);
    expect(datasDaSerie("2026-10-30", null, 2).map((d) => d.competencia)).toEqual([null, null]);
  });
});
