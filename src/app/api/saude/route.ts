import { createClient } from "@supabase/supabase-js";
import { verificarSaude } from "@/lib/saude";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Endereço público para o aviso de "fora do ar": 200 quando site e banco respondem, 503 quando não.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const saude = await verificarSaude(() => supabase.from("empresas").select("id").limit(1));
  return Response.json(saude, { status: saude.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

export const HEAD = GET;
