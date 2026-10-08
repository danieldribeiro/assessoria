import Link from "next/link";
import { Navegacao } from "@/components/navegacao";
import { criarCliente } from "@/lib/supabase/server";
import { sair } from "@/server/sessao";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const supabase = await criarCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("perfis").select("nome").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <div className="min-h-dvh">
      <header className="nao-imprimir sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-marca-600 text-sm font-semibold text-white">
              D
            </span>
            <span className="text-sm font-semibold text-slate-900">Diagnósticos</span>
          </Link>
          <Navegacao />
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{perfil?.nome ?? user?.email}</span>
            <form action={sair}>
              <button className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
