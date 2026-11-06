import "server-only";
import { createClient } from "@supabase/supabase-js";
import { abrir, selar } from "@/lib/mcp/cripto";
import { ESCOPO, VALIDADE } from "@/lib/mcp/oauth";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
};

export function json(corpo: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(corpo, { status, headers: { ...CORS, "cache-control": "no-store", ...extra } });
}

export const origemDe = (req: Request) => new URL(req.url).origin;

// Cliente do Supabase sem cookies, só para o login e a renovação dos tokens do Claude.
export function clienteAvulso() {
  return createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function clienteRegistrado(clientId: string) {
  const dados = abrir<{ ru: string[] }>("cliente", clientId);
  return dados && Array.isArray(dados.ru) ? dados.ru : null;
}

// O token de acesso do Claude guarda o token da sessão do Supabase e vence junto com ele.
export function emitirTokens(sessao: { access_token: string; refresh_token: string; expires_at?: number }, uid: string) {
  const agora = Math.floor(Date.now() / 1000);
  const validade = Math.max(60, Math.min(3600, (sessao.expires_at ?? agora + 3600) - agora - 30));
  return {
    access_token: selar("acesso", { at: sessao.access_token, uid }, validade),
    token_type: "Bearer",
    expires_in: validade,
    refresh_token: selar("renovacao", { rt: sessao.refresh_token, uid }, VALIDADE.renovacao),
    scope: ESCOPO,
  };
}
