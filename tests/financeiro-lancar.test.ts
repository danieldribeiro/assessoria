import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas: { funcao: string; parametros: Record<string, unknown> }[] = [];
let erroDoBanco: { message: string } | null = null;
const criarCliente = vi.fn(async () => ({
  rpc: async (funcao: string, parametros: Record<string, unknown>) => {
    chamadas.push({ funcao, parametros });
    return { data: "l1", error: erroDoBanco };
  },
}));

vi.mock("@/lib/supabase/server", () => ({ criarCliente }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.spyOn(console, "error").mockImplementation(() => {});

const { lancar } = await import("@/server/financeiro");

function formulario(campos: Record<string, string>, rateio: [string, string][] = [["c1", ""]]) {
  const dados = new FormData();
  const base = { direcao: "entrada", situacao: "realizado", conta_caixa_id: "cx1", data: "2026-10-05", descricao: "Consultas", valor_total: "1.500,50" };
  for (const [campo, valor] of Object.entries({ ...base, ...campos })) dados.set(campo, valor);
  for (const [conta, valor] of rateio) {
    dados.append("rateio_conta", conta);
    dados.append("rateio_valor", valor);
  }
  return dados;
}

beforeEach(() => {
  chamadas.length = 0;
  erroDoBanco = null;
  criarCliente.mockClear();
});

describe("lancar", () => {
  it("lançamento realizado usa a data como liquidação e competência", async () => {
    expect(await lancar("e1", formulario({}))).toBeUndefined();
    expect(chamadas).toEqual([
      {
        funcao: "fin_lancar",
        parametros: expect.objectContaining({
          p_empresa: "e1",
          p_direcao: "entrada",
          p_valor_total: 1500.5,
          p_situacao: "realizado",
          p_liquidacao: "2026-10-05",
          p_vencimento: null,
          p_competencia: "2026-10-05",
          p_rateios: [{ conta_id: "c1", valor: 1500.5 }],
        }),
      },
    ]);
  });

  it("lançamento previsto usa a data como vencimento e respeita a competência informada", async () => {
    await lancar("e1", formulario({ situacao: "previsto", data_competencia: "2026-09-30" }));
    expect(chamadas[0].parametros).toMatchObject({ p_vencimento: "2026-10-05", p_liquidacao: null, p_competencia: "2026-09-30" });
  });

  it.each([
    [{ direcao: "outra" }, "Escolha entrada ou saída."],
    [{ situacao: "cancelado" }, "Escolha realizado ou previsto."],
    [{ conta_caixa_id: "" }, "Escolha a conta de caixa."],
    [{ data: "05/10/2026" }, "Informe a data do pagamento ou recebimento."],
    [{ descricao: " " }, "Informe a descrição."],
    [{ valor_total: "" }, "Informe o valor total."],
    [{ valor_total: "0" }, "O valor total precisa ser maior que zero."],
    [{ valor_total: "10,555" }, "O valor total tem no máximo duas casas decimais."],
  ])("recusa %j sem chamar o banco", async (campos, erro) => {
    expect(await lancar("e1", formulario(campos as Record<string, string>))).toEqual({ erro });
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("recusa rateio que não soma o total sem chamar o banco", async () => {
    const r = await lancar("e1", formulario({ valor_total: "100" }, [["c1", "60"], ["c2", "39,99"]]));
    expect(r).toEqual({ erro: expect.stringContaining("A soma precisa ser exata") });
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("traduz a regra do banco em mensagem", async () => {
    erroDoBanco = { message: 'insert or update on table "fin_lancamentos" violates foreign key constraint "fin_lancamentos_conta_caixa"' };
    expect(await lancar("e1", formulario({}))).toEqual({ erro: "A conta de caixa não é desta empresa." });
  });

  it("repassa a mensagem própria do banco", async () => {
    erroDoBanco = { message: "A data do pagamento é anterior ao saldo inicial da conta de caixa." };
    expect(await lancar("e1", formulario({}))).toEqual({ erro: erroDoBanco.message });
  });
});
