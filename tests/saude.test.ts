import { describe, expect, it } from "vitest";
import { verificarSaude } from "@/lib/saude";

describe("verificarSaude", () => {
  it("ok quando o banco responde sem erro", async () => {
    const r = await verificarSaude(async () => ({ error: null }));
    expect(r.ok).toBe(true);
    expect(r.banco).toBe("ok");
  });
  it("erro quando o banco devolve erro", async () => {
    const r = await verificarSaude(async () => ({ error: { message: "x" } }));
    expect(r).toMatchObject({ ok: false, banco: "erro" });
  });
  it("erro quando a consulta lança exceção", async () => {
    const r = await verificarSaude(async () => {
      throw new Error("rede");
    });
    expect(r).toMatchObject({ ok: false, banco: "erro" });
  });
  it("lento quando passa do limite", async () => {
    const r = await verificarSaude(() => new Promise(() => {}), 20);
    expect(r).toMatchObject({ ok: false, banco: "lento" });
  });
});
