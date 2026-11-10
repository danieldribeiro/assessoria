import { History } from "lucide-react";
import Link from "next/link";
import { CabecalhoPagina, Cartao, Etiqueta, LinkBotao, Selecao, Vazio, classeBotao, type Tom } from "@/components/ui";
import { formatarPeriodo } from "@/lib/datas";
import {
  GRUPOS,
  ROTULO_ACAO,
  ROTULO_TABELA,
  camposAlterados,
  camposPreenchidos,
  chaveDia,
  doFinanceiro,
  formatarCampo,
  formatarDia,
  formatarMomento,
  juntar,
  nomeDaLinha,
  rotuloCampo,
  type Evento,
  type Grupo,
} from "@/lib/historico";
import { criarCliente } from "@/lib/supabase/server";

export const metadata = { title: "Histórico" };

const POR_PAGINA = 60;
type Cliente = Awaited<ReturnType<typeof criarCliente>>;
type Filtros = { empresa: string | null; diagnostico: string | null; grupo: Grupo | null };
type Corte = { antes?: string; em?: string };

const TOM_ACAO: Record<string, Tom> = { criado: "verde", alterado: "azul", excluido: "vermelho", entrou: "cinza", realizado: "verde", cancelado: "ambar" };

// Uma página de cada fonte. `corte.antes` pega o que veio antes do instante; `corte.em`, só o que é daquele instante.
async function buscar(supabase: Cliente, f: Filtros, corte: Corte): Promise<Evento[]> {
  const limite = corte.em ? 1000 : POR_PAGINA + 1;
  const tempo = <T extends { lt: (c: string, v: string) => T; eq: (c: string, v: string) => T }>(q: T) =>
    corte.em ? q.eq("em", corte.em) : corte.antes ? q.lt("em", corte.antes) : q;

  const geral = (async () => {
    if (f.grupo === "financeiro") return [];
    let q = supabase.from("historico").select("*");
    if (f.empresa) q = q.eq("empresa_id", f.empresa);
    if (f.diagnostico) q = q.eq("diagnostico_id", f.diagnostico);
    if (f.grupo) q = q.in("tabela", [...GRUPOS[f.grupo]]);
    const { data } = await tempo(q).order("em", { ascending: false }).order("id", { ascending: false }).limit(limite);
    return (data ?? []).map((e) => ({ ...e, chave: `h:${e.id}` }) as Evento);
  })();

  const financeiro = (tabela: "fin_lancamentos" | "fin_contas") => async () => {
    if (f.diagnostico || (f.grupo && f.grupo !== "financeiro")) return [];
    let q = supabase.from(tabela === "fin_lancamentos" ? "fin_lancamentos_eventos" : "fin_contas_eventos").select("*");
    if (f.empresa) q = q.eq("empresa_id", f.empresa);
    const { data } = await tempo(q).order("em", { ascending: false }).order("id", { ascending: false }).limit(limite);
    return (data ?? []).map((e) => doFinanceiro(tabela, e));
  };

  const listas = await Promise.all([geral, financeiro("fin_lancamentos")(), financeiro("fin_contas")()]);
  return juntar(...listas);
}

