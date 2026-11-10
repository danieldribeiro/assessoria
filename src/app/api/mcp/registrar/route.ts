import { segredoConfigurado, selar } from "@/lib/mcp/cripto";
import { CORS, json } from "@/lib/mcp/http";
import { retornoPermitido, VALIDADE } from "@/lib/mcp/oauth";

// Cadastro automático do aplicativo (RFC 7591). Nada é gravado: o id devolvido já carrega os endereços de retorno.
export async function POST(req: Request) {
  if (!segredoConfigurado()) return json({ error: "temporarily_unavailable" }, 503);
  let corpo: { redirect_uris?: unknown; client_name?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "JSON inválido." }, 400);
  }
  const uris = corpo.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string" && retornoPermitido(u))) {
    return json({ error: "invalid_redirect_uri", error_description: "Endereço de retorno não autorizado pelo AXIS." }, 400);
  }
  return json(
    {
      client_id: selar("cliente", { ru: uris }, VALIDADE.cliente),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: typeof corpo.client_name === "string" ? corpo.client_name.slice(0, 100) : undefined,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
