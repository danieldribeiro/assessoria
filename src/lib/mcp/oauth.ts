import { createHash } from "node:crypto";

// Regras do login do Claude (OAuth 2.1 com PKCE), sem estado no servidor: ver cripto.ts.

export const ESCOPO = "axis.leitura";

// Para onde o AXIS aceita devolver o login: o app do Claude e, para testes no computador, endereços locais.
export function retornoPermitido(uri: string) {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.username || u.password || u.hash) return false;
  if (u.protocol === "https:" && ["claude.ai", "claude.com"].includes(u.hostname)) return u.pathname === "/api/mcp/auth_callback";
  if (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) return true;
  return false;
}

export function conferirPkce(verificador: string | null | undefined, desafio: string) {
  if (!verificador || !/^[A-Za-z0-9._~-]{43,128}$/.test(verificador)) return false;
  return createHash("sha256").update(verificador).digest("base64url") === desafio;
}

export function desafioValido(desafio: string | null | undefined) {
  return !!desafio && /^[A-Za-z0-9_-]{43}$/.test(desafio);
}

export function metadadosRecurso(origem: string) {
  return {
    resource: `${origem}/api/mcp`,
    authorization_servers: [origem],
    scopes_supported: [ESCOPO],
    bearer_methods_supported: ["header"],
    resource_name: "AXIS",
  };
}

export function metadadosAutorizacao(origem: string) {
  return {
    issuer: origem,
    authorization_endpoint: `${origem}/auth/claude`,
    token_endpoint: `${origem}/api/mcp/token`,
    registration_endpoint: `${origem}/api/mcp/registrar`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [ESCOPO],
  };
}

// Validades em segundos.
export const VALIDADE = {
  codigo: 5 * 60,
  renovacao: 30 * 24 * 60 * 60,
  cliente: 10 * 365 * 24 * 60 * 60,
};

export type PedidoAutorizacao = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  desafio: string;
  resource: string | null;
};

// Confere o pedido de login que o Claude manda para /auth/claude. Endereço de retorno fora da lista nunca recebe nada.
export function lerPedidoAutorizacao(
  ler: (campo: string) => string | null,
  clienteRegistrado: (clientId: string) => string[] | null,
): { pedido: PedidoAutorizacao } | { erro: string; retornavel?: false } {
  const redirectUri = ler("redirect_uri") ?? "";
  const clientId = ler("client_id") ?? "";
  if (!clientId) return { erro: "Pedido sem client_id." };
  if (!retornoPermitido(redirectUri)) return { erro: "Endereço de retorno não autorizado." };
  const registrados = clienteRegistrado(clientId);
  if (registrados && !registrados.includes(redirectUri)) return { erro: "Endereço de retorno não confere com o cadastro do aplicativo." };
  if (ler("response_type") !== "code") return { erro: "Tipo de resposta não suportado." };
  const desafio = ler("code_challenge");
  if (ler("code_challenge_method") !== "S256" || !desafioValido(desafio)) return { erro: "Pedido sem PKCE (S256)." };
  return { pedido: { clientId, redirectUri, state: ler("state"), desafio: desafio!, resource: ler("resource") } };
}

export function urlDeRetorno(redirectUri: string, parametros: Record<string, string | null>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(parametros)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}