// Nomes para ids que aparecem nos eventos: pessoas, empresas, diagnósticos, itens, contas, caixas e fornecedores.
async function carregarNomes(supabase: Cliente, eventos: Evento[]) {
  const ids = new Set<string>();
  const porTabela: Record<string, Set<string>> = {};
  for (const e of eventos) {
    if (e.por) ids.add(e.por);
    if (e.empresa_id) ids.add(e.empresa_id);
    if (e.diagnostico_id) ids.add(e.diagnostico_id);
    (porTabela[e.tabela] ??= new Set()).add(e.registro_id);
    for (const l of [e.antes, e.depois]) {
      for (const [c, v] of Object.entries(l ?? {})) {
        if (typeof v === "string" && (c.endsWith("_id") || c === "responsavel")) ids.add(v);
        if (c === "rateio" && Array.isArray(v)) v.forEach((r: { conta_id?: string }) => r.conta_id && ids.add(r.conta_id));
      }
    }
  }
  const lista = [...ids].filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  const nomes: Record<string, string> = {};
  const itens: Record<string, string> = {};
  const periodos: Record<string, string> = {};

  const consultar = async (tabela: string, campos: string, chaves: string[], usar: (l: Record<string, unknown>) => void) => {
    if (!chaves.length) return;
    const { data } = await supabase.from(tabela).select(campos).in("id", chaves.slice(0, 300));
    ((data ?? []) as unknown as Record<string, unknown>[]).forEach(usar);
  };
  const de = (t: string) => [...(porTabela[t] ?? [])];

  await Promise.all([
    consultar("perfis", "id, nome", lista, (l) => (nomes[l.id as string] = l.nome as string)),
    consultar("empresas", "id, nome", lista, (l) => (nomes[l.id as string] = l.nome as string)),
    consultar("diagnosticos", "id, periodo_inicio, periodo_fim", [...new Set([...lista, ...de("diagnosticos")])], (l) => {
      periodos[l.id as string] = `Diagnóstico ${formatarPeriodo(l.periodo_inicio as string, l.periodo_fim as string)}`;
    }),
    consultar("fin_contas", "id, codigo, nome", [...new Set([...lista, ...de("fin_contas")])], (l) => {
      nomes[l.id as string] = `${l.codigo} ${l.nome}`;
    }),
    consultar("fin_contas_caixa", "id, nome", lista, (l) => (nomes[l.id as string] = l.nome as string)),
    consultar("fin_contrapartes", "id, nome", lista, (l) => (nomes[l.id as string] = l.nome as string)),
    consultar("envios_itens", "id, nome", [...new Set([...lista, ...de("envios_itens")])], (l) => (nomes[l.id as string] = l.nome as string)),
    consultar("achados", "id, titulo", [...new Set([...lista, ...de("achados")])], (l) => (itens[l.id as string] = l.titulo as string)),
    consultar("oportunidades", "id, titulo", [...new Set([...lista, ...de("oportunidades")])], (l) => (itens[l.id as string] = l.titulo as string)),
    consultar("indicadores", "id, nome", de("indicadores"), (l) => (itens[l.id as string] = l.nome as string)),
    consultar("solicitacoes", "id, item", de("solicitacoes"), (l) => (itens[l.id as string] = l.item as string)),
    consultar("acoes", "id, acao", de("acoes"), (l) => (itens[l.id as string] = l.acao as string)),
    consultar("contatos", "id, nome", de("contatos"), (l) => (itens[l.id as string] = l.nome as string)),
    consultar("acessos_central", "id, email", de("acessos_central"), (l) => (itens[l.id as string] = l.email as string)),
    consultar("fin_lancamentos", "id, descricao, valor_total", de("fin_lancamentos"), (l) => {
      itens[l.id as string] = nomeDaLinha("fin_lancamentos", l) ?? "";
    }),
  ]);
  Object.assign(nomes, itens, periodos);
  return { nomes, periodos };
}

function texto(v: string | string[] | undefined) {
  return typeof v === "string" && v ? v : null;
}

export default async function PaginaHistorico({ searchParams }: PageProps<"/historico">) {
  const p = await searchParams;
  const grupo = texto(p.tipo);
  const filtros: Filtros = {
    empresa: texto(p.empresa),
    diagnostico: texto(p.diagnostico),
    grupo: grupo && grupo in GRUPOS ? (grupo as Grupo) : null,
  };
  const antes = texto(p.antes) ?? undefined;

  const supabase = await criarCliente();
  const [{ data: empresas }, bruto] = await Promise.all([
    supabase.from("empresas").select("id, nome").order("nome"),
    buscar(supabase, filtros, { antes }),
  ]);

  // Corta a página sem separar eventos do mesmo instante (ex.: um diagnóstico excluído com todos os itens).
  let eventos = bruto.slice(0, POR_PAGINA);
  let proximo: string | null = null;
  if (bruto.length > POR_PAGINA) {
    const ultimo = eventos[eventos.length - 1].em;
    const mesmos = await buscar(supabase, filtros, { em: ultimo });
    eventos = juntar(eventos.filter((e) => e.em !== ultimo), mesmos);
    proximo = ultimo;
  }

  const { nomes, periodos } = await carregarNomes(supabase, eventos);
  const dias = new Map<string, Evento[]>();
  for (const e of eventos) {
    const k = chaveDia(e.em);
    if (!dias.has(k)) dias.set(k, []);
    dias.get(k)!.push(e);
  }

  const params = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (filtros.empresa) u.set("empresa", filtros.empresa);
    if (filtros.diagnostico) u.set("diagnostico", filtros.diagnostico);
    if (filtros.grupo) u.set("tipo", filtros.grupo);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return `/historico?${u}`;
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Histórico"
        icone={<History />}
        subtitulo="Quem criou, alterou ou excluiu o quê, com o valor de antes e o de depois"
      />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block min-w-56">
          <span className="mb-1 block text-sm font-medium text-slate-700">Empresa</span>
          <Selecao
            name="empresa"
            defaultValue={filtros.empresa ?? ""}
            vazio="Todas"
            opcoes={(empresas ?? []).map((e) => ({ valor: e.id, rotulo: e.nome }))}
          />
        </label>
        <label className="block min-w-48">
          <span className="mb-1 block text-sm font-medium text-slate-700">Tipo</span>
          <Selecao
            name="tipo"
            defaultValue={filtros.grupo ?? ""}
            vazio="Tudo"
            opcoes={[
              { valor: "diagnosticos", rotulo: "Diagnósticos" },
              { valor: "cadastros", rotulo: "Cadastros e acessos" },
              { valor: "financeiro", rotulo: "Financeiro" },
              { valor: "arquivos", rotulo: "Arquivos enviados" },
            ]}
          />
        </label>
        {filtros.diagnostico && <input type="hidden" name="diagnostico" value={filtros.diagnostico} />}
        <button className={classeBotao("primario")}>Filtrar</button>
        {(filtros.empresa || filtros.grupo || filtros.diagnostico || antes) && (
          <Link href="/historico" className="py-2 text-sm text-slate-500 hover:text-slate-900">
            Limpar
          </Link>
        )}
      </form>

      {filtros.diagnostico && (
        <p className="mb-4 text-sm text-slate-600">
          Mostrando só o {periodos[filtros.diagnostico]?.toLowerCase() ?? "diagnóstico escolhido"}.
        </p>
      )}

      {eventos.length === 0 ? (
        <Cartao>
          <Vazio icone={<History />}>
            Nada registrado {antes ? "antes disso" : "ainda"}. O histórico dos diagnósticos, cadastros e acessos começou em
            10/11/2026; o do financeiro existe desde o primeiro lançamento.
          </Vazio>
        </Cartao>
      ) : (
        <div className="space-y-6">
          {[...dias.entries()].map(([dia, lista]) => (
            <section key={dia}>
              <h2 className="mb-2 text-sm font-semibold text-slate-500 first-letter:uppercase">{formatarDia(lista[0].em)}</h2>
              <Cartao className="divide-y divide-slate-100">
                {lista.map((e) => (
                  <LinhaEvento key={e.chave} e={e} nomes={nomes} periodos={periodos} />
                ))}
              </Cartao>
            </section>
          ))}
        </div>
      )}

      {proximo && (
        <div className="mt-6 flex justify-center">
          <LinkBotao href={params({ antes: proximo })}>Ver mais antigos</LinkBotao>
        </div>
      )}
    </>
  );
}

