import Link from "next/link";
import { BotaoExcluir, SeletorImediato } from "@/components/controles";
import { CamposDiagnostico } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { Etiqueta, LinkBotao, classeBotao, cx } from "@/components/ui";
import { STATUS_DIAGNOSTICO } from "@/lib/dominio";
import { atrasada, diasUteisAte, formatarData, formatarPeriodo } from "@/lib/datas";
import { carregarDiagnostico, listarEquipe, resumoColeta } from "@/lib/consultas";
import { atualizarDiagnostico, excluirDiagnostico, mudarStatusDiagnostico } from "@/server/diagnosticos";
import { AbaAchados, AbaOportunidades } from "./priorizaveis";
import { AbaColeta } from "./coleta";
import { AbaIndicadores } from "./indicadores";
import { AbaPlano } from "./plano";
import { AbaVisaoGeral } from "./visao-geral";

const ABAS = ["visao", "coleta", "analise", "achados", "oportunidades", "plano"] as const;
type Aba = (typeof ABAS)[number];

export async function generateMetadata({ params }: PageProps<"/diagnosticos/[id]">) {
  const { id } = await params;
  const d = await carregarDiagnostico(id);
  return { title: d.empresa.nome };
}

export default async function PaginaDiagnostico({ params, searchParams }: PageProps<"/diagnosticos/[id]">) {
  const { id } = await params;
  const { aba: abaParam } = await searchParams;
  const aba: Aba = ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : "visao";

  const [d, equipe] = await Promise.all([carregarDiagnostico(id), listarEquipe()]);
  const coleta = resumoColeta(d.solicitacoes);
  const preenchidos = d.indicadores.filter((i) => i.valor !== null).length;
  const achadosAltos = d.achados.filter((a) => a.prioridade === "Alta").length;
  const oportunidadesAltas = d.oportunidades.filter((o) => o.prioridade === "Alta").length;
  const acoesAtrasadas = d.acoes.filter((a) => atrasada(a.prazo, a.status)).length;
  const acoesAbertas = d.acoes.filter((a) => a.status === "A fazer" || a.status === "Em andamento").length;

  const etapas: { aba: Aba; nome: string; valor: string; detalhe: string; alerta?: boolean }[] = [
    {
      aba: "coleta",
      nome: "Coleta",
      valor: `${coleta.recebidos}/${coleta.total}`,
      detalhe: coleta.faltam === 0 ? "completa" : `${coleta.faltam} faltando`,
    },
    {
      aba: "analise",
      nome: "Análise",
      valor: `${preenchidos}/${d.indicadores.length}`,
      detalhe: "indicadores",
    },
    {
      aba: "achados",
      nome: "Achados",
      valor: String(d.achados.length),
      detalhe: achadosAltos ? `${achadosAltos} de prioridade alta` : "registrados",
      alerta: achadosAltos > 0,
    },
    {
      aba: "oportunidades",
      nome: "Oportunidades",
      valor: String(d.oportunidades.length),
      detalhe: oportunidadesAltas ? `${oportunidadesAltas} de prioridade alta` : "registradas",
    },
    {
      aba: "plano",
      nome: "Plano de ação",
      valor: String(d.acoes.length),
      detalhe: acoesAtrasadas ? `${acoesAtrasadas} atrasada${acoesAtrasadas > 1 ? "s" : ""}` : `${acoesAbertas} em aberto`,
      alerta: acoesAtrasadas > 0,
    },
  ];

  const prazo = d.data_prevista && d.status !== "Concluído" ? diasUteisAte(d.data_prevista) : null;

  return (
    <>
      <nav aria-label="Caminho" className="mb-2 flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/empresas" className="hover:text-slate-900">
          Empresas
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/empresas/${d.empresa.id}`} className="truncate hover:text-slate-900">
          {d.empresa.nome}
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Diagnóstico {formatarPeriodo(d.periodo_inicio, d.periodo_fim)}
            </h1>
            <SeletorImediato
              key={d.status}
              etiqueta
              rotulo="Etapa do diagnóstico"
              valor={d.status}
              opcoes={STATUS_DIAGNOSTICO}
              acao={mudarStatusDiagnostico.bind(null, d.id)}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>
              Responsável <span className="text-slate-700">{d.responsavel?.nome ?? "—"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              Entrega <span className="text-slate-700">{formatarData(d.data_prevista)}</span>
              {prazo !== null &&
                (prazo < 0 ? (
                  <Etiqueta tom="vermelho">atrasado</Etiqueta>
                ) : prazo <= 2 ? (
                  <Etiqueta tom="ambar">{prazo === 0 ? "hoje" : `${prazo} dia${prazo > 1 ? "s" : ""} úte${prazo > 1 ? "is" : "il"}`}</Etiqueta>
                ) : (
                  <span className="text-slate-400">({prazo} dias úteis)</span>
                ))}
            </span>
            {d.pasta_url && (
              <a href={d.pasta_url} target="_blank" rel="noreferrer" className="text-marca-700 hover:underline">
                Pasta de documentos ↗
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PainelLateral
            titulo="Editar diagnóstico"
            gatilho="Editar"
            classeGatilho={classeBotao("secundario")}
            acao={atualizarDiagnostico.bind(null, d.id)}
            rodape={
              <BotaoExcluir
                acao={excluirDiagnostico.bind(null, d.id, d.empresa.id)}
                pergunta="Excluir este diagnóstico e tudo o que foi registrado nele? Isso não pode ser desfeito."
              />
            }
          >
            <CamposDiagnostico diagnostico={d} equipe={equipe} />
          </PainelLateral>
          <LinkBotao href={`/diagnosticos/${d.id}/relatorio`} variante="primario">
            Relatório final
          </LinkBotao>
        </div>
      </div>

      <nav aria-label="Etapas do diagnóstico" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex min-w-max items-stretch gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <li>
            <Link
              href={`/diagnosticos/${d.id}`}
              aria-current={aba === "visao" ? "page" : undefined}
              className={cx(
                "flex h-full flex-col justify-center rounded-md px-4 py-2 text-sm font-medium",
                aba === "visao" ? "bg-marca-600 text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              Visão geral
            </Link>
          </li>
          {etapas.map((e, i) => (
            <li key={e.aba} className="flex items-center gap-1">
              {i === 0 ? (
                <span className="mx-1 h-8 w-px bg-slate-200" aria-hidden />
              ) : (
                <span className="px-1 text-slate-300" aria-hidden>
                  →
                </span>
              )}
              <Link
                href={`/diagnosticos/${d.id}?aba=${e.aba}`}
                aria-current={aba === e.aba ? "page" : undefined}
                className={cx(
                  "flex min-w-28 flex-col rounded-md px-3 py-2 sm:min-w-32 sm:px-4",
                  aba === e.aba ? "bg-marca-600 text-white" : "hover:bg-slate-50",
                )}
              >
                <span className={cx("text-xs font-medium", aba === e.aba ? "text-marca-100" : "text-slate-500")}>
                  {e.nome}
                </span>
                <span className="text-lg font-semibold leading-tight">{e.valor}</span>
                <span
                  className={cx(
                    "text-xs",
                    aba === e.aba ? "text-marca-100" : e.alerta ? "text-red-600" : "text-slate-500",
                  )}
                >
                  {e.detalhe}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {aba === "visao" && <AbaVisaoGeral d={d} />}
      {aba === "coleta" && <AbaColeta d={d} />}
      {aba === "analise" && <AbaIndicadores d={d} />}
      {aba === "achados" && <AbaAchados d={d} />}
      {aba === "oportunidades" && <AbaOportunidades d={d} />}
      {aba === "plano" && <AbaPlano d={d} />}
    </>
  );
}
