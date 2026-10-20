import { beforeEach, describe, expect, it, vi } from "vitest";

const gravacoes: { acao: "insert" | "update"; registro: Record<string, unknown> }[] = [];
const criarCliente = vi.fn(async () => ({
  from: () => ({
    insert: async (registro: Record<string, unknown>) => {
      gravacoes.push({ acao: "insert", registro });
      return { error: null };
    },
    update: (registro: Record<string, unknown>) => ({
      eq: async () => {
        gravacoes.push({ acao: "update", registro });
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ criarCliente }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { salvarIndicador } = await import("@/server/analise");

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  dados.set("nome", "Margem de contribuição");
  for (const [campo, valor] of Object.entries(campos)) dados.set(campo, valor);
  return dados;
}

beforeEach(() => {
  gravacoes.length = 0;
  criarCliente.mockClear();
});

describe("salvarIndicador", () => {
  it('grava "0" como 0, não como vazio', async () => {
    expect(await salvarIndicador("d1", null, formulario({ valor: "0" }))).toBeUndefined();
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].registro.valor).toBe(0);
  });

  it("grava campo vazio como null", async () => {
    await salvarIndicador("d1", null, formulario({ valor: "", ref_min: "" }));
    expect(gravacoes[0].registro).toMatchObject({ valor: null, ref_min: null, ref_max: null, tolerancia: null });
  });

  it('grava "1.240" como 1240 e "47,5" como 47,5', async () => {
    await salvarIndicador("d1", "i1", formulario({ valor: "1.240", ref_min: "47,5", ref_max: "-3", tolerancia: "10" }));
    expect(gravacoes[0]).toMatchObject({
      acao: "update",
      registro: { valor: 1240, ref_min: 47.5, ref_max: -3, tolerancia: 10 },
    });
  });

  it.each(["47,5%", "47.5", "não lançar"])('recusa o valor %j sem gravar nada', async (valor) => {
    const resultado = await salvarIndicador("d1", null, formulario({ valor }));
    expect(resultado).toEqual({ erro: expect.stringContaining(`Valor inválido: “${valor}”`) });
    expect(criarCliente).not.toHaveBeenCalled();
    expect(gravacoes).toHaveLength(0);
  });

  it("recusa um Mínimo inválido nomeando o campo", async () => {
    const resultado = await salvarIndicador("d1", null, formulario({ valor: "10", ref_min: "5,", ref_max: "8" }));
    expect(resultado).toEqual({ erro: expect.stringContaining("Mínimo inválido: “5,”") });
    expect(gravacoes).toHaveLength(0);
  });

  it("recusa Máximo e Folga inválidos nomeando o campo", async () => {
    expect(await salvarIndicador("d1", null, formulario({ ref_max: ",5" }))).toEqual({
      erro: expect.stringContaining("Máximo inválido"),
    });
    expect(await salvarIndicador("d1", null, formulario({ tolerancia: "20%" }))).toEqual({
      erro: expect.stringContaining("Folga inválido"),
    });
    expect(gravacoes).toHaveLength(0);
  });

  // Regressão: um campo inválido, em qualquer posição, impede a gravação inteira (inserção e edição).
  const validos = { valor: "47,5", ref_min: "10", ref_max: "40", tolerancia: "20" };
  const rotulos = { valor: "Valor", ref_min: "Mínimo", ref_max: "Máximo", tolerancia: "Folga" } as const;
  describe.each(Object.keys(rotulos) as (keyof typeof rotulos)[])("com %s inválido", (campo) => {
    it.each([
      ["nova", null],
      ["edição", "i1"],
    ])("não grava nada na %s", async (_caso, id) => {
      const resultado = await salvarIndicador("d1", id, formulario({ ...validos, [campo]: "47.5" }));
      expect(resultado).toEqual({ erro: expect.stringContaining(`${rotulos[campo]} inválido: “47.5”`) });
      expect(criarCliente).not.toHaveBeenCalled();
      expect(gravacoes).toHaveLength(0);
    });
  });

  it("com os quatro campos válidos, grava os quatro", async () => {
    await salvarIndicador("d1", null, formulario(validos));
    expect(gravacoes[0].registro).toMatchObject({ valor: 47.5, ref_min: 10, ref_max: 40, tolerancia: 20 });
  });
});
