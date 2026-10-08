"use client";

import { useTransition } from "react";
import { cx } from "@/components/ui";

// Seletor que grava assim que o valor muda (status, prioridade...).
export function SeletorImediato({
  valor,
  opcoes,
  acao,
  className,
  rotulo,
}: {
  valor: string;
  opcoes: readonly string[];
  acao: (valor: string) => Promise<unknown>;
  className?: string;
  rotulo: string;
}) {
  const [pendente, iniciar] = useTransition();
  return (
    <select
      aria-label={rotulo}
      defaultValue={valor}
      disabled={pendente}
      onChange={(e) => {
        const novo = e.target.value;
        iniciar(async () => {
          await acao(novo);
        });
      }}
      className={cx(
        "cursor-pointer rounded-md border border-transparent bg-transparent py-1 pl-2 pr-7 text-sm hover:border-slate-300 focus:border-marca-600 focus:outline-none",
        pendente && "opacity-50",
        className,
      )}
    >
      {opcoes.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

export function BotaoExcluir({
  acao,
  pergunta,
  rotulo = "Excluir",
}: {
  acao: () => Promise<unknown>;
  pergunta: string;
  rotulo?: string;
}) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        if (confirm(pergunta)) iniciar(async () => void (await acao()));
      }}
      className="rounded-md px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pendente ? "Excluindo…" : rotulo}
    </button>
  );
}

export function BotaoAcao({
  acao,
  children,
  className,
}: {
  acao: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
}) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => iniciar(async () => void (await acao()))}
      className={cx(className, pendente && "opacity-50")}
    >
      {children}
    </button>
  );
}

// Três botões 1 · 2 · 3 para as notas de priorização (campo de formulário comum).
export function NotaUmATres({
  nome,
  rotulo,
  legendas,
  valor = 2,
}: {
  nome: string;
  rotulo: string;
  legendas: readonly string[];
  valor?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
        {[1, 2, 3].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name={nome}
              value={n}
              defaultChecked={valor === n}
              className="peer sr-only"
            />
            <span className="block rounded px-2 py-1.5 text-center text-xs text-slate-600 peer-checked:bg-white peer-checked:font-medium peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-marca-100">
              {n} · {legendas[n - 1]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
