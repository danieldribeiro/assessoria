import type { ReactNode } from "react";
import { Botao } from "@/components/ui";

// Filtro de período por mês (só consulta: nada é gravado). Usa GET, então o endereço guarda o filtro.
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
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">De</span>
        <input
          type="month"
          name="de"
          defaultValue={de}
          className="rounded-lg border border-slate-200 bg-superficie px-3 py-1.5 text-sm text-slate-900 shadow-xs"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Até</span>
        <input
          type="month"
          name="ate"
          defaultValue={ate}
          className="rounded-lg border border-slate-200 bg-superficie px-3 py-1.5 text-sm text-slate-900 shadow-xs"
        />
      </label>
      {children}
      <Botao type="submit" variante="secundario">
        Ver período
      </Botao>
    </form>
  );
}

export const classeFiltro =
  "rounded-lg border border-slate-200 bg-superficie px-3 py-1.5 text-sm text-slate-900 shadow-xs";
