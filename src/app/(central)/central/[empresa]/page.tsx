import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  FileText,
  ListChecks,
  MessageSquareQuote,
  Target,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EtiquetaPrioridade, EtiquetaStatus } from "@/components/etiquetas";
import { iniciaisPessoa } from "@/components/responsaveis";
import { CabecalhoCartao, Cartao, Etiqueta, LogoEmpresa, Vazio, cx } from "@/components/ui";
import {
  comCores,
  diagnosticoDaCentral,
  diagnosticosPublicados,
  empresaDaCentral,
  perfilAtual,
  type IndicadorComCor,
} from "@/lib/central";
import { CATEGORIAS, NOME_COR, type Cor } from "@/lib/dominio";
import { atrasada, formatarData, formatarPeriodo, formatarValor } from "@/lib/datas";

export async function generateMetadata({ params }: PageProps<"/central/[empresa]">) {
  const { empresa } = await params;
  const perfil = await perfilAtual();
  const e = perfil && (await empresaDaCentral(empresa, perfil.papel));
  return { title: e?.nome ?? "Central" };
}

const ESTILO: Record<Cor, { icone: typeof CircleX; texto: string; fundo: string; borda: string; ponto: string }> = {
  ruim: {
    icone: CircleX,
    texto: "text-red-700",
    fundo: "bg-red-50",
    borda: "border-red-200",
    ponto: "bg-red-500",
  },
  atencao: {
    icone: CircleAlert,
    texto: "text-amber-700",
    fundo: "bg-amber-50",
    borda: "border-amber-200",
    ponto: "bg-amber-500",
  },
  bom: {
    icone: CircleCheck,
    texto: "text-emerald-700",
    fundo: "bg-emerald-50",
    borda: "border-emerald-200",
    ponto: "bg-emerald-500",
  },
};
const ORDEM_CORES: Cor[] = ["ruim", "atencao", "bom"];

const dataHora = (iso: string) => formatarData(iso.slice(0, 10));
// Para o dono, "612" diz mais que "612 qtd".
const valor = (v: number | null, unidade: string | null) => formatarValor(v, unidade === "qtd" ? null : unidade);

