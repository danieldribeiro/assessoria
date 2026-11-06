import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { abrir, selar } from "@/lib/mcp/cripto";
import { conferirPkce, lerPedidoAutorizacao, retornoPermitido, urlDeRetorno } from "@/lib/mcp/oauth";
import { tratarMensagem, validarArgumentos, ErroDeUso, type Ferramenta } from "@/lib/mcp/protocolo";
import { fetchSomenteLeitura, requisicaoDeLeitura } from "@/lib/mcp/somente-leitura";

const SEGREDO = "s".repeat(40);

describe("tokens cifrados", () => {
  it("abre o que selou, com o mesmo tipo", () => {
    const t = selar("acesso", { at: "abc", uid: "u1" }, 60, SEGREDO);
    expect(abrir("acesso", t, SEGREDO)).toMatchObject({ at: "abc", uid: "u1" });
  });
  it("recusa tipo trocado, chave trocada, token alterado e token vencido", () => {
    const t = selar("codigo", { x: 1 }, 60, SEGREDO);
    expect(abrir("acesso", t, SEGREDO)).toBeNull();
    expect(abrir("codigo", t, "o".repeat(40))).toBeNull();
    const alterado = t.slice(0, -2) + (t.endsWith("A") ? "BB" : "AA");
    expect(abrir("codigo", alterado, SEGREDO)).toBeNull();
    expect(abrir("codigo", selar("codigo", { x: 1 }, -1, SEGREDO), SEGREDO)).toBeNull();
    expect(abrir("codigo", "lixo", SEGREDO)).toBeNull();
    expect(abrir("codigo", null, SEGREDO)).toBeNull();
  });
  it("exige chave de pelo menos 32 caracteres", () => {
    expect(() => selar("acesso", {}, 60, "curta")).toThrow();
  });
  it("não deixa o conteúdo legível", () => {
    const t = selar("acesso", { at: "token-secreto-do-supabase" }, 60, SEGREDO);
    expect(Buffer.from(t, "base64url").toString("latin1")).not.toContain("token-secreto");
  });
});

