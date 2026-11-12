"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { cx } from "@/components/ui";
import type { IdBloco, RegraBloco } from "@/lib/financeiro/relatorio-mensal";

// Tela de montagem do relatório do mês: chaves dos blocos à esquerda, o documento à direita. Na impressão só o
// documento sai. Nesta etapa as escolhas e o recado ficam guardados só neste navegador (nada vai para o banco).

export type OpcaoBloco = {
  id: IdBloco;
  codigo: string;
  nome: string;
  folha: string;
  regra: RegraBloco;
  padrao: boolean;
  explicacao: string;
  disponivel: boolean; // há dado para ele neste mês
  motivo?: string; // por que está escondido, quando não está disponível
};

type Estado = {
  ligados: Set<IdBloco>;
  dreAberta: boolean;
  recado: string;
  nota: string;
};

const Contexto = createContext<Estado | null>(null);
const useEstadoRelatorio = () => useContext(Contexto)!;

const ler = (chave: string) => {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
};
const gravar = (chave: string, valor: string) => {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // navegador sem armazenamento: as escolhas valem só até fechar a página
  }
};

export function Montagem({
  empresaId,
  mes,
  meses,
  opcoes,
  voltar,
  children,
}: {
  empresaId: string;
  mes: string;
  meses: { valor: string; rotulo: string }[];
  opcoes: OpcaoBloco[];
  voltar: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const chaveEscolhas = `axis:relatorio-mensal:${empresaId}`;
  const chaveTextos = `axis:relatorio-mensal:${empresaId}:${mes}`;
  const padrao = () => new Set(opcoes.filter((o) => o.padrao).map((o) => o.id));
  const [escolhidos, setEscolhidos] = useState<Set<IdBloco>>(padrao);
  const [dreAberta, setDreAberta] = useState(false);
  const [recado, setRecado] = useState("");
  const [nota, setNota] = useState("");
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- lê o que ficou guardado neste navegador depois de montar */
    const e = ler(chaveEscolhas);
    if (e) {
      try {
        const x = JSON.parse(e) as { ligados?: IdBloco[]; dreAberta?: boolean };
        if (Array.isArray(x.ligados)) setEscolhidos(new Set(x.ligados));
        setDreAberta(!!x.dreAberta);
      } catch {}
    }
    const t = ler(chaveTextos);
    if (t) {
      try {
        const x = JSON.parse(t) as { recado?: string; nota?: string };
        setRecado(x.recado ?? "");
        setNota(x.nota ?? "");
      } catch {}
    } else {
      setRecado("");
      setNota("");
    }
    setCarregado(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [chaveEscolhas, chaveTextos]);

  useEffect(() => {
    if (carregado) gravar(chaveEscolhas, JSON.stringify({ ligados: [...escolhidos], dreAberta }));
  }, [carregado, chaveEscolhas, escolhidos, dreAberta]);
  useEffect(() => {
    if (carregado) gravar(chaveTextos, JSON.stringify({ recado, nota }));
  }, [carregado, chaveTextos, recado, nota]);

  // O que sai no documento: fixos sempre; os outros se a equipe ligou e se há dado.
  const ligados = new Set(
    opcoes
      .filter((o) => o.disponivel && o.regra !== "futuro" && (o.regra === "fixo" || escolhidos.has(o.id)))
      .map((o) => o.id),
  );

  const alternar = (id: IdBloco) =>
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const folhas = [...new Set(opcoes.map((o) => o.folha))];

  return (
    <Contexto.Provider value={{ ligados, dreAberta, recado, nota }}>
      <div className="sempre-claro min-h-dvh bg-slate-100 text-slate-900 print:bg-white">
        <div className="nao-imprimir sticky top-0 z-10 border-b border-slate-200 bg-superficie">
          <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2">
            <Link href={voltar} className="text-sm text-slate-500 hover:text-slate-900">
              ← Voltar ao financeiro
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Mês
                <select
                  id="mes-relatorio"
                  value={mes}
                  onChange={(e) => router.push(`?mes=${e.target.value}`)}
                  className="rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-sm text-slate-900"
                >
                  {meses.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <BotaoImprimir />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl gap-8 px-4 py-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] print:block print:max-w-none print:p-0">
          <aside className="nao-imprimir mb-6 space-y-5 lg:sticky lg:top-20 lg:mb-0 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <div className="rounded-xl border border-slate-200 bg-superficie p-4">
              <p className="text-sm font-semibold text-slate-900">O que entra no relatório</p>
              <p className="mt-1 text-xs text-slate-500">
                As escolhas valem para esta empresa e ficam guardadas neste navegador. Para gerar o PDF, use &quot;Imprimir / Salvar PDF&quot; e
                escolha &quot;Salvar como PDF&quot;.
              </p>
              <div className="mt-4 space-y-4">
                {folhas.map((f) => (
                  <div key={f}>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{f}</p>
                    <ul className="space-y-2">
                      {opcoes
                        .filter((o) => o.folha === f)
                        .map((o) => (
                          <ItemBloco
                            key={o.id}
                            opcao={o}
                            ligado={ligados.has(o.id)}
                            escolhido={escolhidos.has(o.id)}
                            alternar={() => alternar(o.id)}
                            extra={
                              o.id === "dre" ? (
                                <span className="mt-1 inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
                                  {[
                                    [false, "Só as 12 linhas"],
                                    [true, "Com as contas"],
                                  ].map(([v, r]) => (
                                    <button
                                      key={String(v)}
                                      type="button"
                                      onClick={() => setDreAberta(v as boolean)}
                                      aria-pressed={dreAberta === v}
                                      className={cx(
                                        "rounded px-2 py-0.5 font-medium",
                                        dreAberta === v ? "bg-superficie text-slate-900 shadow-xs" : "text-slate-500",
                                      )}
                                    >
                                      {r as string}
                                    </button>
                                  ))}
                                </span>
                              ) : null
                            }
                          />
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-superficie p-4">
              <label htmlFor="recado" className="text-sm font-semibold text-slate-900">
                Recado da assessoria
              </label>
              <p className="mt-0.5 text-xs text-slate-500">Um parágrafo curto sobre o mês. Em branco, o bloco não aparece.</p>
              <textarea
                id="recado"
                value={recado}
                onChange={(e) => setRecado(e.target.value)}
                rows={5}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm text-slate-900"
                placeholder="Ex.: Outubro foi o melhor mês do ano em faturamento…"
              />
              <label htmlFor="nota" className="mt-3 block text-sm font-semibold text-slate-900">
                Nota extra
              </label>
              <p className="mt-0.5 text-xs text-slate-500">Entra no fim, junto das notas sobre os números.</p>
              <textarea
                id="nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </aside>

          <div className="min-w-0 space-y-6 print:space-y-0">{children}</div>
        </div>
      </div>
    </Contexto.Provider>
  );
}

function ItemBloco({
  opcao,
  ligado,
  escolhido,
  alternar,
  extra,
}: {
  opcao: OpcaoBloco;
  ligado: boolean;
  escolhido: boolean;
  alternar: () => void;
  extra: ReactNode;
}) {
  const travado = opcao.regra === "fixo" || opcao.regra === "futuro" || !opcao.disponivel;
  const legenda =
    opcao.regra === "futuro"
      ? `Em breve. ${opcao.explicacao}`
      : !opcao.disponivel
        ? `Escondido: ${opcao.motivo ?? opcao.explicacao}`
        : opcao.regra === "fixo"
          ? "Sempre aparece."
          : opcao.explicacao;
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={opcao.nome}
        disabled={travado}
        onClick={alternar}
        className={cx(
          "relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors",
          ligado ? "bg-marca-600" : "bg-slate-300",
          travado && "cursor-not-allowed opacity-50",
        )}
      >
        <span className={cx("absolute top-0.5 size-3 rounded-full bg-white transition-all", ligado ? "right-0.5" : "left-0.5")} />
      </button>
      <span className="min-w-0">
        <span className={cx("font-medium", ligado ? "text-slate-900" : "text-slate-500")}>
          {opcao.nome}
          <span className="ml-1.5 text-xs font-normal text-slate-400">{opcao.codigo}</span>
        </span>
        <span className="block text-xs leading-snug text-slate-500">{legenda}</span>
        {opcao.disponivel && !travado && !escolhido && <span className="sr-only">desligado pela equipe</span>}
        {extra}
      </span>
    </li>
  );
}

// Um bloco do documento: some quando está desligado.
export function BlocoRelatorio({ id, className, children }: { id: IdBloco; className?: string; children: ReactNode }) {
  const { ligados } = useEstadoRelatorio();
  return (
    <section hidden={!ligados.has(id)} className={cx("sem-quebra", className)}>
      {children}
    </section>
  );
}

// A DRE em duas versões, já montadas no servidor: só as 12 linhas, ou com as contas abertas.
export function VersaoDre({ aberta, children }: { aberta: boolean; children: ReactNode }) {
  const { dreAberta } = useEstadoRelatorio();
  return <div hidden={dreAberta !== aberta}>{children}</div>;
}

export function Recado() {
  const { recado, ligados } = useEstadoRelatorio();
  if (!recado.trim() || !ligados.has("recado")) return null;
  return (
    <section className="sem-quebra">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Recado da assessoria</h3>
      <div className="whitespace-pre-wrap rounded-lg bg-marca-50 px-4 py-3 text-sm leading-relaxed text-slate-800">{recado.trim()}</div>
    </section>
  );
}

export function NotaExtra() {
  const { nota } = useEstadoRelatorio();
  if (!nota.trim()) return null;
  return <li className="whitespace-pre-wrap">{nota.trim()}</li>;
}

// Folha do documento: começa numa página nova na impressão.
export function Folha({ primeira, children }: { primeira?: boolean; children: ReactNode }) {
  return (
    <article
      className={cx(
        "mx-auto max-w-[52rem] space-y-7 bg-white px-6 py-8 shadow-sm sm:px-12 sm:py-10 print:max-w-none print:px-0 print:py-0 print:shadow-none",
        !primeira && "quebra-antes",
      )}
    >
      {children}
    </article>
  );
}