export default async function PaginaCentralEmpresa({ params, searchParams }: PageProps<"/central/[empresa]">) {
  const { empresa: empresaId } = await params;
  const { d: escolhido } = await searchParams;
  const perfil = await perfilAtual();
  if (!perfil) notFound();
  const [empresa, publicados] = await Promise.all([
    empresaDaCentral(empresaId, perfil.papel),
    diagnosticosPublicados(empresaId),
  ]);
  if (!empresa) notFound();

  const atualId = publicados.find((p) => p.id === escolhido)?.id ?? publicados[0]?.id;
  const posicao = publicados.findIndex((p) => p.id === atualId);
  const anteriorId = posicao >= 0 ? publicados[posicao + 1]?.id : undefined;
  const [d, anterior] = await Promise.all([
    atualId ? diagnosticoDaCentral(atualId) : null,
    anteriorId ? diagnosticoDaCentral(anteriorId) : null,
  ]);

  const cabecalho = (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <LogoEmpresa nome={empresa.nome} logo={empresa.logo_url} largo className="size-14 text-lg" />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{empresa.nome}</h1>
        {d && (
          <p className="mt-1 text-sm text-slate-500">
            Diagnóstico de {formatarPeriodo(d.periodo_inicio, d.periodo_fim)} · publicado em{" "}
            {dataHora(d.publicado_em!)}
          </p>
        )}
      </div>
      {publicados.length > 1 && (
        <nav aria-label="Diagnósticos" className="flex flex-wrap gap-1.5 sm:ml-auto">
          {publicados.map((p) => (
            <Link
              key={p.id}
              href={`/central/${empresaId}?d=${p.id}`}
              aria-current={p.id === atualId ? "true" : undefined}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                p.id === atualId
                  ? "bg-marca-600 text-white ring-marca-600"
                  : "bg-superficie text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {formatarPeriodo(p.periodo_inicio, p.periodo_fim)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );

  if (!d)
    return (
      <>
        {cabecalho}
        <Cartao>
          <Vazio icone={<FileText />}>
            {perfil.papel === "equipe"
              ? "Nenhum diagnóstico desta clínica foi publicado. Publique na Visão geral do diagnóstico para o dono ver o resumo aqui."
              : "A assessoria ainda está preparando o seu diagnóstico. Assim que ele for publicado, o resumo aparece aqui."}
          </Vazio>
        </Cartao>
      </>
    );

  const indicadores = comCores(
    d.indicadores.filter((i) => i.valor !== null),
    anterior?.indicadores,
  );
  const comSemaforo = indicadores.filter((i) => i.cor);
  const contexto = indicadores.filter((i) => !i.cor);
  const porCor = (c: Cor) => comSemaforo.filter((i) => i.cor === c);

  const prioridades = d.achados.filter((a) => a.status === "Aberto" || a.status === "Endereçado no plano").slice(0, 3);
  const acoes = d.acoes;
  const concluidas = acoes.filter((a) => a.status === "Concluída").length;
  const progresso = acoes.length ? Math.round((concluidas / acoes.length) * 100) : 0;
  const proximas = acoes.filter((a) => a.status !== "Concluída").slice(0, 6);
  const atrasadas = acoes.filter((a) => atrasada(a.prazo, a.status)).length;
  const areas = CATEGORIAS.filter((c) => comSemaforo.some((i) => i.categoria === c));

  return (
    <>
      {cabecalho}

      {d.recado && (
        <Cartao className="mb-6 flex gap-4 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-marca-100 text-sm font-semibold text-marca-700">
            {d.responsavel?.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.responsavel.foto_url} alt="" className="size-full object-cover" />
            ) : d.responsavel ? (
              iniciaisPessoa(d.responsavel.nome)
            ) : (
              <MessageSquareQuote className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500">
              Recado {d.responsavel ? `de ${d.responsavel.nome}` : "da assessoria"}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{d.recado}</p>
          </div>
        </Cartao>
      )}

      {comSemaforo.length > 0 && (
        <section aria-labelledby="titulo-semaforo" className="mb-8">
          <h2 id="titulo-semaforo" className="mb-3 text-lg font-semibold text-slate-900">
            Como está o seu negócio
          </h2>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {ORDEM_CORES.map((c) => {
              const e = ESTILO[c];
              return (
                <a
                  key={c}
                  href={`#cor-${c}`}
                  className={cx("rounded-xl border p-4 transition-shadow hover:shadow-sm", e.fundo, e.borda)}
                >
                  <e.icone className={cx("mb-2 size-5", e.texto)} />
                  <div className={cx("text-3xl font-bold tabular-nums", e.texto)}>{porCor(c).length}</div>
                  <div className={cx("text-sm font-medium", e.texto)}>{NOME_COR[c]}</div>
                </a>
              );
            })}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {ORDEM_CORES.map((c) => (
              <ColunaCor key={c} cor={c} itens={porCor(c)} />
            ))}
          </div>
        </section>
      )}

      {areas.length > 0 && (
        <section aria-labelledby="titulo-areas" className="mb-8">
          <h2 id="titulo-areas" className="mb-3 text-lg font-semibold text-slate-900">
            Por área
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {areas.map((area) => {
              const itens = comSemaforo.filter((i) => i.categoria === area);
              const dono = d.donos_area[area];
              return (
                <Cartao key={area} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{area}</h3>
                    <div className="flex gap-1.5 text-xs font-semibold tabular-nums">
                      {ORDEM_CORES.map((c) => {
                        const n = itens.filter((i) => i.cor === c).length;
                        return n ? (
                          <span key={c} title={NOME_COR[c]} className={cx("inline-flex items-center gap-1", ESTILO[c].texto)}>
                            <span className={cx("size-2 rounded-full", ESTILO[c].ponto)} />
                            {n}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <BarraCores itens={itens} />
                  {dono && <div className="mt-3 text-xs text-slate-500">Acompanhado por {dono.nome}</div>}
                </Cartao>
              );
            })}
          </div>
        </section>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <Cartao className="lg:col-span-3">
          <CabecalhoCartao titulo="O que fazer primeiro" icone={<Target />} />
          {prioridades.length === 0 ? (
            <Vazio>Nenhum ponto em aberto.</Vazio>
          ) : (
            <ol className="divide-y divide-slate-100">
              {prioridades.map((a, i) => {
                const ligadas = acoes.filter((c) => c.achado_id === a.id);
                return (
                  <li key={a.id} className="flex gap-4 px-5 py-4">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{a.titulo}</span>
                        <EtiquetaPrioridade prioridade={a.prioridade} />
                      </div>
                      {(a.impacto || a.descricao) && (
                        <p className="mt-1 line-clamp-3 text-sm text-slate-600">{a.impacto || a.descricao}</p>
                      )}
                      {ligadas.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {ligadas.map((c) => (
                            <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                              <ListChecks className="size-4 text-slate-400" />
                              {c.acao}
                              <EtiquetaStatus status={c.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Cartao>

        <Cartao className="lg:col-span-2">
          <CabecalhoCartao titulo="Plano de ação" icone={<ListChecks />}>
            {atrasadas > 0 && <Etiqueta tom="vermelho">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</Etiqueta>}
          </CabecalhoCartao>
          {acoes.length === 0 ? (
            <Vazio>O plano de ação ainda não foi montado.</Vazio>
          ) : (
            <>
              <div className="px-5 pt-4">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-medium text-slate-900">
                    {concluidas} de {acoes.length} ações concluídas
                  </span>
                  <span className="text-slate-500">{progresso}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progresso}%` }} />
                </div>
              </div>
              <ul className="mt-3 divide-y divide-slate-100">
                {proximas.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="text-sm text-slate-900">{a.acao}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <EtiquetaStatus status={a.status} />
                      {a.prazo && (
                        <span className={atrasada(a.prazo, a.status) ? "font-medium text-red-600" : undefined}>
                          {atrasada(a.prazo, a.status) ? "Atrasada desde" : "Até"} {formatarData(a.prazo)}
                        </span>
                      )}
                      {a.responsavel && <span>· {a.responsavel}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>
      </div>

      {contexto.length > 0 && (
        <section aria-labelledby="titulo-numeros" className="mb-8">
          <h2 id="titulo-numeros" className="mb-3 text-lg font-semibold text-slate-900">
            Outros números do período
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {contexto.map((i) => (
              <Cartao key={i.id} className="p-4">
                <div className="text-xs text-slate-500">{i.nome}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {valor(i.valor, i.unidade)}
                </div>
                <Tendencia i={i} />
              </Cartao>
            ))}
          </div>
        </section>
      )}

      <Cartao>
        <CabecalhoCartao titulo="Relatórios" icone={<FileText />} contagem={publicados.length} />
        <ul className="divide-y divide-slate-100">
          {publicados.map((p) => (
            <li key={p.id}>
              <Link
                href={`/central/relatorio/${p.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/70"
              >
                <span className="font-medium text-slate-900">
                  Diagnóstico {formatarPeriodo(p.periodo_inicio, p.periodo_fim)}
                </span>
                <span className="text-sm text-marca-700">Abrir relatório</span>
              </Link>
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  );
}

function ColunaCor({ cor, itens }: { cor: Cor; itens: IndicadorComCor[] }) {
  const e = ESTILO[cor];
  return (
    <Cartao id={`cor-${cor}`} className="scroll-mt-6 self-start overflow-hidden">
      <div className={cx("flex items-center gap-2 border-b px-5 py-3", e.fundo, e.borda)}>
        <e.icone className={cx("size-4", e.texto)} />
        <h3 className={cx("text-sm font-semibold", e.texto)}>{NOME_COR[cor]}</h3>
      </div>
      {itens.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">Nenhum indicador aqui.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {itens.map((i) => (
            <li key={i.id} className="px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-900">{i.nome}</span>
                <span className={cx("shrink-0 text-lg font-bold tabular-nums", e.texto)}>
                  {valor(i.valor, i.unidade)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                {i.referencia && <span>Esperado: {i.referencia}</span>}
                <Tendencia i={i} />
              </div>
              {i.significado && <p className="mt-1.5 text-sm text-slate-600">{i.significado}</p>}
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

// Seta em relação ao diagnóstico anterior. Verde quando melhorou, pelo sentido da faixa.
function Tendencia({ i }: { i: IndicadorComCor }) {
  if (i.anterior === null || i.valor === null || Number(i.anterior) === Number(i.valor)) return null;
  const subiu = Number(i.valor) > Number(i.anterior);
  const menorEhMelhor = i.ref_max !== null && i.ref_min === null;
  const sentidoConhecido = i.ref_min !== null || i.ref_max !== null;
  const melhorou = menorEhMelhor ? !subiu : subiu;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5",
        !sentidoConhecido ? "text-slate-500" : melhorou ? "text-emerald-600" : "text-red-600",
      )}
    >
      <Icone className="size-3.5" />
      antes {valor(i.anterior, i.unidade)}
    </span>
  );
}

function BarraCores({ itens }: { itens: IndicadorComCor[] }): ReactNode {
  if (itens.length === 0) return <div className="mt-3 h-2 rounded-full bg-slate-100" />;
  return (
    <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
      {ORDEM_CORES.map((c) => {
        const n = itens.filter((i) => i.cor === c).length;
        return n ? <div key={c} className={ESTILO[c].ponto} style={{ flexGrow: n }} /> : null;
      })}
    </div>
  );
}
