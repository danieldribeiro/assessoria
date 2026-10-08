"use client";

import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { avisar } from "@/components/avisos";
import { EtiquetaPrioridade, tomDoStatus } from "@/components/etiquetas";
import { Campo, Selecao, cx, tons } from "@/components/ui";
import { NOTAS, PRIORIDADES, calcularPrioridade, type Prioridade } from "@/lib/dominio";

// Seletor que grava assim que o valor muda (status, prioridade...).
// Com `etiqueta`, aparece como a etiqueta colorida do status, com uma seta indicando que dá para trocar.
export function SeletorImediato({
  valor,
  opcoes,
  acao,
  className,
  rotulo,
  etiqueta,
}: {
  valor: string;
  opcoes: readonly string[];
  acao: (valor: string) => Promise<unknown>;
  className?: string;
  rotulo: string;
  etiqueta?: boolean;
}) {
  const [atual, setAtual] = useState(valor);
  const [pendente, iniciar] = useTransition();

  function mudar(novo: string) {
    const anterior = atual;
    setAtual(novo);
    iniciar(async () => {
      try {
        await acao(novo);
        avisar(`${rotulo}: ${novo}`);
      } catch {
        setAtual(anterior);
        avisar("Não foi possível salvar. Tente de novo.", "erro");
      }
    });
  }

  return (
    <span className={cx("relative inline-flex", pendente && "opacity-60")}>
      <select
        aria-label={rotulo}
        title={rotulo}
        value={atual}
        disabled={pendente}
        onChange={(e) => mudar(e.target.value)}
        className={cx(
          "cursor-pointer appearance-none focus:outline-none",
          etiqueta
            ? cx(
                "rounded-full py-0.5 pl-2.5 pr-6 text-xs font-medium ring-1 ring-inset hover:brightness-95",
                tons[tomDoStatus(atual)],
              )
            : "rounded-md border border-slate-200 bg-white py-1 pl-2.5 pr-7 text-sm hover:border-slate-300 focus:border-marca-600",
          className,
        )}
      >
        {opcoes.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="currentColor"
        className={cx(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-60",
          etiqueta ? "right-1.5 size-3.5" : "right-2 size-4",
        )}
      >
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
      </svg>
    </span>
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
        if (!confirm(pergunta)) return;
        iniciar(async () => {
          try {
            await acao();
            avisar("Excluído");
          } catch (e) {
            unstable_rethrow(e); // o redirect() depois de excluir não é erro
            avisar("Não foi possível excluir. Tente de novo.", "erro");
          }
        });
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
  aoMudar,
}: {
  nome: string;
  rotulo: string;
  legendas: readonly string[];
  valor?: number;
  aoMudar?: (n: number) => void;
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
              onChange={() => aoMudar?.(n)}
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

// Bloco de priorização dos formulários: mostra a prioridade resultante enquanto as notas mudam.
export function PriorizacaoAoVivo({
  item,
}: {
  item?: { nota_impacto: number; nota_urgencia: number; nota_esforco: number; prioridade_manual: string | null };
}) {
  const [impacto, setImpacto] = useState(item?.nota_impacto ?? 2);
  const [urgencia, setUrgencia] = useState(item?.nota_urgencia ?? 2);
  const [esforco, setEsforco] = useState(item?.nota_esforco ?? 2);
  const [manual, setManual] = useState(item?.prioridade_manual ?? "");
  const automatica = calcularPrioridade(impacto, urgencia, esforco);
  const final = (manual || automatica) as Prioridade;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Priorização</p>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {manual ? "Ajustada para" : "Resultado"}
          <EtiquetaPrioridade prioridade={final} manual={!!manual} />
        </span>
      </div>
      <NotaUmATres nome="nota_impacto" rotulo="Impacto" legendas={NOTAS.impacto} valor={impacto} aoMudar={setImpacto} />
      <NotaUmATres
        nome="nota_urgencia"
        rotulo="Urgência"
        legendas={NOTAS.urgencia}
        valor={urgencia}
        aoMudar={setUrgencia}
      />
      <NotaUmATres nome="nota_esforco" rotulo="Esforço" legendas={NOTAS.esforco} valor={esforco} aoMudar={setEsforco} />
      <Campo rotulo="Prioridade" dica="Impacto + Urgência + (4 − Esforço): 7 a 9 Alta, 5 e 6 Média, 3 e 4 Baixa">
        <Selecao
          name="prioridade_manual"
          vazio={`Automática (${automatica})`}
          opcoes={PRIORIDADES.map((p) => ({ valor: p, rotulo: `${p} (ajuste manual)` }))}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
      </Campo>
    </div>
  );
}
