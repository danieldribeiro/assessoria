import { ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avisos } from "@/components/avisos";
import { BotaoTema } from "@/components/botao-tema";
import { iniciaisPessoa } from "@/components/responsaveis";
import { assessoriaDaCentral, perfilAtual } from "@/lib/central";
import { sair } from "@/server/sessao";

export const metadata = { title: { default: "Central da clínica", template: "%s · Central da clínica" } };

const classeIcone =
  "flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-superficie hover:text-slate-900 hover:ring-1 hover:ring-slate-200";

// Topo da central: a marca da assessoria, quem está logado e sair. Sem o menu da equipe.
export default async function LayoutCentral({ children }: LayoutProps<"/central">) {
  const [perfil, assessoria] = await Promise.all([perfilAtual(), assessoriaDaCentral()]);
  if (!perfil) redirect("/login");
  const marca = assessoria?.nome_fantasia || assessoria?.razao_social || "Assessoria";

  return (
    <div className="min-h-dvh">
      {perfil.papel === "equipe" && (
        <div className="nao-imprimir bg-zinc-900 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-8">
            <span>Você está vendo a central como o dono da clínica vê.</span>
            <Link href="/empresas" className="inline-flex items-center gap-1.5 font-medium text-white/90 hover:text-white">
              <ArrowLeft className="size-4" />
              Voltar ao sistema
            </Link>
          </div>
        </div>
      )}
      <header className="nao-imprimir border-b border-slate-200/70 bg-fundo/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/central" className="flex min-w-0 items-center gap-3">
            {assessoria?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assessoria.logo_url} alt={marca} className="h-9 max-w-40 rounded-md bg-white object-contain p-0.5" />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-marca-600 text-sm font-semibold text-white">
                {marca[0]}
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="block text-xs text-slate-500">Central da clínica</span>
              <span className="block truncate text-sm font-semibold text-slate-900">{marca}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <BotaoTema className={classeIcone} />
            <span
              title={perfil.email}
              className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-superficie text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
            >
              {perfil.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={perfil.foto_url} alt="" className="size-full object-cover" />
              ) : (
                iniciaisPessoa(perfil.nome)
              )}
            </span>
            <form action={sair}>
              <button title="Sair" aria-label="Sair" className={classeIcone}>
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      <Avisos />
    </div>
  );
}
