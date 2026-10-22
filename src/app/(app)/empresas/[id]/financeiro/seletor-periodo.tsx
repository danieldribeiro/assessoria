"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { deslocar, nomePeriodo, somarDiasData, type Periodo } from "@/lib/financeiro/periodo";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const classeCampo = "rounded-lg border border-slate-200 bg-superficie px-2 py-1.5 text-sm text-slate-900";

// Seletor de período "‹ Outubro 2026 ›". As setas andam o tamanho do período (um mês, vários meses ou alguns
// dias) e mantêm os outros filtros do endereço. Clicando no nome, escolhe-se um ou mais meses, ou dias
// quaisquer ("Dias": 01/10 a 05/10). Os campos escondidos `de` e `ate` vão junto com o formulário de filtros.
export function SeletorPeriodo({ periodo, hoje }: { periodo: Periodo; hoje: string }) {
  const caminho = usePathname();
  const busca = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"meses" | "dias">(periodo.emMeses ? "meses" : "dias");
  const [mesDe, setMesDe] = useState(periodo.inicio.slice(0, 7));
  const [mesAte, setMesAte] = useState(periodo.fim.slice(0, 7));
  const [diaDe, setDiaDe] = useState(periodo.inicio);
  const [diaAte, setDiaAte] = useState(periodo.fim);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const link = (sentido: 1 | -1) => {
    const q = new URLSearchParams(busca.toString());
    const p = deslocar(periodo, sentido);
    q.set("de", p.de);
    q.set("ate", p.ate);
    return `${caminho}?${q}`;
  };
  const abrir = () => {
    setModo(periodo.emMeses ? "meses" : "dias");
    setMesDe(periodo.inicio.slice(0, 7));
    setMesAte(periodo.fim.slice(0, 7));
    setDiaDe(periodo.inicio);
    setDiaAte(periodo.fim);
    setAberto((a) => !a);
  };
  const ordenar = (a: string, b: string) => (b < a ? [b, a] : [a, b]);
  const [de, ate] = !aberto ? [periodo.de, periodo.ate] : modo === "meses" ? ordenar(mesDe, mesAte) : ordenar(diaDe || diaAte, diaAte || diaDe);
  const anoAtual = Number(periodo.inicio.slice(0, 4));
  const anos = Array.from({ length: 9 }, (_, i) => anoAtual - 6 + i);
  const classeSeta = "flex size-9 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900";
  const atalho = "rounded-md px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50";

  return (
    <div ref={caixa} className="relative">
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-superficie shadow-xs">
        <Link href={link(-1)} className={classeSeta} aria-label="Período anterior">
          <ChevronLeft className="size-4" />
        </Link>
        <button
          type="button"
          onClick={abrir}
          aria-expanded={aberto}
          aria-label={`Período: ${nomePeriodo(periodo)}. Escolher outro`}
          className="flex h-9 min-w-36 items-center sm:min-w-44 justify-center gap-2 border-x border-slate-200 px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          <CalendarDays className="size-4 text-slate-400" />
          {nomePeriodo(periodo)}
        </button>
        <Link href={link(1)} className={classeSeta} aria-label="Próximo período">
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <input type="hidden" name="de" value={de} />
      <input type="hidden" name="ate" value={ate} />

      {aberto && (
        <div className="absolute left-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-slate-200 bg-superficie p-4 shadow-lg">
          <div role="tablist" aria-label="Tipo de período" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {(["meses", "dias"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className={cx(
                  "rounded-md py-1 text-sm font-medium",
                  modo === m ? "bg-superficie text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {m === "meses" ? "Meses" : "Dias"}
              </button>
            ))}
          </div>

          {modo === "meses" ? (
            <>
              <EscolhaMes rotulo="De" valor={mesDe} anos={anos} onChange={(v) => {
                setMesDe(v);
                if (mesAte < v) setMesAte(v);
              }} />
              <EscolhaMes rotulo="Até" valor={mesAte < mesDe ? mesDe : mesAte} anos={anos} onChange={setMesAte} />
              <button type="button" onClick={() => setMesAte(mesDe)} className={atalho}>
                Só um mês
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">De</span>
                  <input type="date" value={diaDe} onChange={(e) => {
                    setDiaDe(e.target.value);
                    if (e.target.value && diaAte < e.target.value) setDiaAte(e.target.value);
                  }} className={cx(classeCampo, "w-full")} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Até</span>
                  <input type="date" value={diaAte} min={diaDe} onChange={(e) => setDiaAte(e.target.value)} className={cx(classeCampo, "w-full")} />
                </label>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => (setDiaDe(hoje), setDiaAte(hoje))} className={atalho}>
                  Hoje
                </button>
                <button type="button" onClick={() => (setDiaDe(somarDiasData(hoje, -6)), setDiaAte(hoje))} className={atalho}>
                  Últimos 7 dias
                </button>
                <button type="button" onClick={() => setDiaAte(diaDe)} className={atalho}>
                  Só um dia
                </button>
              </div>
            </>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-3">
            <button type="submit" className="rounded-lg bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700">
              Ver período
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EscolhaMes({ rotulo, valor, anos, onChange }: { rotulo: string; valor: string; anos: number[]; onChange: (v: string) => void }) {
  const [a, m] = valor.split("-");
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-500">{rotulo}</legend>
      <div className="flex gap-2">
        <select aria-label={`Mês (${rotulo})`} value={m} onChange={(e) => onChange(`${a}-${e.target.value}`)} className={cx(classeCampo, "flex-1")}>
          {MESES.map((nome, i) => (
            <option key={nome} value={String(i + 1).padStart(2, "0")}>
              {nome}
            </option>
          ))}
        </select>
        <select aria-label={`Ano (${rotulo})`} value={a} onChange={(e) => onChange(`${e.target.value}-${m}`)} className={classeCampo}>
          {anos.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
