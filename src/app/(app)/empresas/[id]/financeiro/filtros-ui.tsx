"use client";

import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { classeBotao, cx } from "@/components/ui";

export type FiltroAtivo = { chaves: string[]; rotulo: string };

function useSemChaves() {
  const caminho = usePathname();
  const busca = useSearchParams();
  return (chaves: string[]) => {
    const q = new URLSearchParams(busca.toString());
    for (const c of chaves) q.delete(c);
    return `${caminho}?${q}`;
  };
}

// Botão "Filtros (2)" que abre os filtros secundários. Fechado, os campos continuam no formulário (só ficam
// escondidos), então o período e a ordem levam junto o que já está escolhido.
export function PainelFiltros({ contagem, chaves, children }: { contagem: number; chaves: string[]; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const semChaves = useSemChaves();

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

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={cx(classeBotao("secundario"), contagem > 0 && "border-marca-200 text-marca-700")}
      >
        <SlidersHorizontal />
        Filtros
        {contagem > 0 && (
          <span className="rounded-full bg-marca-600 px-1.5 text-xs leading-5 font-semibold text-white tabular-nums">{contagem}</span>
        )}
      </button>
      <div
        className={cx(
          "absolute left-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-superficie shadow-lg sm:w-96",
          !aberto && "hidden",
        )}
      >
        <div className="grid gap-3 p-4 [&_select]:w-full [&_select]:max-w-none">{children}</div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
          <Link href={semChaves(chaves)} className="text-sm font-medium text-slate-500 hover:text-slate-900">
            Limpar filtros
          </Link>
          <button type="submit" className={classeBotao("primario")}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// Filtros em uso, cada um com um X para tirar só ele.
export function FiltrosAtivos({ itens }: { itens: FiltroAtivo[] }) {
  const semChaves = useSemChaves();
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {itens.map((f) => (
        <Link
          key={f.chaves.join()}
          href={semChaves(f.chaves)}
          aria-label={`Tirar o filtro ${f.rotulo}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-superficie py-0.5 pr-1.5 pl-2.5 text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        >
          <span className="truncate">{f.rotulo}</span>
          <X className="size-3.5 shrink-0 text-slate-400" />
        </Link>
      ))}
      {itens.length > 1 && (
        <Link href={semChaves(itens.flatMap((f) => f.chaves))} className="px-1.5 text-xs font-medium text-marca-700 hover:underline">
          Limpar tudo
        </Link>
      )}
    </div>
  );
}

// Escolha entre poucas opções ("Competência | Caixa"), aplicada na hora. O campo escondido mantém a escolha
// quando o resto do formulário é enviado.
export function Alternador({ nome, valor, opcoes, rotulo }: { nome: string; valor: string; opcoes: { valor: string; rotulo: string }[]; rotulo: string }) {
  const caminho = usePathname();
  const busca = useSearchParams();
  const href = (v: string) => {
    const q = new URLSearchParams(busca.toString());
    q.set(nome, v);
    return `${caminho}?${q}`;
  };
  return (
    <div role="group" aria-label={rotulo} className="inline-flex rounded-lg bg-slate-100 p-1">
      <input type="hidden" name={nome} value={valor} />
      {opcoes.map((o) => (
        <Link
          key={o.valor}
          href={href(o.valor)}
          aria-current={o.valor === valor ? "true" : undefined}
          className={cx(
            "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap",
            o.valor === valor ? "bg-superficie text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.rotulo}
        </Link>
      ))}
    </div>
  );
}

// Lista que aplica a escolha assim que muda (sem botão).
export function SelectAuto(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
