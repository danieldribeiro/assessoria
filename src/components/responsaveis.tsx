import Link from "next/link";
import { cx } from "@/components/ui";
import type { Perfil } from "@/lib/dominio";

function iniciaisPessoa(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Bolinha com as iniciais de quem cuida do item.
export function AvatarResponsavel({ perfil, className }: { perfil: Perfil | null | undefined; className?: string }) {
  if (!perfil)
    return (
      <span
        title="Sem responsável"
        className={cx(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-400",
          className,
        )}
      >
        ?
      </span>
    );
  return (
    <span
      title={perfil.nome}
      className={cx(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-marca-100 text-[10px] font-semibold text-marca-700",
        className,
      )}
    >
      {iniciaisPessoa(perfil.nome)}
    </span>
  );
}

// Filtro "Todos · Daniel · João" no topo das abas; "sem" mostra os itens sem ninguém.
export function FiltroResponsavel({
  equipe,
  atual,
  href,
  usuarioId,
  temSemResponsavel,
}: {
  equipe: Perfil[];
  atual: string | undefined;
  href: (de?: string) => string;
  usuarioId?: string;
  temSemResponsavel: boolean;
}) {
  const pessoas = [...equipe].sort((a, b) => Number(b.id === usuarioId) - Number(a.id === usuarioId));
  const opcoes = [
    { de: undefined, rotulo: "Todos" },
    ...pessoas.map((p) => ({ de: p.id, rotulo: p.id === usuarioId ? "Meus itens" : p.nome.split(" ")[0] })),
    ...(temSemResponsavel ? [{ de: "sem", rotulo: "Sem responsável" }] : []),
  ];
  return (
    <nav aria-label="Filtrar por responsável" className="flex flex-wrap items-center gap-1.5">
      {opcoes.map((o) => {
        const ativo = (atual ?? undefined) === o.de;
        return (
          <Link
            key={o.rotulo}
            href={href(o.de)}
            scroll={false}
            aria-current={ativo ? "true" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
              ativo
                ? "bg-marca-600 text-white ring-marca-600"
                : "bg-superficie text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {o.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