describe("login do Claude (OAuth)", () => {
  it("aceita só o retorno do Claude e endereços locais", () => {
    expect(retornoPermitido("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(retornoPermitido("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(retornoPermitido("http://localhost:6274/oauth/callback")).toBe(true);
    expect(retornoPermitido("http://127.0.0.1:33418/callback")).toBe(true);
    expect(retornoPermitido("https://claude.ai/outra")).toBe(false);
    expect(retornoPermitido("https://evil.com/api/mcp/auth_callback")).toBe(false);
    expect(retornoPermitido("https://claude.ai.evil.com/api/mcp/auth_callback")).toBe(false);
    expect(retornoPermitido("http://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(retornoPermitido("https://user@claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(retornoPermitido("javascript:alert(1)")).toBe(false);
    expect(retornoPermitido("")).toBe(false);
  });

  it("confere o PKCE S256", () => {
    const verificador = "a".repeat(43) + "-._~";
    const desafio = createHash("sha256").update(verificador).digest("base64url");
    expect(conferirPkce(verificador, desafio)).toBe(true);
    expect(conferirPkce("b".repeat(43), desafio)).toBe(false);
    expect(conferirPkce("curto", desafio)).toBe(false);
    expect(conferirPkce(null, desafio)).toBe(false);
  });

  const pedidoBase: Record<string, string> = {
    client_id: "c1",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    response_type: "code",
    code_challenge: "x".repeat(43),
    code_challenge_method: "S256",
    state: "abc",
  };
  const ler = (extra: Record<string, string | null> = {}) => (k: string) => (k in extra ? extra[k] : (pedidoBase[k] ?? null));

  it("lê um pedido válido", () => {
    const r = lerPedidoAutorizacao(ler(), () => null);
    expect(r).toEqual({ pedido: { clientId: "c1", redirectUri: pedidoBase.redirect_uri, state: "abc", desafio: "x".repeat(43), resource: null } });
  });
  it("recusa retorno fora da lista, sem PKCE, plain, ou fora do cadastro do aplicativo", () => {
    expect(lerPedidoAutorizacao(ler({ redirect_uri: "https://evil.com/cb" }), () => null)).toHaveProperty("erro");
    expect(lerPedidoAutorizacao(ler({ code_challenge: null }), () => null)).toHaveProperty("erro");
    expect(lerPedidoAutorizacao(ler({ code_challenge_method: "plain" }), () => null)).toHaveProperty("erro");
    expect(lerPedidoAutorizacao(ler({ response_type: "token" }), () => null)).toHaveProperty("erro");
    expect(lerPedidoAutorizacao(ler({ client_id: null }), () => null)).toHaveProperty("erro");
    expect(lerPedidoAutorizacao(ler(), () => ["https://claude.com/api/mcp/auth_callback"])).toHaveProperty("erro");
    expect(lerPedidoAutorizacao(ler(), () => [pedidoBase.redirect_uri])).toHaveProperty("pedido");
  });
  it("monta o endereço de retorno sem perder o que já tinha", () => {
    expect(urlDeRetorno("http://localhost:1/cb?x=1", { code: "c", state: null })).toBe("http://localhost:1/cb?x=1&code=c");
  });
});

describe("trava de somente leitura", () => {
  const URL = "https://proj.supabase.co";
  it("deixa passar leituras e as duas funções de consulta", () => {
    expect(requisicaoDeLeitura(`${URL}/rest/v1/empresas?select=*`, "GET")).toBe(true);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/empresas`, "HEAD")).toBe(true);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/rpc/fin_saldos`, "POST")).toBe(true);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/rpc/fin_fluxo_caixa`, "post")).toBe(true);
  });
  it("bloqueia gravar, alterar, apagar e outras funções", () => {
    expect(requisicaoDeLeitura(`${URL}/rest/v1/empresas`, "POST")).toBe(false);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/empresas?id=eq.1`, "PATCH")).toBe(false);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/empresas?id=eq.1`, "DELETE")).toBe(false);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/empresas`, "PUT")).toBe(false);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/rpc/fin_editar_lancamento`, "POST")).toBe(false);
    expect(requisicaoDeLeitura(`${URL}/rest/v1/rpc/fin_saldos/x`, "POST")).toBe(false);
    expect(requisicaoDeLeitura(`${URL}/storage/v1/object/logos/x`, "POST")).toBe(false);
  });
  it("o fetch recusa antes de sair", async () => {
    let chamadas = 0;
    const f = fetchSomenteLeitura(async () => {
      chamadas++;
      return new Response("[]");
    });
    await expect(f(`${URL}/rest/v1/empresas`, { method: "DELETE" })).rejects.toThrow(/só de leitura/);
    await expect(f(new Request(`${URL}/rest/v1/empresas`, { method: "PATCH", body: "{}" }))).rejects.toThrow();
    await f(`${URL}/rest/v1/empresas`);
    expect(chamadas).toBe(1);
  });
});

describe("protocolo MCP", () => {
  const eco: Ferramenta = {
    name: "eco",
    title: "Eco",
    description: "Devolve o texto.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "t", pattern: "^[a-z]+$" },
        n: { type: "integer", description: "n" },
        modo: { type: "string", description: "m", enum: ["a", "b"] },
      },
      required: ["texto"],
    },
    async executar(args) {
      if (args.texto === "erro") throw new ErroDeUso("não achei");
      if (args.texto === "quebra") throw new Error("detalhe interno");
      return { texto: args.texto };
    },
  };
  const rpc = (method: string, params?: Record<string, unknown>, id: number | undefined = 1) =>
    tratarMensagem({ jsonrpc: "2.0", id, method, params }, [eco]);

  it("inicializa com a versão pedida ou a mais nova", async () => {
    expect((await rpc("initialize", { protocolVersion: "2025-06-18" }))?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "axis" },
    });
    expect(((await rpc("initialize", { protocolVersion: "1999-01-01" }))?.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
  });
  it("não responde notificações", async () => {
    expect(await tratarMensagem({ jsonrpc: "2.0", method: "notifications/initialized" }, [eco])).toBeNull();
  });
  it("lista as ferramentas marcadas como só leitura", async () => {
    const r = (await rpc("tools/list"))?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    expect(r.tools).toHaveLength(1);
    expect(r.tools[0]).toMatchObject({ name: "eco", annotations: { readOnlyHint: true, destructiveHint: false } });
    expect(r.tools[0]).not.toHaveProperty("executar");
  });
  it("chama a ferramenta e devolve JSON em texto", async () => {
    const r = (await rpc("tools/call", { name: "eco", arguments: { texto: "oi" } }))?.result as { content: { text: string }[]; isError: boolean };
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.content[0].text)).toEqual({ texto: "oi" });
  });
  it("erros de uso viram resposta da ferramenta; erros internos não vazam detalhe", async () => {
    const uso = (await rpc("tools/call", { name: "eco", arguments: { texto: "erro" } }))?.result as { content: { text: string }[]; isError: boolean };
    expect(uso).toMatchObject({ isError: true, content: [{ text: "não achei" }] });
    const interno = (await rpc("tools/call", { name: "eco", arguments: { texto: "quebra" } }))?.result as { content: { text: string }[] };
    expect(interno.content[0].text).not.toContain("detalhe interno");
  });
  it("valida os argumentos", async () => {
    const falta = (await rpc("tools/call", { name: "eco", arguments: {} }))?.result as { isError: boolean; content: { text: string }[] };
    expect(falta.isError).toBe(true);
    expect(() => validarArgumentos(eco.inputSchema, { texto: "OI" })).toThrow(ErroDeUso);
    expect(() => validarArgumentos(eco.inputSchema, { texto: "oi", n: 1.5 })).toThrow(ErroDeUso);
    expect(() => validarArgumentos(eco.inputSchema, { texto: "oi", modo: "c" })).toThrow(ErroDeUso);
    expect(() => validarArgumentos(eco.inputSchema, { texto: "oi", outro: 1 })).toThrow(ErroDeUso);
    expect(() => validarArgumentos(eco.inputSchema, [])).toThrow(ErroDeUso);
    expect(validarArgumentos(eco.inputSchema, { texto: "oi", n: 2, modo: "a" })).toEqual({ texto: "oi", n: 2, modo: "a" });
  });
  it("responde erro para ferramenta e método desconhecidos e mensagem inválida", async () => {
    expect((await rpc("tools/call", { name: "x" }))?.error?.code).toBe(-32602);
    expect((await rpc("resources/list"))?.error?.code).toBe(-32601);
    expect((await tratarMensagem({ id: 1, method: "ping" }, [eco]))?.error?.code).toBe(-32600);
    expect((await rpc("ping"))?.result).toEqual({});
  });
});
