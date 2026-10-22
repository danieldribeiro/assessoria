import type { ReactNode } from "react";
import { hoje } from "@/lib/datas";
import type { Periodo } from "@/lib/financeiro/periodo";
import { FiltrosAtivos, PainelFiltros, type FiltroAtivo } from "./filtros-ui";
import { SeletorPeriodo } from "./seletor-periodo";

// Barra de filtros das abas do financeiro (só consulta: nada é gravado). Usa GET, então o endereço guarda o filtro.
// Na linha: o período, as escolhas principais e o botão "Filtros", que abre os demais; à direita, as ações da aba.
// Embaixo, os filtros em uso, cada um com um X.
export function FiltroPeriodo({
  aba,
  periodo,
  principal,
  filtros,
  ativos = [],
  ocultos,
  acoes,
}: {
  aba: string;
  periodo: Periodo;
  principal?: ReactNode;
  filtros?: ReactNode;
  ativos?: FiltroAtivo[];
  ocultos?: Record<string, string>;
  acoes?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form id={`filtros-${aba}`} method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="aba" value={aba} />
          {Object.entries(ocultos ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <SeletorPeriodo periodo={periodo} hoje={hoje()} />
          {principal}
          {filtros && (
            <PainelFiltros contagem={ativos.length} chaves={ativos.flatMap((a) => a.chaves)}>
              {filtros}
            </PainelFiltros>
          )}
        </form>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      <FiltrosAtivos itens={ativos} />
    </div>
  );
}

export const classeFiltro =
  "rounded-lg border border-slate-200 bg-superficie px-3 py-1.5 text-sm text-slate-900 shadow-xs";

export function CampoFiltro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{rotulo}</span>
      {children}
    </label>
  );
}
