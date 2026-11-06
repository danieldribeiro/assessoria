import { abrir, segredoConfigurado } from "@/lib/mcp/cripto";
import { clienteAvulso, CORS, emitirTokens, json } from "@/lib/mcp/http";
import { conferirPkce } from "@/lib/mcp/oauth";

// Troca o código do login por tokens, e renova os tokens vencidos (OAuth 2.1, cliente público com PKCE).
const falha = (error: string, error_description: string) => json({ error, error_description }, 400);

async function lerCorpo(req: Request) {
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    const dados = (await req.json()) as Record<string, unknown>;
    return (k: string) => (typeof dados[k] === "string" ? (dados[k] as string) : null);
  }
  const form = new URLSearchParams(await req.text());
  return (k: string) => form.get(k);
}

export async function POST(req: Request) {
  if (!segredoConfigurado()) return json({ error: "temporarily_unavailable" }, 503);
  let ler: (k: string) => string | null;
  try {
    ler = await lerCorpo(req);
  } catch {
    return falha("invalid_request", "Corpo inválido.");
  }

  const tipo = ler("grant_type");
  if (tipo === "authorization_code") {
    const codigo = abrir<{ at: string; atExp: number; rt: string; uid: string; cc: string; ru: string; cid: string }>("codigo", ler("code"));
    if (!codigo) return falha("invalid_grant", "Código inválido ou vencido.");
    if (ler("redirect_uri") !== codigo.ru) return falha("invalid_grant", "Endereço de retorno não confere.");
    const cid = ler("client_id");
    if (cid && cid !== codigo.cid) return falha("invalid_grant", "Aplicativo não confere.");
    if (!conferirPkce(ler("code_verifier"), codigo.cc)) return falha("invalid_grant", "PKCE não confere.");
    return json(emitirTokens({ access_token: codigo.at, refresh_token: codigo.rt, expires_at: codigo.atExp }, codigo.uid));
  }

  if (tipo === "refresh_token") {
    const renovacao = abrir<{ rt: string; uid: string }>("renovacao", ler("refresh_token"));
    if (!renovacao) return falha("invalid_grant", "Token de renovação inválido ou vencido.");
    const { data, error } = await clienteAvulso().auth.refreshSession({ refresh_token: renovacao.rt });
    if (error || !data.session) return falha("invalid_grant", "Sessão encerrada. Faça o login de novo.");
    return json(emitirTokens(data.session, data.session.user.id));
  }

  return falha("unsupported_grant_type", "Use authorization_code ou refresh_token.");
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
