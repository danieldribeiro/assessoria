import { AvatarResponsavel, FiltroResponsavel } from "@/components/responsaveis";
import { responsavelDoItem, type Categoria } from "@/lib/dominio";
import type { DiagnosticoCompleto } from "@/lib/consultas";

export type PropsAba = { d: DiagnosticoCompleto; de?: string; usuarioId?: string };

export function pessoa(d: DiagnosticoCompleto, id: string | null | undefined) {
  return id ? (d.equipe.find((p) => p.id === id) ?? null) : null;
}

// Avatar de quem cuida do item (o próprio ou o da área).
export function ResponsavelDoItem({
  d,
  item,
}: {
  d: DiagnosticoCompleto;
  item: { responsavel_id: string | null; categoria: string };
}) {
  return <AvatarResponsavel perfil={pessoa(d, responsavelDoItem(item, d.responsaveis_area))} />;
}

// "Financeiro · Daniel" no cabeçalho de cada grupo.
export function DonoDaArea({ d, categoria }: { d: DiagnosticoCompleto; categoria: Categoria }) {
  const p = pessoa(d, d.responsaveis_area[categoria]);
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <AvatarResponsavel perfil={p} className="size-5" />
      {p ? p.nome.split(" ")[0] : "Sem responsável"}
    </span>
  );
}

export function BarraFiltro({
  d,
  de,
  usuarioId,
  aba,
  itens,
}: PropsAba & { aba: string; itens: { responsavel_id: string | null; categoria: string }[] }) {
  if (d.equipe.length < 2 && !itens.some((i) => !responsavelDoItem(i, d.responsaveis_area))) return null;
  return (
    <FiltroResponsavel
      equipe={d.equipe}
      atual={de}
      usuarioId={usuarioId}
      temSemResponsavel={itens.some((i) => !responsavelDoItem(i, d.responsaveis_area))}
      href={(novo) => `/diagnosticos/${d.id}?aba=${aba}${novo ? `&de=${novo}` : ""}`}
    />
  );
}