function LinhaEvento({ e, nomes, periodos }: { e: Evento; nomes: Record<string, string>; periodos: Record<string, string> }) {
  const nome =
    e.tabela === "diagnosticos"
      ? (periodos[e.registro_id] ??
        (e.antes?.periodo_inicio
          ? `Diagnóstico ${formatarPeriodo(e.antes.periodo_inicio as string, e.antes.periodo_fim as string)}`
          : null))
      : (nomeDaLinha(e.tabela, e.depois) ?? nomeDaLinha(e.tabela, e.antes) ?? nomes[e.registro_id] ?? null);
  const contexto = [
    e.empresa_id ? nomes[e.empresa_id] : null,
    e.diagnostico_id && e.tabela !== "diagnosticos" ? periodos[e.diagnostico_id] : null,
  ].filter(Boolean);
  const quem = e.por ? (nomes[e.por] ?? "Pessoa removida") : e.acao === "entrou" ? null : "Fora do sistema";
  const mudancas = e.acao === "alterado" || e.acao === "realizado" || e.acao === "cancelado" ? camposAlterados(e.antes, e.depois) : [];
  const linhaInteira = e.acao === "criado" ? e.depois : e.acao === "excluido" ? e.antes : null;

  return (
    <div className="px-5 py-3.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-12 shrink-0 tabular-nums text-slate-500">{formatarMomento(e.em).slice(-5)}</span>
        <Etiqueta tom={TOM_ACAO[e.acao] ?? "cinza"}>{ROTULO_ACAO[e.acao] ?? e.acao}</Etiqueta>
        <span className="font-medium text-slate-900">
          {ROTULO_TABELA[e.tabela] ?? e.tabela}
          {nome && <span className="font-normal text-slate-700"> · {nome}</span>}
        </span>
        {contexto.length > 0 && <span className="text-slate-500">{contexto.join(" · ")}</span>}
        {quem && <span className="ml-auto text-xs text-slate-500">por {quem}</span>}
      </div>

      {mudancas.length > 0 && (
        <dl className="mt-2 grid gap-1 pl-0 sm:pl-15">
          {mudancas.map((m) => (
            <div key={m.campo} className="grid gap-x-2 sm:grid-cols-[12rem_1fr]">
              <dt className="text-slate-500">{rotuloCampo(m.campo)}</dt>
              <dd className="min-w-0 break-words text-slate-800">
                <span className="text-slate-500 line-through decoration-slate-300">{formatarCampo(m.campo, m.antes, nomes)}</span>
                <span className="px-1.5 text-slate-400">→</span>
                {formatarCampo(m.campo, m.depois, nomes)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {linhaInteira && (
        <details className="mt-2 sm:pl-15">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">
            {e.acao === "excluido" ? "Ver o que foi excluído" : "Ver o que foi criado"}
          </summary>
          <dl className="mt-2 grid gap-1">
            {camposPreenchidos(linhaInteira).map((c) => (
              <div key={c.campo} className="grid gap-x-2 sm:grid-cols-[12rem_1fr]">
                <dt className="text-slate-500">{rotuloCampo(c.campo)}</dt>
                <dd className="min-w-0 whitespace-pre-line break-words text-slate-800">{formatarCampo(c.campo, c.valor, nomes)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
