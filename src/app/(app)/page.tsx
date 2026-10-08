import Link from "next/link";
import { EtiquetaPrioridade, EtiquetaStatus } from "@/components/etiquetas";
import { CabecalhoCartao, CabecalhoPagina, Cartao, Etiqueta, Vazio, classeTabela as t, cx } from "@/components/ui";
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
  const [empresas, diagnosticos, achados, oportunidades, acoes] = await Promise.all([
    supabase.from("empresas").select("id", { count: "exact", head: true }),
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

  const numeros: { rotulo: string; valor: number; href: string; filtro?: Filtro; alerta?: boolean }[] = [
    { rotulo: "Clientes", valor: empresas.count ?? 0, href: "/empresas" },
    { rotulo: "Diagnósticos em andamento", valor: lista.length, href: "/", filtro: "todos" },
    {
      rotulo: "Aguardando informações",
      valor: lista.filter(FILTROS.aguardando.teste).length,
      href: "/?filtro=aguardando",
      filtro: "aguardando",
    },
    { rotulo: "Em análise", valor: lista.filter(FILTROS.analise.teste).length, href: "/?filtro=analise", filtro: "analise" },
    {
      rotulo: "Próximos do prazo",
      valor: lista.filter(proximoDoPrazo).length,
      href: "/?filtro=prazo",
      filtro: "prazo",
      alerta: lista.some(proximoDoPrazo),
    },
  ];

  const filtrados = lista.filter(FILTROS[filtro].teste);

  return (
    <>
      <CabecalhoPagina titulo="Painel" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {numeros.map((n) => (
          <Link
            key={n.rotulo}
            href={n.href}
            className={cx(
              "rounded-lg border bg-white p-4 shadow-sm transition-colors hover:border-marca-600",
              n.filtro && n.filtro === filtro ? "border-marca-600 ring-2 ring-marca-100" : "border-slate-200",
            )}
          >
            <div className="text-xs font-medium text-slate-500">{n.rotulo}</div>
            <div className={cx("mt-1 text-2xl font-semibold", n.alerta ? "text-amber-600" : "text-slate-900")}>
              {n.valor}
            </div>
          </Link>
        ))}
      </div>

      <Cartao className="mb-6 overflow-x-auto">
        <CabecalhoCartao titulo={FILTROS[filtro].rotulo} contagem={filtrados.length}>
          {filtro !== "todos" && (
            <Link href="/" className="text-xs text-marca-700 hover:underline">
              Ver todos
            </Link>
          )}
        </CabecalhoCartao>
        {filtrados.length === 0 ? (
          <Vazio>Nenhum diagnóstico aqui.</Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Empresa</th>
                <th className={t.th}>Status</th>
                <th className={t.th}>Responsável</th>
                <th className={t.th}>Coleta</th>
                <th className={t.th}>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d) => {
                const c = resumoColeta(d.solicitacoes);
                const dias = d.data_prevista ? diasUteisAte(d.data_prevista) : null;
                return (
                  <tr
                    key={d.id}
                    className={cx(
                      t.linha,
                      dias !== null && dias < 0 && "bg-red-50/60",
                      dias !== null && dias >= 0 && dias <= 2 && "bg-amber-50/60",
                    )}
                  >
                    <td className={t.td}>
                      <Link href={`/diagnosticos/${d.id}`} className="font-medium text-slate-900 hover:text-marca-700">
                        {d.empresa.nome}
                      </Link>
                      <div className="text-xs text-slate-500">{formatarPeriodo(d.periodo_inicio, d.periodo_fim)}</div>
                    </td>
                    <td className={t.td}>
                      <EtiquetaStatus status={d.status} />
                    </td>
                    <td className={`${t.td} text-slate-600`}>{d.responsavel?.nome ?? "—"}</td>
                    <td className={t.td}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${c.total ? (c.recebidos / c.total) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {c.recebidos}/{c.total}
                        </span>
                      </div>
                    </td>
                    <td className={t.td}>
                      <span className="text-slate-700">{formatarData(d.data_prevista)}</span>
                      {dias !== null && dias < 0 && (
                        <Etiqueta tom="vermelho" className="ml-2">
                          atrasado
                        </Etiqueta>
                      )}
                      {dias !== null && dias >= 0 && dias <= 2 && (
                        <Etiqueta tom="ambar" className="ml-2">
                          {dias === 0 ? "hoje" : `${dias} d.u.`}
                        </Etiqueta>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-3">
        <ListaItens titulo="Problemas prioritários" itens={problemas} aba="achados" vazio="Nenhum problema de prioridade alta em aberto." />
        <ListaItens
          titulo="Oportunidades prioritárias"
          itens={oportunidadesAltas}
          aba="oportunidades"
          vazio="Nenhuma oportunidade de prioridade alta em aberto."
        />
        <Cartao>
          <CabecalhoCartao titulo="Ações pendentes" contagem={pendentes.length}>
            {atrasadas > 0 && <Etiqueta tom="vermelho">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</Etiqueta>}
          </CabecalhoCartao>
          {pendentes.length === 0 ? (
            <Vazio>Nenhuma ação pendente.</Vazio>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
              {pendentes.map((a) => (
                <li key={a.id}>
                  <Link href={`/diagnosticos/${a.diagnostico.id}?aba=plano`} className="block px-4 py-2.5 hover:bg-slate-50">
                    <div className="text-sm text-slate-900">{a.acao}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span>{a.diagnostico.empresa.nome}</span>
                      <span className={cx(atrasada(a.prazo, a.status) && "font-medium text-red-600")}>
                        · {formatarData(a.prazo)}
                      </span>
                      {a.responsavel && <span>· {a.responsavel}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}

function ListaItens({
  titulo,
  itens,
  aba,
  vazio,
}: {
  titulo: string;
  itens: ItemLinha[];
  aba: string;
  vazio: string;
}) {
  return (
    <Cartao>
      <CabecalhoCartao titulo={titulo} contagem={itens.length} />
      {itens.length === 0 ? (
        <Vazio>{vazio}</Vazio>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
          {itens.map((i) => (
            <li key={i.id}>
              <Link href={`/diagnosticos/${i.diagnostico.id}?aba=${aba}`} className="flex items-start gap-2 px-4 py-2.5 hover:bg-slate-50">
                <EtiquetaPrioridade prioridade={i.prioridade} />
                <span>
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

