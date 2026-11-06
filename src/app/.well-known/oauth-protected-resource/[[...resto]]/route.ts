import { CORS, json, origemDe } from "@/lib/mcp/http";
import { metadadosRecurso } from "@/lib/mcp/oauth";

// Onde o Claude descobre como fazer o login no conector (RFC 9728).
export const GET = (req: Request) => json(metadadosRecurso(origemDe(req)), 200, { "cache-control": "public, max-age=300" });
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
