// Lidas no build: depois de criar ou mudar as variáveis na Vercel, é preciso refazer o deploy.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function variaveisFaltando() {
  const faltando: string[] = [];
  if (!SUPABASE_URL) faltando.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_KEY) faltando.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return faltando;
}
