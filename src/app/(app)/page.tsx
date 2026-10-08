import {
  Activity,
  CalendarClock,
  ChartColumn,
  FolderOpen,
  Hourglass,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { EtiquetaPrioridade, EtiquetaStatus } from "@/components/etiquetas";
import { CabecalhoCartao, CabecalhoPagina, Cartao, Etiqueta, Vazio, cx, iniciais } from "@/components/ui";
import { porPrioridade, type Prioridade } from "@/lib/dominio";
import { atrasada, diasUteisAte, formatarData, formatarPeriodo } from "@/lib/datas";
import { resumoColeta } from "@/lib/consultas";
import { criarCliente } from "@/lib/supabase/server";

export const metadata = { title: "Painel" };

type DiagnosticoLinha = {
  id: string;
  status: string;
  periodo_inicio: string;
  periodo_fim: string;
  data_prevista: string | null;
  empresa: { id: string; nome: string };
  responsavel: { nome: string } | null;
  solicitacoes: { status: string }[];
};

type ItemLinha = {
  id: string;
  titulo: string;
  prioridade: Prioridade;
  status: string;
  diagnostico: { id: string; empresa: { nome: string } };
};

type AcaoLinha = {
  id: string;
  acao: string;
  prazo: string | null;
  status: string;
  prioridade: Prioridade;
  responsavel: string | null;
  diagnostico: { id: string; empresa: { nome: string } };
};

const FILTROS = {
  todos: { rotulo: "Em andamento", teste: () => true },
  aguardando: {
    rotulo: "Aguardando informações",
    teste: (d: DiagnosticoLinha) => d.status === "Coleta" && resumoColeta(d.solicitacoes).faltam > 0,
  },
  analise: { rotulo: "Em análise", teste: (d: DiagnosticoLinha) => d.status === "Em análise" },
  prazo: { rotulo: "Próximos do prazo", teste: (d: DiagnosticoLinha) => proximoDoPrazo(d) },
} as const;
type Filtro = keyof typeof FILTROS;

// Entrega em até 2 dias úteis, ou já atrasada.
function proximoDoPrazo(d: DiagnosticoLinha) {
  return !!d.data_prevista && diasUteisAte(d.data_prevista) <= 2;
}

export default async function Painel({ searchParams }: PageProps<"/">) {
  const { filtro: filtroParam } = await searchParams;
  const filtro: Filtro = (filtroParam as Filtro) in FILTROS ? (filtroParam as Filtro) : "todos";

  const supabase = await criarCliente();
  const emAndamento = ["Coleta", "Em análise", "Revisão", "Apresentação"];
  const [diagnosticos, achados, oportunidades, acoes] = await Promise.all([
    supabase
      .from("diagnosticos")
      .select(
        "id, status, periodo_inicio, periodo_fim, data_prevista, empresa:empresas(id, nome), responsavel:perfis!responsavel_id(nome), solicitacoes(status)",
      )
      .in("status", emAndamento)
      .order("data_prevista", { ascending: true, nullsFirst: false }),
    supabase
      .from("achados")
      .select("id, titulo, prioridade, status, diagnostico:diagnosticos!inner(id, status, empresa:empresas(nome))")
      .eq("prioridade", "Alta")
      .in("status", ["Aberto", "Endereçado no plano"])
      .in("diagnostico.status", emAndamento),
    supabase
      .from("oportunidades")
      .select("id, titulo, prioridade, status, diagnostico:diagnosticos!inner(id, status, empresa:empresas(nome))")
      .eq("prioridade", "Alta")
      .in("status", ["Aberta", "Endereçada no plano"])
      .in("diagnostico.status", emAndamento),
    supabase
      .from("acoes")
      .select("id, acao, prazo, status, prioridade, responsavel, diagnostico:diagnosticos(id, empresa:empresas(nome))")
      .in("status", ["A fazer", "Em andamento"])
      .order("prazo", { ascending: true, nullsFirst: false })
      .limit(50),
  ]);

  const lista = (diagnosticos.data ?? []) as unknown as DiagnosticoLinha[];
  const problemas = ((achados.data ?? []) as unknown as ItemLinha[]).sort(porPrioridade);
  const oportunidadesAltas = ((oportunidades.data ?? []) as unknown as ItemLinha[]).sort(porPrioridade);
  const pendentes = (acoes.data ?? []) as unknown as AcaoLinha[];
  const atrasadas = pendentes.filter((a) => atrasada(a.prazo, a.status)).length;

  const dataHoje = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const coletaTotal = lista.reduce(
    (acc, d) => {
      const c = resumoColeta(d.solicitacoes);
      return { recebidos: acc.recebidos + c.recebidos, total: acc.total + c.total, faltam: acc.faltam + c.faltam };
    },
    { recebidos: 0, total: 0, faltam: 0 },
  );
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const aguardando = lista.filter(FILTROS.aguardando.teste);
  const proximos = lista.filter(proximoDoPrazo);
  const proximo = proximos[0];

  const numeros: {
    rotulo: string;
    valor: number;
    filtro: Filtro;
    icone: LucideIcon;
    cor: string;
    barra?: { rotulo: string; status: string; pct: number; cor: string };
    rodape: React.ReactNode;
    alerta?: boolean;
  }[] = [
    {
      rotulo: "Em andamento",
      valor: lista.length,
      filtro: "todos",
      icone: Activity,
      cor: "bg-marca-50 text-marca-600",
      barra: { rotulo: "Coleta recebida", status: `${pct(coletaTotal.recebidos, coletaTotal.total)}%`, pct: pct(coletaTotal.recebidos, coletaTotal.total), cor: "bg-emerald-500" },
      rodape: `${coletaTotal.recebidos} de ${coletaTotal.total} itens recebidos`,
    },
    {
      rotulo: "Aguardando informações",
      valor: aguardando.length,
      filtro: "aguardando",
      icone: Hourglass,
      cor: "bg-amber-50 text-amber-600",
      barra: { rotulo: "Dos diagnósticos", status: aguardando.length ? "Cobrar cliente" : "Em dia", pct: pct(aguardando.length, lista.length), cor: "bg-amber-500" },
      rodape: `${coletaTotal.faltam} ${coletaTotal.faltam === 1 ? "item faltando" : "itens faltando"} no total`,
    },
    {
      rotulo: "Em análise",
      valor: lista.filter(FILTROS.analise.teste).length,
      filtro: "analise",
      icone: ChartColumn,
      cor: "bg-violet-50 text-violet-600",
      barra: { rotulo: "Dos diagnósticos", status: "", pct: pct(lista.filter(FILTROS.analise.teste).length, lista.length), cor: "bg-violet-500" },
      rodape: `${problemas.length} ${problemas.length === 1 ? "problema prioritário" : "problemas prioritários"}`,
    },
    {
      rotulo: "Próximos do prazo",
      valor: proximos.length,
      filtro: "prazo",
      icone: CalendarClock,
      cor: "bg-rose-50 text-rose-600",
      alerta: proximos.length > 0,
      rodape: proximo ? (
        <>
          Próxima: <span className="font-medium text-slate-700">{formatarData(proximo.data_prevista)}</span> ·{" "}
          {proximo.empresa.nome}
        </>
      ) : (
        "Nenhuma entrega nos próximos 2 dias úteis"
      ),
    },
  ];

  const filtrados = lista.filter(FILTROS[filtro].teste);

  return (
    <>
      <CabecalhoPagina
        titulo="Painel"
        icone={<LayoutDashboard />}
        subtitulo={
          <>
            Acompanhe os diagnósticos em andamento · <span className="inline-block first-letter:uppercase">{dataHoje}</span>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {numeros.map((n) => {
          const ativo = n.filtro === filtro;
          return (
            <Link
              key={n.rotulo}
              href={n.filtro === "todos" ? "/" : `/?filtro=${n.filtro}`}
              aria-current={ativo ? "true" : undefined}
              className={cx(
                "group flex flex-col rounded-2xl border bg-superficie p-4 shadow-xs transition-all hover:shadow-sm sm:p-6",
                ativo
                  ? "border-marca-500 ring-3 ring-marca-100"
                  : n.alerta
                    ? "border-rose-200 hover:border-rose-300"
                    : "border-slate-200/80 hover:border-slate-300",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-600">{n.rotulo}</span>
                <span className={cx("hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex", n.cor)}>
                  <n.icone className="size-4" />
                </span>
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{n.valor}</div>
              <div className="mt-auto pt-4">
                {n.barra && (
                  <div className="mb-2 hidden sm:block">
                    <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                      <span>{n.barra.rotulo}</span>
                      <span className="font-medium text-slate-700">{n.barra.status || `${n.barra.pct}%`}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cx("h-full rounded-full", n.barra.cor)} style={{ width: `${n.barra.pct}%` }} />
                    </div>
                  </div>
                )}
                <div className="text-xs text-slate-500">{n.rodape}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Cartao className="overflow-hidden lg:col-span-3">
          <CabecalhoCartao titulo={FILTROS[filtro].rotulo} contagem={filtrados.length} icone={<FolderOpen />}>
            {filtro !== "todos" && (
              <Link href="/" className="text-xs font-medium text-marca-700 hover:underline">
                Limpar filtro
              </Link>
            )}
          </CabecalhoCartao>
          {filtrados.length === 0 ? (
            <Vazio icone={<FolderOpen />}>
              {filtro === "todos" ? (
                <>
                  Nenhum diagnóstico em andamento. Para começar, abra uma{" "}
                  <Link href="/empresas" className="font-medium text-marca-700 hover:underline">
                    empresa
                  </Link>{" "}
                  e crie um diagnóstico.
                </>
              ) : (
                "Nenhum diagnóstico nesta situação."
              )}
            </Vazio>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtrados.map((d) => {
                const c = resumoColeta(d.solicitacoes);
                const pct = c.total ? Math.round((c.recebidos / c.total) * 100) : 0;
                const dias = d.data_prevista ? diasUteisAte(d.data_prevista) : null;
                return (
                  <li key={d.id}>
                    <Link
                      href={`/diagnosticos/${d.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/70"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600">
                        {iniciais(d.empresa.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-900">{d.empresa.nome}</span>
                          <EtiquetaStatus status={d.status} />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>{formatarPeriodo(d.periodo_inicio, d.periodo_fim)}</span>
                          {d.responsavel && <span>{d.responsavel.nome}</span>}
                          <span className="flex items-center gap-1.5">
                            <span className="h-1 w-14 overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </span>
                            coleta {c.recebidos}/{c.total}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-xs text-slate-500">Entrega</span>
                        <span
                          className={cx(
                            "block text-sm font-medium tabular-nums",
                            dias !== null && dias < 0
                              ? "text-red-600"
                              : dias !== null && dias <= 2
                                ? "text-amber-600"
                                : "text-slate-700",
                          )}
                        >
                          {dias !== null && dias < 0 ? "atrasado" : formatarData(d.data_prevista)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        <Cartao className="overflow-hidden lg:col-span-2">
          <CabecalhoCartao titulo="Ações pendentes" contagem={pendentes.length} icone={<ListChecks />}>
            {atrasadas > 0 && <Etiqueta tom="vermelho">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</Etiqueta>}
          </CabecalhoCartao>
          {pendentes.length === 0 ? (
            <Vazio icone={<ListChecks />}>Nenhuma ação pendente.</Vazio>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
              {pendentes.map((a) => {
                const atrasou = atrasada(a.prazo, a.status);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/diagnosticos/${a.diagnostico.id}?aba=plano`}
                      className="flex gap-3 px-5 py-3 transition-colors hover:bg-slate-50/70"
                    >
                      <span
                        aria-hidden
                        className={cx(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          atrasou ? "bg-red-500" : a.status === "Em andamento" ? "bg-marca-500" : "bg-slate-300",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-900">{a.acao}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {a.diagnostico.empresa.nome}
                          {a.prazo && (
                            <span className={cx(atrasou && "font-medium text-red-600")}> · {formatarData(a.prazo)}</span>
                          )}
                          {a.responsavel && <> · {a.responsavel}</>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        <div className="grid gap-6 md:grid-cols-2 lg:col-span-5">
          <ListaItens
            titulo="Problemas prioritários"
            icone={<TriangleAlert />}
            itens={problemas}
            aba="achados"
            vazio="Nenhum problema de prioridade alta em aberto."
          />
          <ListaItens
            titulo="Oportunidades prioritárias"
            icone={<Lightbulb />}
            itens={oportunidadesAltas}
            aba="oportunidades"
            vazio="Nenhuma oportunidade de prioridade alta em aberto."
          />
        </div>
      </div>
    </>
  );
}

function ListaItens({
  titulo,
  icone,
  itens,
  aba,
  vazio,
}: {
  titulo: string;
  icone: React.ReactNode;
  itens: ItemLinha[];
  aba: string;
  vazio: string;
}) {
  return (
    <Cartao className="overflow-hidden">
      <CabecalhoCartao titulo={titulo} contagem={itens.length} icone={icone} />
      {itens.length === 0 ? (
        <Vazio icone={icone}>{vazio}</Vazio>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
          {itens.map((i) => (
            <li key={i.id}>
              <Link
                href={`/diagnosticos/${i.diagnostico.id}?aba=${aba}`}
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50/70"
              >
                <EtiquetaPrioridade prioridade={i.prioridade} />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-900">{i.titulo}</span>
                  <span className="block text-xs text-slate-500">
                    {i.diagnostico.empresa.nome} · {i.status.toLowerCase()}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
