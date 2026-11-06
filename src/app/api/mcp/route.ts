import { createClient } from "@supabase/supabase-js";
import { abrir, segredoConfigurado } from "@/lib/mcp/cripto";
import { FERRAMENTAS } from "@/lib/mcp/ferramentas";
import { CORS, json, origemDe } from "@/lib/mcp/http";
import { tratarMensagem } from "@/lib/mcp/protocolo";
import { fetchSomenteLeitura } from "@/lib/mcp/somente-leitura";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { clienteDoContexto } from "@/lib/supabase/contexto";

// Conector do Claude (MCP). Cada pedido traz o token do login; as consultas rodam com a sessão daquela pessoa.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!segredoConfigurado()) return json({ error: "Conector do Claude desligado: falta AXIS_MCP_SEGREDO na Vercel." }, 503);

  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const acesso = abrir<{ at: string; uid: string }>("acesso", token);
  if (!acesso) {
    return json({ error: "invalid_token", error_description: "Faça o login no Axis pelo Claude." }, 401, {
      "www-authenticate": `Bearer resource_metadata="${origemDe(req)}/.well-known/oauth-protected-resource/api/mcp"`,
    });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }, 400);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    global: { headers: { Authorization: `Bearer ${acesso.at}` }, fetch: fetchSomenteLeitura() },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const registrar = (ferramenta: string, args: Record<string, unknown>, ok: boolean) =>
    console.log(JSON.stringify({ evento: "mcp", usuario: acesso.uid, ferramenta, args, ok }));

  const mensagens = Array.isArray(corpo) ? corpo : [corpo];
  const respostas = await clienteDoContexto.run(supabase, () =>
    Promise.all(mensagens.map((m) => tratarMensagem(m, FERRAMENTAS, registrar))),
  );
  const validas = respostas.filter((r) => r !== null);
  if (!validas.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(corpo) ? validas : validas[0]);
}

const semSse = () => new Response("Use POST.", { status: 405, headers: { ...CORS, allow: "POST" } });
export const GET = semSse;
export const DELETE = semSse;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
