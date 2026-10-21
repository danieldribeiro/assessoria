"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// "2026-10" + n meses → "2026-11".
export function somarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function nomePeriodo(de: string, ate: string) {
  const nome = (mes: string, comAno: boolean) => {
    const [a, m] = mes.split("-");
    return `${MESES[Number(m) - 1]}${comAno ? ` ${a}` : ""}`;
  };
  if (de === ate) return nome(de, true);
  const mesmoAno = de.slice(0, 4) === ate.slice(0, 4);
  return `${nome(de, !mesmoAno)} a ${nome(ate, true)}`;
}

// Seletor de mês "‹ Outubro 2026 ›". As setas andam um mês (ou o tamanho do período, se forem vários meses) e
// mantêm os outros filtros do endereço. Clicando no nome, escolhe-se o mês ou um intervalo de meses.
// Os campos escondidos `de` e `ate` vão junto com o formulário de filtros.
export function SeletorMes({ de, ate }: { de: string; ate: string }) {
  const caminho = usePathname();
  const busca = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState(de);
  const [fim, setFim] = useState(ate);
  const caixa = useRef<HTMLDivElement>(null);
  const meses = (Number(ate.slice(0, 4)) * 12 + Number(ate.slice(5))) - (Number(de.slice(0, 4)) * 12 + Number(de.slice(5))) + 1;

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

  const link = (n: number) => {
    const q = new URLSearchParams(busca.toString());
    q.set("de", somarMeses(de, n));
    q.set("ate", somarMeses(ate, n));
    return `${caminho}?${q}`;
  };
  const anoAtual = Number(de.slice(0, 4));
  const anos = Array.from({ length: 9 }, (_, i) => anoAtual - 6 + i);
  const classeSeta = "flex size-9 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900";

  return (
    <div ref={caixa} className="relative">
      <span className="mb-1 block text-xs font-medium text-slate-500">Período</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-superficie shadow-xs">
        <Link href={link(-meses)} className={classeSeta} aria-label={meses === 1 ? "Mês anterior" : "Período anterior"}>
          <ChevronLeft className="size-4" />
        </Link>
        <button
          type="button"
          onClick={() => {
            setInicio(de);
            setFim(ate);
            setAberto((a) => !a);
          }}
          aria-expanded={aberto}
          className="h-9 min-w-40 border-x border-slate-200 px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          {nomePeriodo(de, ate)}
        </button>
        <Link href={link(meses)} className={classeSeta} aria-label={meses === 1 ? "Próximo mês" : "Próximo período"}>
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <input type="hidden" name="de" value={aberto ? inicio : de} />
      <input type="hidden" name="ate" value={aberto ? (fim < inicio ? inicio : fim) : ate} />

      {aberto && (
        <div className="absolute left-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-superficie p-4 shadow-lg">
          <EscolhaMes rotulo="De" valor={inicio} anos={anos} onChange={(v) => {
            setInicio(v);
            if (fim < v) setFim(v);
          }} />
          <EscolhaMes rotulo="Até" valor={fim < inicio ? inicio : fim} anos={anos} onChange={setFim} />
          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={() => setFim(inicio)} className="text-xs font-medium text-marca-700 hover:underline">
              Só um mês
            </button>
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
  const classe = "rounded-lg border border-slate-200 bg-superficie px-2 py-1.5 text-sm text-slate-900";
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-500">{rotulo}</legend>
      <div className="flex gap-2">
        <select aria-label={`Mês (${rotulo})`} value={m} onChange={(e) => onChange(`${a}-${e.target.value}`)} className={cx(classe, "flex-1")}>
          {MESES.map((nome, i) => (
            <option key={nome} value={String(i + 1).padStart(2, "0")}>
              {nome}
            </option>
          ))}
        </select>
        <select aria-label={`Ano (${rotulo})`} value={a} onChange={(e) => onChange(`${e.target.value}-${m}`)} className={classe}>
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
