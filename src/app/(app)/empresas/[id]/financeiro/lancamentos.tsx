import { ArrowLeftRight, CircleCheck, Pencil, Plus, ReceiptText, X } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t, type Tom } from "@/components/ui";
import { formatarData, formatarPeriodo, formatarValor } from "@/lib/datas";
import { carregarLancamentos, carregarTransferencias } from "@/lib/financeiro/consultas";
import { compararCodigo, recebeLancamento, type ContaCaixa, type ContaPlano, type Lancamento, type SituacaoLancamento } from "@/lib/financeiro/dominio";
import { ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import { ORDENS, filtrarLancamentos, ordenar, type Filtros, type Ordem } from "@/lib/financeiro/painel";
import { cancelarLancamento, cancelarTransferencia, editarLancamento, lancar, liquidarLancamento, transferir } from "@/server/financeiro";
import { CamposLancamento, CamposLiquidacao, CamposTransferencia } from "./campos";
import { FiltroPeriodo, classeFiltro } from "./filtro";

const moeda = (v: number) => formatarValor(v, "R$")!;
const SITUACOES: Record<SituacaoLancamento, { rotulo: string; tom: Tom }> = {
  realizado: { rotulo: "Realizado", tom: "verde" },
  previsto: { rotulo: "Previsto", tom: "azul" },
  cancelado: { rotulo: "Cancelado", tom: "cinza" },
};

export async function AbaLancamentos({
  empresa,
  contas,
  caixas,
  periodo,
  situacao,
  criterio,
  filtros,
  ordem,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  periodo: { de: string; ate: string };
  situacao?: string;
  criterio: "movimento" | "competencia";
  filtros: Filtros;
  ordem: Ordem;
}) {
  const inicio = `${periodo.de}-01`;
  const fim = ultimoDiaDoMes(`${periodo.ate}-01`);
  const [todos, transferencias] = await Promise.all([
    carregarLancamentos(empresa.id, inicio, fim, criterio),
    carregarTransferencias(empresa.id, inicio, fim),
  ]);
  const filtro = situacao === "ativos" ? "ativos" : situacao && situacao in SITUACOES ? (situacao as SituacaoLancamento) : null;
  const naSituacao = todos.filter((l) => !filtro || (filtro === "ativos" ? l.situacao !== "cancelado" : l.situacao === filtro));
  const dataDaLinha = (l: Lancamento) =>
    criterio === "competencia" ? l.data_competencia : (l.data_liquidacao ?? l.data_vencimento ?? l.data_competencia);
  const filtrados = ordenar(filtrarLancamentos(naSituacao, contas, filtros), ordem, dataDaLinha);
  const lancamentos = filtrados.map((f) => f.lancamento);
  const selecao = new Map(filtrados.map((f) => [f.lancamento.id, f]));
  const totalSelecao = filtrados
    .filter((f) => f.lancamento.situacao !== "cancelado")
    .reduce((a, f) => a + Math.round(f.valorSelecao * 100), 0) / 100;
  const temFiltro = !!(filtros.caixa || filtros.conta || filtros.tipo || filtros.secoes?.length);
  const nomeContaFiltro = filtros.conta ? contas.find((c) => c.id === filtros.conta) : null;

  const porId = new Map(contas.map((c) => [c.id, c]));
  const nomeCaixa = new Map(caixas.map((c) => [c.id, c.nome]));
  const opcoesCaixa = caixas.filter((c) => c.ativa).map((c) => ({ valor: c.id, rotulo: c.nome }));
  const opcoesConta = contas
    .filter(recebeLancamento)
    .sort((a, b) => compararCodigo(a.codigo, b.codigo))
    .map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}` }));
  const podeLancar = opcoesCaixa.length > 0 && opcoesConta.length > 0;
  // Na edição, a conta de caixa e as contas do rateio atuais continuam na lista mesmo se foram desativadas.
  const opcoesEdicao = (l: Lancamento) => ({
    caixas: caixas
      .filter((c) => c.ativa || c.id === l.conta_caixa_id)
      .map((c) => ({ valor: c.id, rotulo: c.ativa ? c.nome : `${c.nome} (inativa)` })),
    contas: contas
      .filter((c) => recebeLancamento(c) || l.rateios.some((r) => r.conta_id === c.id))
      .sort((a, b) => compararCodigo(a.codigo, b.codigo))
      .map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}${c.ativa ? "" : " (inativa)"}` })),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FiltroPeriodo aba="lancamentos" de={periodo.de} ate={periodo.ate}>
          {filtros.secoes?.length ? <input type="hidden" name="secoes" value={filtros.secoes.join(",")} /> : null}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Data</span>
            <select name="data" defaultValue={criterio} className={classeFiltro}>
              <option value="movimento">Pagamento ou vencimento</option>
              <option value="competencia">Competência</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Situação</span>
            <select name="situacao" defaultValue={filtro ?? ""} className={classeFiltro}>
              <option value="">Todas</option>
              <option value="ativos">Previstos e realizados</option>
              {Object.entries(SITUACOES).map(([v, s]) => (
                <option key={v} value={v}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Tipo</span>
            <select name="tipo" defaultValue={filtros.tipo ?? ""} className={classeFiltro}>
              <option value="">Receitas e despesas</option>
              <option value="entrada">Receitas</option>
              <option value="saida">Despesas</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Categoria</span>
            <select name="conta" defaultValue={filtros.conta ?? ""} className={cx(classeFiltro, "max-w-56")}>
              <option value="">Todas</option>
              {[...contas]
                .sort((a, b) => compararCodigo(a.codigo, b.codigo))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {c.nome}
                  </option>
                ))}
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
            <span className="mb-1 block text-xs font-medium text-slate-500">Ordem</span>
            <select name="ordem" defaultValue={ordem} className={classeFiltro}>
              {Object.entries(ORDENS).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </FiltroPeriodo>
        {podeLancar && (
          <div className="flex flex-wrap gap-2">
            <PainelLateral
              titulo="Nova transferência entre contas"
              gatilho={
                <>
                  <ArrowLeftRight />
                  Transferência
                </>
              }
              classeGatilho={classeBotao("secundario")}
              acao={transferir.bind(null, empresa.id)}
              rotuloSalvar="Registrar transferência"
              aviso="Transferência registrada"
            >
              <CamposTransferencia caixas={opcoesCaixa} />
            </PainelLateral>
            <PainelLateral
              titulo="Novo lançamento"
              gatilho={
                <>
                  <Plus />
                  Lançamento
                </>
              }
              classeGatilho={classeBotao("primario")}
              acao={lancar.bind(null, empresa.id)}
              rotuloSalvar="Lançar"
              aviso="Lançamento registrado"
            >
              <CamposLancamento caixas={opcoesCaixa} contas={opcoesConta} />
            </PainelLateral>
          </div>
        )}
      </div>

      {!podeLancar && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Para lançar, a empresa precisa de ao menos uma conta de caixa ativa e uma conta analítica ativa que movimente
          caixa no plano de contas.
        </p>
      )}

      {(filtros.secoes?.length || nomeContaFiltro) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          Mostrando só a parte do rateio
          {nomeContaFiltro && ` na conta ${nomeContaFiltro.codigo} ${nomeContaFiltro.nome}`}
          {filtros.secoes?.length ? ` nas linhas ${filtros.secoes.join(", ")} da DRE` : ""}.
          {filtros.secoes?.length ? (
            <Link
              href={`?${new URLSearchParams({ aba: "lancamentos", de: periodo.de, ate: periodo.ate, data: criterio, ...(filtro ? { situacao: filtro } : {}) })}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-marca-700 hover:bg-marca-50"
            >
              <X className="size-3.5" />
              Tirar os filtros
            </Link>
          ) : null}
        </p>
      )}

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo={`Lançamentos · ${formatarPeriodo(inicio, fim)}`} contagem={lancamentos.length}>
          {lancamentos.length > 0 && (
            <span className="text-xs text-slate-500">
              {temFiltro || filtro ? "Total da seleção" : "Total"}, sem cancelados:{" "}
              <span className={cx("font-semibold tabular-nums", totalSelecao < 0 ? "text-red-700" : "text-slate-900")}>{moeda(totalSelecao)}</span>
            </span>
          )}
        </CabecalhoCartao>
        {lancamentos.length === 0 ? (
          <Vazio icone={<ReceiptText />}>Nenhum lançamento {temFiltro || filtro ? "com esses filtros " : ""}neste período.</Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Data</th>
                <th className={t.th}>Descrição e contas</th>
                <th className={`${t.th} hidden md:table-cell`}>Caixa</th>
                <th className={t.th}>Situação</th>
                <th className={`${t.th} text-right`}>Valor</th>
                <th className={t.th}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => {
                const s = SITUACOES[l.situacao];
                const sinal = l.direcao === "entrada" ? 1 : -1;
                return (
                  <tr key={l.id} className={cx(t.linha, l.situacao === "cancelado" && "text-slate-400")}>
                    <td className={`${t.td} whitespace-nowrap`}>
                      {formatarData(l.data_liquidacao ?? l.data_vencimento)}
                      {l.situacao === "previsto" && <span className="block text-xs text-slate-500">vencimento</span>}
                      {(criterio === "competencia" ||
                        l.data_competencia.slice(0, 7) !== (l.data_liquidacao ?? l.data_vencimento ?? "").slice(0, 7)) && (
                        <span className="block text-xs text-slate-500">competência {formatarData(l.data_competencia)}</span>
                      )}
                    </td>
                    <td className={t.td}>
                      <span className={cx("font-medium", l.situacao === "cancelado" ? "line-through" : "text-slate-900")}>{l.descricao}</span>
                      {l.documento && <span className="text-xs text-slate-500"> · {l.documento}</span>}
                      <span className="mt-0.5 block space-y-0.5 text-xs text-slate-500">
                        {l.rateios.map((r, i) => {
                          const c = porId.get(r.conta_id);
                          return (
                            <span key={i} className="block">
                              {c ? `${c.codigo} ${c.nome}` : "conta"}
                              {l.rateios.length > 1 && ` · ${moeda(r.valor)}`}
                            </span>
                          );
                        })}
                      </span>
                      {l.juros_nao_segregados && (
                        <Etiqueta tom="ambar" className="mt-1">
                          juros não segregados
                        </Etiqueta>
                      )}
                    </td>
                    <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{nomeCaixa.get(l.conta_caixa_id)}</td>
                    <td className={t.td}>
                      <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta>
                    </td>
                    <td
                      className={cx(
                        t.td,
                        "whitespace-nowrap text-right font-medium tabular-nums",
                        l.situacao !== "cancelado" && (sinal > 0 ? "text-emerald-700" : "text-red-700"),
                      )}
                    >
                      {moeda(sinal * l.valor_total)}
                      {selecao.get(l.id)?.parcial && (
                        <span className="block text-xs font-normal text-slate-500">
                          {moeda(selecao.get(l.id)!.valorSelecao)} na seleção
                        </span>
                      )}
                    </td>
                    <td className={`${t.td} whitespace-nowrap text-right`}>
                      {l.situacao !== "cancelado" && (
                        <PainelLateral
                          titulo="Editar lançamento"
                          gatilho={
                            <>
                              <Pencil />
                              Editar
                            </>
                          }
                          classeGatilho={classeBotao("fantasma", true)}
                          acao={editarLancamento.bind(null, l.id)}
                          rotuloSalvar="Salvar alterações"
                          aviso="Lançamento alterado"
                        >
                          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            Toda alteração fica registrada, com o valor de antes e o de depois.
                          </p>
                          <CamposLancamento {...opcoesEdicao(l)} lancamento={l} />
                        </PainelLateral>
                      )}
                      {l.situacao === "previsto" && (
                        <PainelLateral
                          titulo={`Marcar como realizado: ${l.descricao}`}
                          gatilho={
                            <>
                              <CircleCheck />
                              Realizar
                            </>
                          }
                          classeGatilho={classeBotao("fantasma", true)}
                          acao={liquidarLancamento.bind(null, l.id)}
                          rotuloSalvar="Marcar como realizado"
                          aviso="Lançamento realizado"
                        >
                          <CamposLiquidacao />
                        </PainelLateral>
                      )}
                      {l.situacao !== "cancelado" && (
                        <BotaoAcao
                          acao={cancelarLancamento.bind(null, l.id)}
                          pergunta={`Cancelar o lançamento “${l.descricao}”? Ele sai do saldo e do fluxo, mas continua registrado. Isso não pode ser desfeito.`}
                          aviso="Lançamento cancelado"
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Cancelar
                        </BotaoAcao>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Cartao>

      <Cartao>
        <CabecalhoCartao titulo="Transferências entre contas" contagem={transferencias.length} />
        {transferencias.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Nenhuma transferência neste período.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {transferencias.map((x) => (
              <li key={x.id} className={cx("flex items-center justify-between gap-3 px-5 py-2.5 text-sm", x.situacao === "cancelado" && "text-slate-400")}>
                <span className="min-w-0">
                  <span className={x.situacao === "cancelado" ? "line-through" : "text-slate-900"}>
                    {nomeCaixa.get(x.conta_origem_id)} → {nomeCaixa.get(x.conta_destino_id)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatarData(x.data)}
                    {x.descricao && ` · ${x.descricao}`}
                    {x.situacao === "cancelado" && " · cancelada"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{moeda(x.valor)}</span>
                  {x.situacao === "realizado" && (
                    <BotaoAcao
                      acao={cancelarTransferencia.bind(null, x.id)}
                      pergunta="Cancelar esta transferência? Os saldos das duas contas voltam ao que eram. Isso não pode ser desfeito."
                      aviso="Transferência cancelada"
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Cancelar
                    </BotaoAcao>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
