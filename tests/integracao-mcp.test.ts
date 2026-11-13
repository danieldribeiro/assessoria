// Teste do conector do Claude (/api/mcp) contra um banco Supabase de verdade, normalmente o axis-testes.
// Fica desligado no GitHub e no `npm test` comum: só roda quando estas variáveis existem.
//   AXIS_INTEGRACAO_URL, AXIS_INTEGRACAO_CHAVE (anon/publishable), AXIS_INTEGRACAO_SENHA
//   (senha dos usuários fictícios equipe@teste.local e cliente.a@teste.local).
// Nunca aponte para o banco de produção: os usuários de teste não existem lá.
import { beforeAll, describe, expect, it } from "vitest";

const URL_BANCO = process.env.AXIS_INTEGRACAO_URL;
const CHAVE = process.env.AXIS_INTEGRACAO_CHAVE;
const SENHA = process.env.AXIS_INTEGRACAO_SENHA;
const ligado = Boolean(URL_BANCO && CHAVE && SENHA);

const EMPRESA_A = "00000000-0000-0000-0000-0000000000e1";
const EMPRESA_B = "00000000-0000-0000-0000-0000000000e2";

type Rota = (req: Request) => Promise<Response>;
let mcp: Rota;
let tokenRota: Rota;
let emitirTokens: (s: { access_token: string; refresh_token: string; expires_at?: number }, uid: string) => {
  access_token: string;
  refresh_token: string;
};
let entrar: (email: string) => Promise<{ access_token: string; refresh_token: string }>;

async function chamar(token: string | null, corpo: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await mcp(new Request("http://localhost/api/mcp", { method: "POST", headers, body: JSON.stringify(corpo) }));
  return { status: res.status, corpo: res.status === 202 ? null : await res.json() };
}

let n = 0;
async function ferramenta(token: string, name: string, args: Record<string, unknown>) {
  const { corpo } = await chamar(token, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } });
  const r = corpo.result as { content: { text: string }[]; isError: boolean };
  return { erro: r.isError, dados: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) };
}

describe.skipIf(!ligado)("conector do Claude contra o banco de testes", () => {
  let equipe: string;
  let cliente: string;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_BANCO;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = CHAVE;
    process.env.AXIS_MCP_SEGREDO ??= "segredo-so-para-o-teste-de-integracao-0123456789";
    mcp = (await import("@/app/api/mcp/route")).POST;
    tokenRota = (await import("@/app/api/mcp/token/route")).POST;
    emitirTokens = (await import("@/lib/mcp/http")).emitirTokens;
    const { createClient } = await import("@supabase/supabase-js");
    entrar = async (email) => {
      const sb = createClient(URL_BANCO!, CHAVE!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await sb.auth.signInWithPassword({ email, password: SENHA! });
      if (error || !data.session) throw new Error(`Login de ${email} falhou: ${error?.message}`);
      return data.session;
    };
    const se = await entrar("equipe@teste.local");
    equipe = emitirTokens(se, "equipe").access_token;
    const sc = await entrar("cliente.a@teste.local");
    cliente = emitirTokens(sc, "cliente").access_token;
  });

  it("recusa pedido sem token ou com token falso", async () => {
    expect((await chamar(null, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(401);
    expect((await chamar("falso", { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(401);
  });

  it("apresenta-se e lista as 9 ferramentas", async () => {
    const ini = await chamar(equipe, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } },
    });
    expect(ini.status).toBe(200);
    expect(ini.corpo.result.serverInfo).toBeTruthy();
    const lista = await chamar(equipe, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(lista.corpo.result.tools).toHaveLength(9);
  });

  it("equipe: todas as ferramentas respondem sem erro", async () => {
    const empresas = await ferramenta(equipe, "listar_empresas", {});
    expect(empresas.erro).toBe(false);
    const ids = JSON.stringify(empresas.dados);
    expect(ids).toContain(EMPRESA_A);
    expect(ids).toContain(EMPRESA_B);

    const diags = await ferramenta(equipe, "listar_diagnosticos", { empresa_id: EMPRESA_A });
    expect(diags.erro).toBe(false);
    const diagId = JSON.stringify(diags.dados).match(/"id":"([0-9a-f-]{36})"/)?.[1];
    expect(diagId).toBeTruthy();
    expect((await ferramenta(equipe, "ver_diagnostico", { diagnostico_id: diagId })).erro).toBe(false);

    const periodo = { empresa_id: EMPRESA_A, inicio: "2026-01-01", fim: "2026-12-31" };
    for (const [nome, args] of [
      ["plano_de_contas", { empresa_id: EMPRESA_A }],
      ["saldos_caixa", { empresa_id: EMPRESA_A }],
      ["resultado_dre", periodo],
      ["fluxo_caixa", periodo],
      ["listar_lancamentos", periodo],
      ["contas_a_pagar_receber", { empresa_id: EMPRESA_A }],
    ] as const) {
      const r = await ferramenta(equipe, nome, args);
      expect(r.erro, `${nome}: ${r.erro ? r.dados : ""}`).toBe(false);
    }
  });

  it("as regras do banco valem: a cliente da Clínica A não vê a Clínica B", async () => {
    const empresas = await ferramenta(cliente, "listar_empresas", {});
    expect(JSON.stringify(empresas.dados)).not.toContain(EMPRESA_B);
    const diagsB = await ferramenta(cliente, "listar_diagnosticos", { empresa_id: EMPRESA_B });
    expect(diagsB.erro || JSON.stringify(diagsB.dados) === "[]" || !JSON.stringify(diagsB.dados).includes(EMPRESA_B)).toBe(true);
    const contasB = await ferramenta(cliente, "plano_de_contas", { empresa_id: EMPRESA_B });
    // Ou a consulta recusa, ou volta sem nenhuma conta da Clínica B.
    if (!contasB.erro) expect(JSON.stringify(contasB.dados)).not.toMatch(/"codigo"/);
  });

  it("renova o token pelo refresh e o novo token funciona", async () => {
    const s = await entrar("equipe@teste.local");
    const { refresh_token } = emitirTokens(s, "equipe");
    const res = await tokenRota(
      new Request("http://localhost/api/mcp/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token }).toString(),
      }),
    );
    expect(res.status).toBe(200);
    const novo = (await res.json()) as { access_token: string };
    expect((await ferramenta(novo.access_token, "listar_empresas", {})).erro).toBe(false);
  });
});
