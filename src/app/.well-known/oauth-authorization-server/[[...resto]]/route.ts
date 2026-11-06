import { CORS, json, origemDe } from "@/lib/mcp/http";
import { metadadosAutorizacao } from "@/lib/mcp/oauth";

// Endereços do login do Claude (RFC 8414).
export const GET = (req: Request) => json(metadadosAutorizacao(origemDe(req)), 200, { "cache-control": "public, max-age=300" });
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
