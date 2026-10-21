import { ArrowDownRight, ArrowUpRight, ChartColumn, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { GraficoMensal } from "@/components/graficos";
import { CabecalhoCartao, Cartao, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import { formatarData, formatarPeriodo, formatarValor } from "@/lib/datas";
import { carregarLancamentos, carregarSaldos } from "@/lib/financeiro/consultas";
import { compararCodigo, type ContaCaixa, type ContaPlano, type Direcao } from "@/lib/financeiro/dominio";
import { mesesEntre, ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import {
  SECOES_DESPESA,
  despesasPorConta,
  maioresDespesas,
  parcelas,
  periodoAnterior,
  resumir,
  seriesMensais,
  variacao,
  type Base,
  type Filtros,
} from "@/lib/financeiro/painel";
import { FiltroPeriodo, classeFiltro } from "./filtro";

const moeda = (v: number) => formatarValor(v, "R$")!;
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
const SECOES_RESULTADO = [1, ...SECOES_DESPESA];
const MAX_MESES_SALDO = 24;

export const NOME_BASE: Record<Base, string> = {
  competencia: "Competência (previstos e realizados)",
  caixa: "Caixa (só realizados, pela data do pagamento)",
};

// Endereço da aba Lançamentos com os mesmos filtros e o mesmo critério de data do número clicado.
export function linkLancamentos(
  empresaId: string,
  base: Base,
  de: string,
  ate: string,
  filtros: Filtros & { ordem?: string },
) {
  const p = new URLSearchParams({ aba: "lancamentos", de, ate });
  if (base === "competencia") {
    p.set("data", "competencia");
    p.set("situacao", "ativos");
  } else {
    p.set("situacao", "realizado");
  }
  if (filtros.caixa) p.set("caixa", filtros.caixa);
  if (filtros.conta) p.set("conta", filtros.conta);
  if (filtros.tipo) p.set("tipo", filtros.tipo);
  if (filtros.secoes?.length) p.set("secoes", filtros.secoes.join(","));
  if (filtros.ordem) p.set("ordem", filtros.ordem);
  return `/empresas/${empresaId}/financeiro?${p}`;
}

export async function AbaPainel({
  empresa,
  contas,
  caixas,
  periodo,
  base,
  filtros,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  periodo: { de: string; ate: string };
  base: Base;
  filtros: Filtros;
}) {
  const meses = mesesEntre(periodo.de, periodo.ate);
  const inicio = meses[0];
  const fim = ultimoDiaDoMes(meses[meses.length - 1]);
  const anterior = periodoAnterior(periodo.de, periodo.ate);
  const inicioAnterior = `${anterior.de}-01`;
  const fimAnterior = ultimoDiaDoMes(`${anterior.ate}-01`);
  const mesesSaldo = meses.slice(-MAX_MESES_SALDO);

  const [lancamentos, saldosFim, saldosAnterior, ...saldosMes] = await Promise.all([
    carregarLancamentos(empresa.id, inicioAnterior, fim, base === "competencia" ? "competencia" : "movimento"),
    carregarSaldos(empresa.id, fim),
    carregarSaldos(empresa.id, fimAnterior),
    ...mesesSaldo.map((m) => carregarSaldos(empresa.id, ultimoDiaDoMes(m))),
  ]);

  const atual = parcelas(lancamentos, contas, base, filtros, inicio, fim);
  const antes = parcelas(lancamentos, contas, base, filtros, inicioAnterior, fimAnterior);
  const r = resumir(atual);
  const ra = resumir(antes);
  const somaSaldo = (lista: { conta_caixa_id: string; saldo: number | null }[]) =>
    lista.filter((s) => !filtros.caixa || s.conta_caixa_id === filtros.caixa).reduce((a, s) => a + (s.saldo ?? 0), 0);
  const saldo = somaSaldo(saldosFim);
  const saldoAntes = somaSaldo(saldosAnterior);
  const mensal = seriesMensais(atual, meses);
  const fatias = despesasPorConta(atual);
  const maiores = maioresDespesas(atual);
  const link = (f: Filtros & { ordem?: string }, de = periodo.de, ate = periodo.ate) =>
    linkLancamentos(empresa.id, base, de, ate, { ...filtros, ...f });

  const caixasVisiveis = caixas.filter((c) => !filtros.caixa || c.id === filtros.caixa);
  const seriesSaldo =
    caixasVisiveis.length <= 4
      ? caixasVisiveis.map((c, i) => ({
          nome: c.nome,
          forma: "linha" as const,
          cor: (i + 1) as 1 | 2 | 3 | 4,
          valores: saldosMes.map((lista) => lista.find((s) => s.conta_caixa_id === c.id)?.saldo ?? 0),
        }))
      : [{ nome: "Todas as contas", forma: "linha" as const, cor: 1 as const, valores: saldosMes.map(somaSaldo) }];

  const opcoesConta = [...contas].sort((a, b) => compararCodigo(a.codigo, b.codigo));
  const textoAnterior = `vs ${formatarPeriodo(inicioAnterior, fimAnterior)}`;

  return (
    <div className="space-y-6">
      <FiltroPeriodo aba="painel" de={periodo.de} ate={periodo.ate}>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Visão</span>
          <select name="visao" defaultValue={base} className={classeFiltro}>
            <option value="competencia">Competência</option>
            <option value="caixa">Caixa</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Conta de caixa</span>
          <select name="caixa" defaultValue={filtros.caixa ?? ""} className={classeFiltro}>
            <option value="">Todas</option>
            {caixas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Categoria</span>
          <select name="conta" defaultValue={filtros.conta ?? ""} className={cx(classeFiltro, "max-w-56")}>
            <option value="">Todas</option>
            {opcoesConta.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Tipo</span>
          <select name="tipo" defaultValue={filtros.tipo ?? ""} className={classeFiltro}>
            <option value="">Receitas e despesas</option>
            <option value="entrada">Só receitas</option>
            <option value="saida">Só despesas</option>
          </select>
        </label>
      </FiltroPeriodo>

      <p className="text-xs text-slate-500">
        Visão por {NOME_BASE[base].charAt(0).toLowerCase() + NOME_BASE[base].slice(1)}. Transferências entre contas
        próprias, investimentos, financiamentos e sócios não entram em receita nem em despesa.
      </p>

      {caixas.length === 0 || contas.length === 0 ? (
        <Cartao>
          <Vazio icone={<ChartColumn />}>
            O painel usa os lançamentos da empresa. Para começar, cadastre{" "}
            {contas.length === 0 ? (
              <Link className="font-medium text-marca-700 hover:underline" href="?aba=plano">
                o plano de contas
              </Link>
            ) : (
              <Link className="font-medium text-marca-700 hover:underline" href="?aba=caixas">
                as contas de caixa
              </Link>
            )}
            .
          </Vazio>
        </Cartao>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Faturamento"
              valor={r.faturamento}
              anterior={ra.faturamento}
              textoAnterior={textoAnterior}
              href={link({ secoes: [1] })}
            />
            <Indicador
              rotulo="Despesas"
              valor={r.despesas}
              anterior={ra.despesas}
              textoAnterior={textoAnterior}
              subirEhBom={false}
              href={link({ secoes: [...SECOES_DESPESA] })}
            />
            <Indicador
              rotulo="Resultado operacional"
              valor={r.resultadoOperacional}
              anterior={ra.resultadoOperacional}
              textoAnterior={textoAnterior}
              sinal
              destaque
              href={link({ secoes: SECOES_RESULTADO })}
            />
            <Indicador
              rotulo={`Saldo de caixa em ${formatarData(fim)}`}
              valor={saldo}
              anterior={saldoAntes}
              textoAnterior={`vs ${formatarData(fimAnterior)}`}
              sinal
              href={`?aba=caixas`}
            />
          </div>

          {atual.length === 0 ? (
            <Cartao>
              <Vazio icone={<ChartColumn />}>
                <p>Nenhum lançamento {filtros.caixa || filtros.conta || filtros.tipo ? "com esses filtros " : ""}neste período.</p>
                <p className="mt-1">
                  Os gráficos aparecem assim que houver receitas ou despesas lançadas. Os números vêm só dos lançamentos
                  cadastrados.
                </p>
                <Link href="?aba=lancamentos" className={cx(classeBotao("primario", true), "mt-4")}>
                  <Plus />
                  Ir para os lançamentos
                </Link>
              </Vazio>
            </Cartao>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <Cartao>
                  <CabecalhoCartao titulo="Faturamento e despesas por mês" />
                  <div className="px-5 py-4">
                    <GraficoMensal
                      descricao="Faturamento e despesas por mês"
                      rotulos={meses.map(nomeMes)}
                      series={[
                        { nome: "Faturamento", forma: "coluna", cor: 1, valores: mensal.map((m) => m.faturamento) },
                        { nome: "Despesas", forma: "coluna", cor: 2, valores: mensal.map((m) => m.despesas) },
                      ]}
                      links={meses.map((m) => link({ secoes: SECOES_RESULTADO }, m.slice(0, 7), m.slice(0, 7)))}
                    />
                  </div>
                </Cartao>
                <Cartao>
                  <CabecalhoCartao titulo="Resultado operacional por mês" />
                  <div className="px-5 py-4">
                    <GraficoMensal
                      descricao="Resultado operacional por mês"
                      rotulos={meses.map(nomeMes)}
                      series={[
                        { nome: "Resultado operacional", forma: "coluna", cor: 1, sinal: true, valores: mensal.map((m) => m.resultado) },
                      ]}
                      links={meses.map((m) => link({ secoes: SECOES_RESULTADO }, m.slice(0, 7), m.slice(0, 7)))}
                    />
                  </div>
                </Cartao>
              </div>

              <details className="group rounded-xl border border-slate-200/80 bg-superficie text-sm shadow-xs">
                <summary className="cursor-pointer px-5 py-3 font-medium text-slate-700">Ver os números por mês em tabela</summary>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className={t.tabela}>
                    <thead className={t.cabeca}>
                      <tr>
                        <th className={t.th}>Mês</th>
                        <th className={`${t.th} text-right`}>Faturamento</th>
                        <th className={`${t.th} text-right`}>Despesas</th>
                        <th className={`${t.th} text-right`}>Resultado operacional</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mensal.map((m) => (
                        <tr key={m.mes} className={t.linha}>
                          <td className={t.td}>{nomeMes(m.mes)}</td>
                          <td className={`${t.td} text-right tabular-nums`}>{moeda(m.faturamento)}</td>
                          <td className={`${t.td} text-right tabular-nums`}>{moeda(m.despesas)}</td>
                          <td className={cx(t.td, "text-right font-medium tabular-nums", m.resultado < 0 && "text-red-700")}>
                            {moeda(m.resultado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <div className="grid gap-6 lg:grid-cols-2">
                <Cartao>
                  <CabecalhoCartao titulo="Despesas por categoria" />
                  {fatias.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-500">Nenhuma despesa no período.</p>
                  ) : (
                    <ul className="space-y-3 px-5 py-4">
                      {fatias.map((f) => {
                        const conteudo = (
                          <>
                            <span className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate text-slate-700">{f.nome}</span>
                              <span className="shrink-0 tabular-nums text-slate-900">
                                {moeda(f.valor)}
                                <span className="ml-2 text-xs text-slate-500">{percentual.format(f.participacao)}</span>
                              </span>
                            </span>
                            <span className="mt-1 block h-2 rounded-full bg-slate-100">
                              <span
                                className="block h-2 rounded-full"
                                style={{ width: `${Math.max(1, f.participacao * 100)}%`, background: "var(--grafico-2)" }}
                              />
                            </span>
                          </>
                        );
                        return (
                          <li key={f.id ?? "outras"}>
                            {f.id ? (
                              <Link href={link({ conta: f.id, secoes: [...SECOES_DESPESA] })} className="block rounded-md hover:bg-slate-50">
                                {conteudo}
                              </Link>
                            ) : (
                              conteudo
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Cartao>
                <Cartao>
                  <CabecalhoCartao titulo="Maiores despesas do período">
                    <Link href={link({ secoes: [...SECOES_DESPESA], ordem: "maior" })} className="text-xs font-medium text-marca-700 hover:underline">
                      Ver todas
                    </Link>
                  </CabecalhoCartao>
                  {maiores.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-500">Nenhuma despesa no período.</p>
                  ) : (
                    <ol className="divide-y divide-slate-100">
                      {maiores.map((m, i) => (
                        <li key={m.lancamento.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="w-4 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-slate-900">{m.lancamento.descricao}</span>
                              <span className="block text-xs text-slate-500">
                                {formatarData(base === "caixa" ? m.lancamento.data_liquidacao : m.lancamento.data_competencia)}
                                {m.lancamento.situacao === "previsto" && " · previsto"}
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-900">{moeda(m.valor)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Cartao>
              </div>
            </>
          )}

          <Cartao>
            <CabecalhoCartao titulo={`Saldo das contas de caixa no fim de cada mês${meses.length > MAX_MESES_SALDO ? ` (últimos ${MAX_MESES_SALDO})` : ""}`} />
            <div className="px-5 py-4">
              <GraficoMensal descricao="Saldo das contas de caixa no fim de cada mês" rotulos={mesesSaldo.map(nomeMes)} series={seriesSaldo} />
              <p className="mt-2 text-xs text-slate-500">
                O saldo é sempre pelo caixa: saldo inicial, mais os lançamentos realizados e as transferências até o fim do mês.
              </p>
            </div>
          </Cartao>
        </>
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  anterior,
  textoAnterior,
  href,
  subirEhBom = true,
  sinal,
  destaque,
}: {
  rotulo: string;
  valor: number;
  anterior: number;
  textoAnterior: string;
  href: string;
  subirEhBom?: boolean;
  sinal?: boolean;
  destaque?: boolean;
}) {
  const v = variacao(valor, anterior);
  const subiu = v.diferenca > 0;
  const bom = v.diferenca === 0 ? null : subiu === subirEhBom;
  const Seta = subiu ? ArrowUpRight : ArrowDownRight;
  // Valor com sinal (resultado, saldo) compara em reais: percentual sobre base negativa ou que troca de sinal confunde.
  const emReais = sinal || v.percentual === null;
  let comparacao: ReactNode = <span className="text-slate-500">Igual {textoAnterior}</span>;
  if (anterior === 0 && !sinal) {
    comparacao = <span className="text-slate-500">Sem valor para comparar {textoAnterior.replace("vs", "em")}</span>;
  } else if (v.diferenca !== 0) {
    comparacao = (
      <span className={cx("inline-flex flex-wrap items-center gap-x-0.5", bom ? "text-emerald-700" : "text-red-700")}>
        <Seta className="size-3.5" />
        {emReais ? `${subiu ? "+" : "−"}${moeda(Math.abs(v.diferenca))}` : percentual.format(Math.abs(v.percentual!))}
        <span className="ml-1 text-slate-500">{textoAnterior}</span>
      </span>
    );
  }
  return (
    <Link href={href} className="block">
      <Cartao className={cx("h-full px-4 py-3 transition-colors hover:border-slate-300", destaque && "ring-1 ring-marca-200")}>
        <p className="text-xs font-medium text-slate-500">{rotulo}</p>
        <p className={cx("mt-1 text-xl font-semibold tabular-nums", sinal && valor < 0 ? "text-red-700" : "text-slate-900")}>
          {moeda(valor)}
        </p>
        <p className="mt-1 text-xs">{comparacao}</p>
        <p className="sr-only">Anterior: {moeda(anterior)}</p>
      </Cartao>
    </Link>
  );
}

export function lerFiltros(valor: (k: string) => string | undefined, contas: ContaPlano[], caixas: ContaCaixa[]): Filtros {
  const caixa = valor("caixa");
  const conta = valor("conta");
  const tipo = valor("tipo");
  const secoes = (valor("secoes") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  return {
    caixa: caixa && caixas.some((c) => c.id === caixa) ? caixa : null,
    conta: conta && contas.some((c) => c.id === conta) ? conta : null,
    tipo: tipo === "entrada" || tipo === "saida" ? (tipo as Direcao) : null,
    secoes: secoes.length ? secoes : null,
  };
}
