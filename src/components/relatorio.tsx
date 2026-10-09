import Link from "next/link";
import type { ReactNode } from "react";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { EtiquetaPrioridade } from "@/components/etiquetas";
import { NOTAS, type Achado, type Assessoria, type Oportunidade } from "@/lib/dominio";
import { formatarData, formatarPeriodo, formatarValor, hoje } from "@/lib/datas";
import { agruparPorCategoria, type DiagnosticoCompleto } from "@/lib/consultas";
import { tituloRelacionado } from "@/app/(app)/diagnosticos/[id]/plano";

function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-baseline gap-3 border-b-2 border-slate-900 pb-2 text-lg font-semibold text-slate-900">
        <span className="text-marca-600">{String(numero).padStart(2, "0")}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Paragrafos({ texto, vazio }: { texto: string | null; vazio: string }) {
  if (!texto) return <p className="text-sm italic text-slate-400">{vazio}</p>;
  return <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{texto}</div>;
}

function Campo({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="whitespace-pre-wrap text-sm text-slate-800">{texto}</div>
    </div>
  );
}

// Matriz Impacto × Esforço: canto superior esquerdo = alto impacto e baixo esforço.
function Matriz({ itens }: { itens: { codigo: string; item: Achado | Oportunidade }[] }) {
  const celula = (impacto: number, esforco: number) =>
    itens.filter((i) => i.item.nota_impacto === impacto && i.item.nota_esforco === esforco);
  const fundo = (impacto: number, esforco: number) => {
    const pontos = impacto + (4 - esforco);
    return pontos >= 5 ? "bg-emerald-50" : pontos >= 4 ? "bg-amber-50" : "bg-slate-50";
  };
  return (
    <div className="flex gap-2">
      <div className="flex w-6 items-center justify-center">
        <span className="-rotate-90 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">
          Impacto
        </span>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-[4.5rem_repeat(3,1fr)] gap-1">
          {[3, 2, 1].map((impacto) => (
            <div key={impacto} className="contents">
              <div className="flex items-center text-xs text-slate-500">{NOTAS.impacto[impacto - 1]}</div>
              {[1, 2, 3].map((esforco) => (
                <div key={esforco} className={`min-h-16 rounded p-2 ${fundo(impacto, esforco)}`}>
                  <div className="flex flex-wrap gap-1">
                    {celula(impacto, esforco).map(({ codigo, item }) => (
                      <span
                        key={codigo}
                        title={item.titulo}
                        className="rounded bg-superficie px-1.5 py-0.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-300"
                      >
                        {codigo}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div />
          {[1, 2, 3].map((esforco) => (
            <div key={esforco} className="text-center text-xs text-slate-500">
              {NOTAS.esforco[esforco - 1]}
            </div>
          ))}
        </div>
        <div className="mt-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Esforço</div>
      </div>
    </div>
  );
}

// O relatório final, usado pela equipe e pela central da clínica.
export function DocumentoRelatorio({
  d,
  assessoria,
  voltar,
}: {
  d: DiagnosticoCompleto;
  assessoria: Assessoria | null;
  voltar: { href: string; rotulo: string };
}) {
  const nomeAssessoria = assessoria?.nome_fantasia || assessoria?.razao_social;

  const problemas = d.achados.filter((a) => a.status !== "Descartado");
  const oportunidades = d.oportunidades.filter((o) => o.status !== "Descartada");
  const indicadores = d.indicadores.filter((i) => i.valor !== null);
  const acoes = d.acoes.filter((a) => a.status !== "Cancelada");
  const codigos = [
    ...problemas.map((item, i) => ({ codigo: `P${i + 1}`, item })),
    ...oportunidades.map((item, i) => ({ codigo: `O${i + 1}`, item })),
  ];

  let n = 0;
  return (
    <div className="sempre-claro min-h-dvh bg-slate-100 text-slate-900 print:bg-superficie">
      <div className="nao-imprimir sticky top-0 z-10 border-b border-slate-200 bg-superficie">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href={voltar.href} className="text-sm text-slate-500 hover:text-slate-900">
            ← {voltar.rotulo}
          </Link>
          <BotaoImprimir />
        </div>
      </div>

      <article className="mx-auto my-8 max-w-4xl bg-superficie px-12 py-14 shadow-sm print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="border-b border-slate-200 pb-10">
          {(assessoria?.logo_url || nomeAssessoria) && (
            <div className="mb-10 flex items-center justify-between gap-6">
              {assessoria?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assessoria.logo_url} alt={nomeAssessoria ?? ""} className="h-12 max-w-48 object-contain" />
              ) : (
                <span className="text-base font-semibold text-slate-900">{nomeAssessoria}</span>
              )}
              {d.empresa.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.empresa.logo_url} alt={d.empresa.nome} className="h-12 max-w-40 object-contain" />
              )}
            </div>
          )}
          <div className="text-sm font-semibold uppercase tracking-widest text-marca-600">Diagnóstico empresarial</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{d.empresa.nome}</h1>
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
            {[
              ["Período analisado", formatarPeriodo(d.periodo_inicio, d.periodo_fim)],
              ["Segmento", d.empresa.segmento],
              ["Data", formatarData(d.status === "Concluído" ? (d.data_prevista ?? hoje()) : hoje())],
              ["Responsável", d.responsavel?.nome ?? "—"],
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-xs text-slate-500">{rotulo}</dt>
                <dd className="font-medium text-slate-900">{valor}</dd>
              </div>
            ))}
          </dl>
        </header>

        <Secao numero={++n} titulo="Situação atual">
          <Paragrafos texto={d.situacao_atual} vazio="Resumo ainda não escrito (Visão geral → Conclusões)." />
        </Secao>

        <Secao numero={++n} titulo="Indicadores principais">
          {indicadores.length === 0 ? (
            <p className="text-sm italic text-slate-400">Nenhum indicador preenchido.</p>
          ) : (
            <div className="space-y-6">
              {agruparPorCategoria(indicadores).map(({ categoria, itens }) => (
                <div key={categoria} className="sem-quebra">
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">{categoria}</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {itens.map((i) => (
                        <tr key={i.id} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-4 text-slate-700">
                            {i.nome}
                            {i.observacao && <div className="mt-0.5 text-xs text-slate-500">{i.observacao}</div>}
                          </td>
                          <td className="w-40 py-2 text-right font-semibold tabular-nums text-slate-900">
                            {formatarValor(i.valor, i.unidade)}
                          </td>
                          <td className="w-40 py-2 pl-4 text-right text-xs text-slate-500">
                            {i.referencia && <>Ref.: {i.referencia}</>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Secao>

        <Secao numero={++n} titulo="Principais problemas">
          {problemas.length === 0 ? (
            <p className="text-sm italic text-slate-400">Nenhum problema registrado.</p>
          ) : (
            <div className="space-y-5">
              {problemas.map((a, i) => (
                <div key={a.id} className="sem-quebra rounded-lg border border-slate-200 p-5">
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <h3 className="font-semibold text-slate-900">
                      <span className="mr-2 text-slate-400">P{i + 1}</span>
                      {a.titulo}
                    </h3>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      {a.categoria}
                      <EtiquetaPrioridade prioridade={a.prioridade} />
                    </div>
                  </div>
                  {a.descricao && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{a.descricao}</p>}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo rotulo="Evidência" texto={a.evidencia} />
                    <Campo rotulo="Causa provável" texto={a.causa_provavel} />
                    <Campo rotulo="Impacto" texto={a.impacto} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Secao>

        <Secao numero={++n} titulo="Oportunidades">
          {oportunidades.length === 0 ? (
            <p className="text-sm italic text-slate-400">Nenhuma oportunidade registrada.</p>
          ) : (
            <div className="space-y-5">
              {oportunidades.map((o, i) => (
                <div key={o.id} className="sem-quebra rounded-lg border border-slate-200 p-5">
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <h3 className="font-semibold text-slate-900">
                      <span className="mr-2 text-slate-400">O{i + 1}</span>
                      {o.titulo}
                    </h3>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      {o.categoria}
                      <EtiquetaPrioridade prioridade={o.prioridade} />
                    </div>
                  </div>
                  {o.descricao && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{o.descricao}</p>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo rotulo="Potencial impacto" texto={o.potencial_impacto} />
                    <Campo rotulo="Esforço estimado" texto={o.esforco_estimado} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Secao>

        {codigos.length > 0 && (
          <Secao numero={++n} titulo="Prioridades">
            <div className="sem-quebra grid gap-8 md:grid-cols-[1fr_16rem]">
              <Matriz itens={codigos} />
              <div className="text-sm">
                <p className="mb-2 text-slate-600">
                  Itens no canto superior esquerdo têm maior impacto com menor esforço e devem vir primeiro.
                </p>
                <ul className="space-y-1">
                  {codigos
                    .filter((c) => c.item.prioridade === "Alta")
                    .map((c) => (
                      <li key={c.codigo} className="flex gap-2">
                        <span className="font-semibold text-slate-900">{c.codigo}</span>
                        <span className="text-slate-700">{c.item.titulo}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </Secao>
        )}

        <Secao numero={++n} titulo="Recomendações">
          <Paragrafos texto={d.recomendacoes} vazio="Recomendações ainda não escritas (Visão geral → Conclusões)." />
        </Secao>

        <Secao numero={++n} titulo="Plano de ação inicial">
          {acoes.length === 0 ? (
            <p className="text-sm italic text-slate-400">Nenhuma ação registrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Ação</th>
                  <th className="py-2 pr-3 font-semibold">Responsável</th>
                  <th className="py-2 pr-3 font-semibold">Prazo</th>
                  <th className="py-2 font-semibold">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {acoes.map((a) => {
                  const codigo = codigos.find((c) => c.item.id === (a.achado_id ?? a.oportunidade_id))?.codigo;
                  const relacionado = tituloRelacionado(d, a);
                  return (
                    <tr key={a.id} className="sem-quebra border-b border-slate-100 align-top">
                      <td className="py-2 pr-3 text-slate-800">
                        {a.acao}
                        {relacionado && (
                          <div className="text-xs text-slate-500">
                            {codigo ? `${codigo} · ` : ""}
                            {relacionado}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{a.responsavel ?? "—"}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-700">{formatarData(a.prazo)}</td>
                      <td className="py-2">
                        <EtiquetaPrioridade prioridade={a.prioridade} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Secao>

        {assessoria?.razao_social && (
          <footer className="mt-14 border-t border-slate-200 pt-4 text-xs text-slate-500">
            {[assessoria.razao_social, assessoria.cnpj && `CNPJ ${assessoria.cnpj}`, assessoria.email, assessoria.site]
              .filter(Boolean)
              .join(" · ")}
          </footer>
        )}
      </article>
    </div>
  );
}
