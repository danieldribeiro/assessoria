import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { clienteDoContexto } from "@/lib/supabase/contexto";

export async function criarCliente() {
  const doContexto = clienteDoContexto.getStore();
  if (doContexto) return doContexto;

  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL!,
    SUPABASE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Em Server Components os cookies são somente leitura; o proxy renova a sessão.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {}
        },
      },
    },
  );
}
