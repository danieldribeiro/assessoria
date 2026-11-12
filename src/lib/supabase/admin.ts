import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";

// Cliente com a chave de serviço do Supabase, só no servidor e só para convidar quem tem acesso à central.
// Passa por cima das regras do banco: use apenas depois de confirmar que quem pediu é da equipe.
// A chave fica só na Vercel (SUPABASE_SERVICE_ROLE_KEY, sem NEXT_PUBLIC) e nunca vai para o navegador.
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !chave) return null;
  return createClient(SUPABASE_URL, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
