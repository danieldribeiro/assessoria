import { ArrowDownRight, ArrowUpRight, ChartColumn, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { GraficoMensal } from "@/components/graficos";
import { CabecalhoCartao, Cartao, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import { formatarData, formatarValor } from "@/lib/datas";
import { carregarLancamentos, carregarSaldos } from "@/lib/financeiro/consultas";
import { compararCodigo, type ContaCaixa, type ContaPlano, type Contraparte, type Direcao } from "@/lib/financeiro/dominio";
import { ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import {
  SECOES_DESPESA,
  SEM_CONTRAPARTE,
  despesasPorConta,
  despesasPorContraparte,
  maioresDespesas,
  parcelas,
  resumir,
  seriesMensais,
  variacao,
  type Base,
  type FatiaDespesa,
  type Filtros,
} from "@/lib/financeiro/painel";
import { montarPeriodo, textoPeriodo, type Periodo } from "@/lib/financeiro/periodo";
import { CampoFiltro, FiltroPeriodo, classeFiltro } from "./filtro";
import { Alternador, type FiltroAtivo } from "./filtros-ui";

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
  if (filtros.contraparte) p.set("contraparte", filtros.contraparte);
  if (filtros.ordem) p.set("ordem", filtros.ordem);
  return `/empresas/${empresaId}/financeiro?${p}`;
}

export async function AbaPainel({
  empresa,
  contas,
  caixas,
  contrapartes,
  recursos,
  periodo,
  base,
  filtros,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  contrapartes: Contraparte[];
  recursos: { fornecedores: boolean; extratos: boolean };
  periodo: Periodo;
  base: Base;
  filtros: Filtros;
}) {
  const { meses, inicio, fim } = periodo;
  const { inicio: inicioAnterior, fim: fimAnterior } = periodo.anterior;
  const mesesSaldo = meses.slice(-MAX_MESES_SALDO);

  const [lancamentos, saldosFim, saldosAnterior, ...saldosMes] = await Promise.all([
    carregarLancamentos(empresa.id, inicioAnterior, fim, base === "competencia" ? "competencia" : "movimento"),
    carregarSaldos(empresa.id, fim),
    carregarSaldos(empresa.id, fimAnterior),
    ...mesesSaldo.map((m) => carregarSaldos(empresa.id, ultimoDiaDoMes(m) < fim ? ultimoDiaDoMes(m) : fim)),
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
  const porFornecedor = recursos.fornecedores ? despesasPorContraparte(atual, new Map(contrapartes.map((c) => [c.id, c.nome]))) : [];
  // Um mês do gráfico, cortado nos limites do período (o primeiro e o último mês podem estar incompletos).
  const noMes = (m: string): [string, string] => {
    const q = montarPeriodo(m < inicio ? inicio : m, ultimoDiaDoMes(m) > fim ? fim : ultimoDiaDoMes(m));
    return [q.de, q.ate];
  };
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

  const textoAnterior = `vs ${textoPeriodo(inicioAnterior, fimAnterior)}`;

  return (
    <div className="space-y-6">
      <FiltroPeriodo
        aba="painel"
        periodo={periodo}
        ocultos={filtros.secoes?.length ? { secoes: filtros.secoes.join(",") } : undefined}
        principal={
          <Alternador
            nome="visao"
            rotulo="Visão"
            valor={base}
            opcoes={[
              { valor: "competencia", rotulo: "Competência" },
              { valor: "caixa", rotulo: "Caixa" },
            ]}
          />
        }
        ativos={filtrosAtivos(filtros, contas, caixas, contrapartes)}
        filtros={
          <>
            <CampoFiltro rotulo="Tipo">
              <select name="tipo" defaultValue={filtros.tipo ?? ""} className={classeFiltro}>
                <option value="">Receitas e despesas</option>
                <option value="entrada">Só receitas</option>
                <option value="saida">Só despesas</option>
              </select>
            </CampoFiltro>
            <FiltroCategoria contas={contas} valor={filtros.conta} />
            <FiltroCaixa caixas={caixas} valor={filtros.caixa} />
            {recursos.fornecedores && <FiltroContraparte contrapartes={contrapartes} valor={filtros.contraparte} />}
          </>
        }
      />

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
                <p>Nenhum lançamento {filtros.caixa || filtros.conta || filtros.tipo || filtros.contraparte ? "com esses filtros " : ""}neste período.</p>
                <p className="mt-1">
                  Os gráficos aparecem assim que houver receitas ou despesas lançadas. Os números vêm só dos lançamentos
                  cadastrados{recursos.extratos ? "; movimentações de extrato importadas só entram depois de conciliadas" : ""}.
                </p>
                <span className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link href="?aba=lancamentos" className={classeBotao("primario", true)}>
                    <Plus />
                    Ir para os lançamentos
                  </Link>
                  {recursos.extratos && (
                    <Link href="?aba=extratos" className={classeBotao("secundario", true)}>
                      Importar extrato do banco
                    </Link>
                  )}
                </span>
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
                      links={meses.map((m) => link({ secoes: SECOES_RESULTADO }, ...noMes(m)))}
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
                      links={meses.map((m) => link({ secoes: SECOES_RESULTADO }, ...noMes(m)))}
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
                  <Barras fatias={fatias} link={(id) => link({ conta: id, secoes: [...SECOES_DESPESA] })} />
                </Cartao>
                {recursos.fornecedores && (
                  <Cartao>
                    <CabecalhoCartao titulo="Principais fornecedores" />
                    <Barras
                      fatias={porFornecedor}
                      link={(id) => link({ contraparte: id, secoes: [...SECOES_DESPESA] })}
                      vazio={
                        <>
                          Nenhuma despesa no período.{" "}
                          {contrapartes.length === 0 && (
                            <Link href="?aba=fornecedores" className="font-medium text-marca-700 hover:underline">
                              Cadastre os fornecedores
                            </Link>
                          )}
                        </>
                      }
                    />
                  </Cartao>
                )}
                <Cartao className={cx(recursos.fornecedores && "lg:col-span-2")}>
                  <CabecalhoCartao titulo="Maiores despesas do período">
                    <Link href={link({ secoes: [...SECOES_DESPESA], ordem: "maior" })} className="text-xs font-medium text-marca-700 hover:underline">
                      Ver todas
                    </Link>
                  </CabecalhoCartao>
                  {maiores.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-500">Nenhuma despesa no período.</p>
                  ) : (
                    <ol className={cx("divide-y divide-slate-100", recursos.fornecedores && "lg:grid lg:grid-flow-col lg:grid-rows-4 lg:gap-x-6 lg:divide-y-0")}>
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

// Barras horizontais de participação (categorias, fornecedores). Cada linha leva aos lançamentos dela.
function Barras({ fatias, link, vazio }: { fatias: FatiaDespesa[]; link: (id: string) => string; vazio?: ReactNode }) {
  if (fatias.length === 0) return <p className="px-5 py-4 text-sm text-slate-500">{vazio ?? "Nenhuma despesa no período."}</p>;
  return (
    <ul className="space-y-3 px-5 py-4">
      {fatias.map((f) => {
        const conteudo = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cx("min-w-0 truncate", f.id === SEM_CONTRAPARTE ? "italic text-slate-500" : "text-slate-700")}>{f.nome}</span>
              <span className="shrink-0 tabular-nums text-slate-900">
                {moeda(f.valor)}
                <span className="ml-2 text-xs text-slate-500">{percentual.format(f.participacao)}</span>
              </span>
            </span>
            <span className="mt-1 block h-2 rounded-full bg-slate-100">
              <span
                className="block h-2 rounded-full"
                style={{ width: `${Math.min(100, Math.max(1, f.participacao * 100))}%`, background: "var(--grafico-2)" }}
              />
            </span>
          </>
        );
        return (
          <li key={f.id ?? "outras"}>
            {f.id ? (
              <Link href={link(f.id)} className="block rounded-md hover:bg-slate-50">
                {conteudo}
              </Link>
            ) : (
              conteudo
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FiltroContraparte({ contrapartes, valor }: { contrapartes: Contraparte[]; valor?: string | null }) {
  return (
    <CampoFiltro rotulo="Fornecedor ou cliente">
      <select name="contraparte" defaultValue={valor ?? ""} className={classeFiltro}>
        <option value="">Todos</option>
        <option value={SEM_CONTRAPARTE}>(sem fornecedor ou cliente)</option>
        {contrapartes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
            {c.ativa ? "" : " (inativo)"}
          </option>
        ))}
      </select>
    </CampoFiltro>
  );
}

export function FiltroCaixa({ caixas, valor, nome = "caixa" }: { caixas: ContaCaixa[]; valor?: string | null; nome?: string }) {
  return (
    <CampoFiltro rotulo="Conta de caixa">
      <select name={nome} defaultValue={valor ?? ""} className={classeFiltro}>
        <option value="">Todas</option>
        {caixas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </CampoFiltro>
  );
}

export function FiltroCategoria({ contas, valor }: { contas: ContaPlano[]; valor?: string | null }) {
  return (
    <CampoFiltro rotulo="Categoria">
      <select name="conta" defaultValue={valor ?? ""} className={classeFiltro}>
        <option value="">Todas</option>
        {[...contas]
          .sort((a, b) => compararCodigo(a.codigo, b.codigo))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.nome}
            </option>
          ))}
      </select>
    </CampoFiltro>
  );
}

// Filtros comuns em uso, para as etiquetas com X embaixo da barra.
export function filtrosAtivos(filtros: Filtros, contas: ContaPlano[], caixas: ContaCaixa[], contrapartes: Contraparte[]): FiltroAtivo[] {
  const saida: FiltroAtivo[] = [];
  if (filtros.tipo) saida.push({ chaves: ["tipo"], rotulo: filtros.tipo === "entrada" ? "Só receitas" : "Só despesas" });
  const conta = filtros.conta && contas.find((c) => c.id === filtros.conta);
  if (conta) saida.push({ chaves: ["conta"], rotulo: `Categoria: ${conta.codigo} ${conta.nome}` });
  const caixa = filtros.caixa && caixas.find((c) => c.id === filtros.caixa);
  if (caixa) saida.push({ chaves: ["caixa"], rotulo: `Conta: ${caixa.nome}` });
  if (filtros.contraparte) {
    const nome = filtros.contraparte === SEM_CONTRAPARTE ? "sem fornecedor ou cliente" : contrapartes.find((c) => c.id === filtros.contraparte)?.nome;
    if (nome) saida.push({ chaves: ["contraparte"], rotulo: filtros.contraparte === SEM_CONTRAPARTE ? "Sem fornecedor ou cliente" : `Fornecedor ou cliente: ${nome}` });
  }
  if (filtros.secoes?.length) saida.push({ chaves: ["secoes"], rotulo: `Linhas ${filtros.secoes.join(", ")} da DRE` });
  return saida;
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

export function lerFiltros(
  valor: (k: string) => string | undefined,
  contas: ContaPlano[],
  caixas: ContaCaixa[],
  contrapartes: Contraparte[],
): Filtros {
  const caixa = valor("caixa");
  const contraparte = valor("contraparte");
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
    contraparte: contraparte === SEM_CONTRAPARTE || contrapartes.some((c) => c.id === contraparte) ? contraparte : null,
  };
}
