import { describe, expect, it } from "vitest";
import { camposAlterados, camposPreenchidos, doFinanceiro, formatarCampo, juntar, nomeDaLinha, rotuloCampo } from "@/lib/historico";

describe("histórico", () => {
  it("mostra só os campos que mudaram, sem os técnicos", () => {
    const r = camposAlterados(
      { id: "1", valor: 10, nome: "Margem", atualizado_em: "a" },
      { id: "1", valor: 12, nome: "Margem", atualizado_em: "b" },
    );
    expect(r).toEqual([{ campo: "valor", antes: 10, depois: 12 }]);
  });

  it("funciona com o histórico que já vem só com a diferença", () => {
    expect(camposAlterados({ status: "Aberto" }, { status: "Resolvido" })).toEqual([
      { campo: "status", antes: "Aberto", depois: "Resolvido" },
    ]);
  });

  it("linha inteira sem vazios nem campos técnicos", () => {
    expect(camposPreenchidos({ id: "x", titulo: "T", descricao: null, criado_por: "y" })).toEqual([{ campo: "titulo", valor: "T" }]);
  });

  it("formata valores para leitura", () => {
    expect(formatarCampo("x", null)).toBe("vazio");
    expect(formatarCampo("ativa", true)).toBe("Sim");
    expect(formatarCampo("prazo", "2026-11-10")).toBe("10/11/2026");
    expect(formatarCampo("valor_total", 1234.5)).toMatch(/1\.234,50/);
    expect(formatarCampo("responsavel_id", "00000000-0000-0000-0000-0000000000a1", { "00000000-0000-0000-0000-0000000000a1": "Daniel" })).toBe("Daniel");
    expect(formatarCampo("rateio", [{ conta_id: "c", valor: 10 }], { c: "6.01 Aluguel" })).toMatch(/^6\.01 Aluguel: R\$/);
  });

  it("nomeia itens e campos", () => {
    expect(nomeDaLinha("achados", { titulo: "Caixa baixo" })).toBe("Caixa baixo");
    expect(nomeDaLinha("fin_contas", { codigo: "6.01", nome: "Aluguel" })).toBe("6.01 Aluguel");
    expect(nomeDaLinha("indicadores", { valor: 3 })).toBeNull();
    expect(rotuloCampo("ref_min")).toBe("Referência mínima");
    expect(rotuloCampo("campo_novo")).toBe("Campo novo");
  });

  it("traduz os eventos do financeiro e junta do mais novo para o mais antigo", () => {
    const f = doFinanceiro("fin_lancamentos", { id: 1, em: "2026-11-01T10:00:00Z", acao: "editado", antes: {}, depois: {}, por: null, empresa_id: "e", lancamento_id: "l" });
    expect(f).toMatchObject({ acao: "alterado", registro_id: "l", chave: "fin_lancamentos:1" });
    const g = { ...f, chave: "h:1", em: "2026-11-02T10:00:00Z" };
    expect(juntar([f], [g]).map((e) => e.chave)).toEqual(["h:1", "fin_lancamentos:1"]);
  });
});
