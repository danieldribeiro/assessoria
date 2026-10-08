"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITENS = [
  { href: "/", rotulo: "Painel", ativo: (p: string) => p === "/" },
  {
    href: "/empresas",
    rotulo: "Empresas",
    ativo: (p: string) => p.startsWith("/empresas") || p.startsWith("/diagnosticos"),
  },
];

export function Navegacao() {
  const caminho = usePathname();
  return (
    <nav className="flex gap-1">
      {ITENS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cx(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            item.ativo(caminho)
              ? "bg-slate-100 text-slate-900"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}
