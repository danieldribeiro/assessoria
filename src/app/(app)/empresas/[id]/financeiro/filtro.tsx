import type { ReactNode } from "react";
import { Botao } from "@/components/ui";
import { SeletorMes } from "./seletor-mes";

// Filtro de período por mês (só consulta: nada é gravado). Usa GET, então o endereço guarda o filtro.
// O botão "Ver período" aplica os outros filtros; as setas do seletor de mês mudam o período na hora.
export function FiltroPeriodo({
  aba,
  de,
  ate,
  children,
}: {
  aba: string;
  de: string;
  ate: string;
  children?: ReactNode;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="aba" value={aba} />
      <SeletorMes de={de} ate={ate} />
      {children}
      <Botao type="submit" variante="secundario">
        Ver período
      </Botao>
    </form>
  );
}

export const classeFiltro =
  "rounded-lg border border-slate-200 bg-superficie px-3 py-1.5 text-sm text-slate-900 shadow-xs";
