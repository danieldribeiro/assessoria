"use client";

import { Building2, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotaoTema } from "@/components/botao-tema";
import { cx } from "@/components/ui";

const ITENS = [
  { href: "/", rotulo: "Painel", icone: LayoutDashboard, ativo: (p: string) => p === "/" },
  {
    href: "/empresas",
    rotulo: "Empresas",
    icone: Building2,
    ativo: (p: string) => p.startsWith("/empresas") || p.startsWith("/diagnosticos"),
  },
];

// Barra do topo: saudação à esquerda, menu em pílula no centro, usuário à direita.
export function Navegacao({
  saudacao,
  usuario,
  sair,
}: {
  saudacao: string;
  usuario: { nome: string; email: string };
  sair: () => Promise<void>;
}) {
  const caminho = usePathname();
  const iniciais = usuario.nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const menu = (
    <nav className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-superficie p-1 shadow-xs">
      {ITENS.map((item) => {
        const ativo = item.ativo(caminho);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cx(
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              ativo ? "bg-marca-50 text-marca-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <item.icone className={cx("size-4", ativo ? "text-marca-600" : "text-slate-400")} />
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <header className="nao-imprimir sticky top-0 z-20 border-b border-slate-200/70 bg-fundo/85 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-marca-600 text-sm font-semibold text-white shadow-sm shadow-marca-600/30">
            D
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-xs text-slate-500">{saudacao},</span>
            <span className="block truncate text-sm font-semibold text-slate-900">{usuario.nome}</span>
          </span>
        </Link>

        <div className="hidden md:block">{menu}</div>

        <div className="flex items-center justify-end gap-2">
          <BotaoTema className="flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-superficie hover:text-slate-900 hover:ring-1 hover:ring-slate-200" />
          <span
            title={usuario.email}
            className="hidden size-9 items-center justify-center rounded-full bg-superficie text-xs font-semibold text-slate-600 ring-1 ring-slate-200 sm:flex"
          >
            {iniciais}
          </span>
          <form action={sair}>
            <button
              title="Sair"
              aria-label="Sair"
              className="flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-superficie hover:text-slate-900 hover:ring-1 hover:ring-slate-200"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
      <div className="flex justify-center pb-3 md:hidden">{menu}</div>
    </header>
  );
}
