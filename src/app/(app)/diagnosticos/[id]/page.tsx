import {
  CalendarClock,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Pencil,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { BotaoExcluir, SeletorImediato } from "@/components/controles";
import { CamposDiagnostico } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { Cartao, Etiqueta, LinkBotao, classeBotao, cx, iniciais } from "@/components/ui";
import { CATEGORIAS, STATUS_DIAGNOSTICO } from "@/lib/dominio";
import { AvatarResponsavel } from "@/components/responsaveis";
import { atrasada, diasUteisAte, formatarData, formatarPeriodo } from "@/lib/datas";
import { carregarDiagnostico, resumoColeta, usuarioAtual } from "@/lib/consultas";
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
  const { aba: abaParam, de: deParam } = await searchParams;
  const de = typeof deParam === "string" ? deParam : undefined;
  const aba: Aba = ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : "visao";

  const [d, usuario] = await Promise.all([carregarDiagnostico(id), usuarioAtual()]);
  const equipe = d.equipe;
  const filtro = { de, usuarioId: usuario?.id };
  const coleta = resumoColeta(d.solicitacoes);
  const preenchidos = d.indicadores.filter((i) => i.valor !== null).length;
  const achadosAltos = d.achados.filter((a) => a.prioridade === "Alta").length;
  const oportunidadesAltas = d.oportunidades.filter((o) => o.prioridade === "Alta").length;
  const acoesAtrasadas = d.acoes.filter((a) => atrasada(a.prazo, a.status)).length;
  const acoesAbertas = d.acoes.filter((a) => a.status === "A fazer" || a.status === "Em andamento").length;

  const etapas: Etapa[] = [
    {
      aba: "coleta",
      icone: ClipboardList,
      feita: coleta.total > 0 && coleta.faltam === 0,
      nome: "Coleta",
      valor: `${coleta.recebidos}/${coleta.total}`,
      detalhe: coleta.faltam === 0 ? "completa" : `${coleta.faltam} faltando`,
    },
    {
      aba: "analise",
      icone: ChartColumn,
      feita: d.indicadores.length > 0 && preenchidos === d.indicadores.length,
      nome: "Análise",
      valor: `${preenchidos}/${d.indicadores.length}`,
      detalhe: "indicadores",
    },
    {
      aba: "achados",
      icone: TriangleAlert,
      feita: d.achados.length > 0,
      nome: "Achados",
      valor: String(d.achados.length),
      detalhe: achadosAltos ? `${achadosAltos} de prioridade alta` : "registrados",
      alerta: achadosAltos > 0,
    },
    {
      aba: "oportunidades",
      icone: Lightbulb,
      feita: d.oportunidades.length > 0,
      nome: "Oportunidades",
      valor: String(d.oportunidades.length),
      detalhe: oportunidadesAltas ? `${oportunidadesAltas} de prioridade alta` : "registradas",
    },
    {
      aba: "plano",
      icone: ListChecks,
      feita: d.acoes.length > 0,
      nome: "Plano de ação",
      valor: String(d.acoes.length),
      detalhe: acoesAtrasadas ? `${acoesAtrasadas} atrasada${acoesAtrasadas > 1 ? "s" : ""}` : `${acoesAbertas} em aberto`,
      alerta: acoesAtrasadas > 0,
    },
  ];

  const prazo = d.data_prevista && d.status !== "Concluído" ? diasUteisAte(d.data_prevista) : null;

  const meta = [
    { icone: UserRound, texto: d.responsavel ? `Coordenação: ${d.responsavel.nome}` : "Sem coordenação" },
    { icone: CalendarDays, texto: `Início ${formatarData(d.data_inicio)}` },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-lg font-semibold text-marca-700 sm:flex">
            {iniciais(d.empresa.nome)}
          </span>
          <div className="min-w-0">
            <Link
              href={`/empresas/${d.empresa.id}`}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
            >
              {d.empresa.nome}
              <ChevronRight className="size-3.5" />
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
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
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-500">
              {meta.map((m) => (
                <span key={m.texto} className="inline-flex items-center gap-1.5">
                  <m.icone className="size-4 text-slate-400" />
                  {m.texto}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-4 text-slate-400" />
                Entrega {formatarData(d.data_prevista)}
                {prazo !== null &&
                  (prazo < 0 ? (
                    <Etiqueta tom="vermelho">atrasado</Etiqueta>
                  ) : prazo <= 2 ? (
                    <Etiqueta tom="ambar">{prazo === 0 ? "hoje" : `${prazo} dia${prazo > 1 ? "s" : ""} úte${prazo > 1 ? "is" : "il"}`}</Etiqueta>
                  ) : (
                    <span className="text-slate-400">({prazo} dias úteis)</span>
                  ))}
              </span>
              {CATEGORIAS.some((c) => d.responsaveis_area[c]) && (
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                  {CATEGORIAS.filter((c) => d.responsaveis_area[c]).map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5">
                      <AvatarResponsavel perfil={equipe.find((p) => p.id === d.responsaveis_area[c])} className="size-5" />
                      {c}
                    </span>
                  ))}
                </span>
              )}
              {d.pasta_url && (
                <a
                  href={d.pasta_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-marca-700 hover:underline"
                >
                  <FolderOpen className="size-4" />
                  Pasta de documentos
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PainelLateral
            titulo="Editar diagnóstico"
            gatilho={
              <>
                <Pencil />
                Editar
              </>
            }
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
            <FileText />
            Relatório final
          </LinkBotao>
        </div>
      </div>

      <nav
        aria-label="Etapas do diagnóstico"
        className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <ul className="inline-flex min-w-max gap-1 rounded-xl bg-slate-100 p-1">
          {[{ aba: "visao" as Aba, nome: "Visão geral", icone: LayoutGrid, valor: "", detalhe: "", alerta: false }, ...etapas].map(
            (e) => {
              const ativa = aba === e.aba;
              return (
                <li key={e.aba}>
                  <Link
                    href={e.aba === "visao" ? `/diagnosticos/${d.id}` : `/diagnosticos/${d.id}?aba=${e.aba}`}
                    aria-current={ativa ? "page" : undefined}
                    title={e.detalhe || undefined}
                    className={cx(
                      "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                      ativa
                        ? "bg-superficie text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    <e.icone className={cx("size-4", ativa ? "text-marca-600" : "text-slate-400")} />
                    {e.nome}
                    {e.valor && (
                      <span
                        className={cx(
                          "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                          e.alerta
                            ? "bg-red-50 text-red-700"
                            : ativa
                              ? "bg-marca-50 text-marca-700"
                              : "bg-slate-200/70 text-slate-600",
                        )}
                      >
                        {e.valor}
                      </span>
                    )}
                  </Link>
                </li>
              );
            },
          )}
        </ul>
      </nav>

      {aba === "visao" && (
        <>
          <Jornada etapas={etapas} id={d.id} />
          <AbaVisaoGeral d={d} />
        </>
      )}
      {aba === "coleta" && <AbaColeta d={d} {...filtro} />}
      {aba === "analise" && <AbaIndicadores d={d} {...filtro} />}
      {aba === "achados" && <AbaAchados d={d} {...filtro} />}
      {aba === "oportunidades" && <AbaOportunidades d={d} {...filtro} />}
      {aba === "plano" && <AbaPlano d={d} />}
    </>
  );
}

type Etapa = {
  aba: Aba;
  nome: string;
  icone: LucideIcon;
  valor: string;
  detalhe: string;
  feita: boolean;
  alerta?: boolean;
};

// Coleta → Análise → Achados → Oportunidades → Plano de ação, com o andamento de cada passo.
function Jornada({ etapas, id }: { etapas: Etapa[]; id: string }) {
  const atual = etapas.findIndex((e) => !e.feita);
  return (
    <Cartao className="mb-6 hidden p-2 sm:block">
      <ol className="grid gap-1 sm:grid-cols-5">
        {etapas.map((e, i) => {
          const estado = e.feita ? "feita" : i === atual ? "atual" : "pendente";
          return (
            <li key={e.aba}>
              <Link
                href={`/diagnosticos/${id}?aba=${e.aba}`}
                className="flex h-full items-center gap-3 rounded-lg p-3 transition-colors hover:bg-slate-50"
              >
                <span
                  className={cx(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    estado === "feita" && "bg-emerald-50 text-emerald-600",
                    estado === "atual" && "bg-marca-600 text-white shadow-sm shadow-marca-600/30",
                    estado === "pendente" && "bg-slate-100 text-slate-400",
                  )}
                >
                  {estado === "feita" ? <Check className="size-4" /> : <e.icone className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-500">
                    {i + 1}. {e.nome}
                  </span>
                  <span className="block text-base font-semibold leading-tight text-slate-900 tabular-nums">
                    {e.valor}
                  </span>
                  <span className={cx("block truncate text-xs", e.alerta ? "text-red-600" : "text-slate-500")}>
                    {e.detalhe}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Cartao>
  );
}
