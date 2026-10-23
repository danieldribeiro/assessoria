import { ArrowLeftRight, ChevronRight, CircleCheck, CreditCard, Landmark, Pencil, Plus, ReceiptText } from "lucide-react";
import { BotaoAcao } from "@/components/controles";
import { PainelLateral, PainelLeitura } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t, type Tom } from "@/components/ui";
import Link from "next/link";
import { formatarData, formatarMes, formatarValor } from "@/lib/datas";
import {
  carregarConciliados,
  carregarFaturasConciliadas,
  carregarFaturasPorId,
  carregarLancamentos,
  carregarTransferencias,
  type BaseFinanceira,
} from "@/lib/financeiro/consultas";
import { compararCodigo, recebeLancamento, type ContaCaixa, type ContaPlano, type Contraparte, type Fatura, type Lancamento, type SituacaoLancamento } from "@/lib/financeiro/dominio";
import { ORDENS, filtrarLancamentos, ordenar, type Filtros, type Ordem } from "@/lib/financeiro/painel";
import { cancelarCompra, cancelarLancamento, cancelarTransferencia, editarLancamento, lancar, lancarNoCartao, liquidarLancamento, transferir } from "@/server/financeiro";
import { CamposCompraCartao, CamposLancamento, CamposLiquidacao, CamposTransferencia } from "./campos";
import { textoPeriodo, type Periodo } from "@/lib/financeiro/periodo";
import { CampoFiltro, FiltroPeriodo, classeFiltro } from "./filtro";
import { SelectAuto, type FiltroAtivo } from "./filtros-ui";
import { FiltroCaixa, FiltroCategoria, FiltroContraparte, filtrosAtivos } from "./painel";

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
  contrapartes,
  cartoes,
  recursos,
  periodo,
  situacao,
  criterio,
  filtros,
  ordem,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  contrapartes: Contraparte[];
  cartoes: BaseFinanceira["cartoes"];
  recursos: BaseFinanceira["recursos"];
  periodo: Periodo;
  situacao?: string;
  criterio: "movimento" | "competencia";
  filtros: Filtros;
  ordem: Ordem;
}) {
  const { inicio, fim } = periodo;
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
  const temFiltro = !!(filtros.caixa || filtros.conta || filtros.tipo || filtros.contraparte || filtros.secoes?.length);
  const ativos: FiltroAtivo[] = [
    ...(filtro ? [{ chaves: ["situacao"], rotulo: filtro === "ativos" ? "Previstos e realizados" : SITUACOES[filtro].rotulo }] : []),
    ...filtrosAtivos(filtros, contas, caixas, contrapartes),
    ...(criterio === "competencia" ? [{ chaves: ["data"], rotulo: "Pela competência" }] : []),
  ];
  const conciliados = recursos.extratos ? await carregarConciliados(empresa.id, lancamentos.map((l) => l.id)) : new Set<string>();

  // Pela data de pagamento ou vencimento, as compras no cartão ficam juntas: uma linha por fatura, como o banco
  // mostra, e as compras aparecem ao clicar. Pela competência, cada compra fica no mês em que foi feita.
  type Linha = { tipo: "lancamento"; l: Lancamento } | { tipo: "fatura"; id: string; compras: Lancamento[] };
  const linhas: Linha[] = [];
  const grupos = new Map<string, Lancamento[]>();
  for (const l of lancamentos) {
    if (criterio === "movimento" && recursos.cartoes && l.fatura_id) {
      let g = grupos.get(l.fatura_id);
      if (!g) {
        g = [];
        grupos.set(l.fatura_id, g);
        linhas.push({ tipo: "fatura", id: l.fatura_id, compras: g });
      }
      g.push(l);
    } else linhas.push({ tipo: "lancamento", l });
  }
  const [faturas, faturasConciliadas] = grupos.size
    ? await Promise.all([
        carregarFaturasPorId(empresa.id, [...grupos.keys()]),
        recursos.extratos ? carregarFaturasConciliadas(empresa.id) : Promise.resolve(new Set<string>()),
      ])
    : [[], new Set<string>()];
  const porFatura = new Map(faturas.map((f) => [f.id, f]));
  const nomeCartao = new Map(cartoes.map((c) => [c.id, c.nome]));
  const nomeContraparte = new Map(contrapartes.map((c) => [c.id, c.nome]));
  // Sem a migration 0009, os campos de fornecedor e observações ficam fora do formulário.
  const opcoesContraparte = (atual?: string | null) =>
    recursos.fornecedores
      ? contrapartes
          .filter((c) => c.ativa || c.id === atual)
          .map((c) => ({ valor: c.id, rotulo: c.ativa ? c.nome : `${c.nome} (inativo)` }))
      : null;

  const porId = new Map(contas.map((c) => [c.id, c]));
  const nomeCaixa = new Map(caixas.map((c) => [c.id, c.nome]));
  const opcoesCaixa = caixas.filter((c) => c.ativa).map((c) => ({ valor: c.id, rotulo: c.nome }));
  const opcoesConta = contas
    .filter(recebeLancamento)
    .sort((a, b) => compararCodigo(a.codigo, b.codigo))
    .map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}` }));
  const podeLancar = opcoesCaixa.length > 0 && opcoesConta.length > 0;
  const opcoesCartao = cartoes
    .filter((c) => c.ativo)
    .map((c) => ({ valor: c.id, rotulo: c.nome, dia_fechamento: c.dia_fechamento, dia_vencimento: c.dia_vencimento }));
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
      <FiltroPeriodo
        aba="lancamentos"
        periodo={periodo}
        ocultos={filtros.secoes?.length ? { secoes: filtros.secoes.join(",") } : undefined}
        ativos={ativos}
        filtros={
          <>
            <CampoFiltro rotulo="Situação">
              <select name="situacao" defaultValue={filtro ?? ""} className={classeFiltro}>
                <option value="">Todas</option>
                <option value="ativos">Previstos e realizados</option>
                {Object.entries(SITUACOES).map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </CampoFiltro>
            <CampoFiltro rotulo="Tipo">
              <select name="tipo" defaultValue={filtros.tipo ?? ""} className={classeFiltro}>
                <option value="">Receitas e despesas</option>
                <option value="entrada">Receitas</option>
                <option value="saida">Despesas</option>
              </select>
            </CampoFiltro>
            <FiltroCategoria contas={contas} valor={filtros.conta} />
            <FiltroCaixa caixas={caixas} valor={filtros.caixa} />
            {recursos.fornecedores && <FiltroContraparte contrapartes={contrapartes} valor={filtros.contraparte} />}
            <CampoFiltro rotulo="Data usada no período">
              <select name="data" defaultValue={criterio} className={classeFiltro}>
                <option value="movimento">Pagamento ou vencimento</option>
                <option value="competencia">Competência</option>
              </select>
            </CampoFiltro>
          </>
        }
        acoes={
          podeLancar && (
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
                {opcoesCartao.length > 0 && (
                  <PainelLateral
                    titulo="Compra no cartão"
                    gatilho={
                      <>
                        <CreditCard />
                        Compra no cartão
                      </>
                    }
                    classeGatilho={classeBotao("secundario")}
                    acao={lancarNoCartao}
                    rotuloSalvar="Lançar compra"
                    aviso="Compra lançada"
                  >
                    <CamposCompraCartao cartoes={opcoesCartao} contas={opcoesConta} contrapartes={opcoesContraparte()} />
                  </PainelLateral>
                )}
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
                  <CamposLancamento caixas={opcoesCaixa} contas={opcoesConta} contrapartes={opcoesContraparte()} />
                </PainelLateral>
              </div>
          )
        }
      />

      {!podeLancar && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Para lançar, a empresa precisa de ao menos uma conta de caixa ativa e uma conta analítica ativa que movimente
          caixa no plano de contas.
        </p>
      )}

      {(filtros.secoes?.length || filtros.conta) && (
        <p className="text-xs text-slate-500">Com filtro de categoria ou de linha da DRE, o valor mostrado é só a parte do rateio que entra no filtro.</p>
      )}

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo={`Lançamentos · ${textoPeriodo(inicio, fim)}`} contagem={linhas.length}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {lancamentos.length > 0 && (
              <span className="text-xs text-slate-500">
                {temFiltro || filtro ? "Total da seleção" : "Total"}, sem cancelados:{" "}
                <span className={cx("font-semibold tabular-nums", totalSelecao < 0 ? "text-red-700" : "text-slate-900")}>{moeda(totalSelecao)}</span>
              </span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Ordem
              <SelectAuto form="filtros-lancamentos" name="ordem" defaultValue={ordem} className={cx(classeFiltro, "py-1 text-xs")}>
                {Object.entries(ORDENS).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </SelectAuto>
            </label>
          </div>
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
              {linhas.map((x) => {
                if (x.tipo === "fatura") {
                  const f = porFatura.get(x.id);
                  const ativas = x.compras.filter((c) => c.situacao !== "cancelado");
                  const total = ativas.reduce((a, c) => a + Math.round((selecao.get(c.id)?.valorSelecao ?? 0) * 100), 0) / 100;
                  const paga = f?.situacao === "paga";
                  const s = SITUACOES[paga ? "realizado" : "previsto"];
                  const titulo = f ? `Fatura ${nomeCartao.get(f.cartao_id) ?? "do cartão"} · ${formatarMes(f.referencia)}` : "Fatura do cartão";
                  const mes = (f?.data_vencimento ?? x.compras[0].data_vencimento ?? "").slice(0, 7);
                  const porConta = new Map<string, number>();
                  for (const c of ativas)
                    for (const r of c.rateios)
                      porConta.set(r.conta_id, (porConta.get(r.conta_id) ?? 0) + (c.direcao === "saida" ? 1 : -1) * Math.round(r.valor * 100));
                  const categorias = [...porConta.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
                  return (
                    <tr key={x.id} className={t.linha}>
                      <td className={`${t.td} whitespace-nowrap`}>
                        {formatarData(paga ? f?.data_pagamento : (f?.data_vencimento ?? x.compras[0].data_vencimento))}
                        {!paga && <span className="block text-xs text-slate-500">vencimento</span>}
                      </td>
                      <td className={t.td}>
                        <PainelLeitura
                          titulo={titulo}
                          classeGatilho="group text-left"
                          gatilho={
                            <>
                              <span className="flex items-center gap-1.5 font-medium text-slate-900 group-hover:text-marca-700">
                                <CreditCard className="size-4 text-slate-400" />
                                {titulo}
                                <ChevronRight className="size-3.5 text-slate-400" />
                              </span>
                              <span className="block text-xs text-slate-500">
                                {ativas.length} {ativas.length === 1 ? "compra" : "compras"} · ver detalhes
                              </span>
                            </>
                          }
                          rodape={
                            f && (
                              <Link
                                href={`?${new URLSearchParams({ aba: "cartoes", de: mes, ate: mes, cartao: f.cartao_id })}`}
                                className="text-sm font-medium text-marca-700 hover:underline"
                              >
                                Abrir na aba Cartões
                              </Link>
                            )
                          }
                        >
                          <DetalheFatura
                            fatura={f}
                            compras={x.compras}
                            categorias={categorias.map(([id, v]) => ({ nome: porId.get(id)?.nome ?? "conta", valor: v / 100 }))}
                            porId={porId}
                            nomeContraparte={nomeContraparte}
                            parcial={temFiltro || !!filtro}
                          />
                        </PainelLeitura>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {categorias.slice(0, 3).map(([id, v], i) => (
                            <span key={id} className="whitespace-nowrap">
                              {i > 0 && " · "}
                              {porId.get(id)?.nome ?? "conta"} {moeda(v / 100)}
                            </span>
                          ))}
                          {categorias.length > 3 && ` · e mais ${categorias.length - 3}`}
                        </span>
                      </td>
                      <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{nomeCaixa.get(x.compras[0].conta_caixa_id)}</td>
                      <td className={t.td}>
                        <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta>
                        {faturasConciliadas.has(x.id) && (
                          <span className="mt-1 flex items-center gap-1 text-xs text-slate-500" title="Ligada ao pagamento no extrato do banco">
                            <Landmark className="size-3.5" />
                            conciliada
                          </span>
                        )}
                      </td>
                      <td className={cx(t.td, "whitespace-nowrap text-right font-medium tabular-nums", total > 0 ? "text-emerald-700" : "text-red-700")}>
                        {moeda(total)}
                      </td>
                      <td className={`${t.td} whitespace-nowrap text-right`} />
                    </tr>
                  );
                }
                const l = x.l;
                const s = SITUACOES[l.situacao];
                const sinal = l.direcao === "entrada" ? 1 : -1;
                return (
                  <tr key={l.id} className={cx(t.linha, l.situacao === "cancelado" && "text-slate-400")}>
                    <td className={`${t.td} whitespace-nowrap`}>
                      {formatarData(l.data_liquidacao ?? l.data_vencimento)}
                      {l.situacao === "previsto" && <span className="block text-xs text-slate-500">vencimento</span>}
                      {(criterio === "competencia" ||
                        l.data_competencia.slice(0, 7) !== (l.data_liquidacao ?? l.data_vencimento ?? "").slice(0, 7)) && (
                        <span className="block text-xs text-slate-500">competência {formatarMes(l.data_competencia)}</span>
                      )}
                    </td>
                    <td className={t.td}>
                      <span className={cx("font-medium", l.situacao === "cancelado" ? "line-through" : "text-slate-900")}>{l.descricao}</span>
                      {l.documento && <span className="text-xs text-slate-500"> · {l.documento}</span>}
                      {l.contraparte_id && (
                        <span className="block text-xs font-medium text-slate-600">{nomeContraparte.get(l.contraparte_id) ?? "fornecedor ou cliente"}</span>
                      )}
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
                      {l.observacoes && <span className="mt-0.5 block whitespace-pre-line text-xs italic text-slate-500">{l.observacoes}</span>}
                      {l.fatura_id && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-slate-500" title="Compra no cartão: a fatura decide a situação e as datas">
                          <CreditCard className="size-3.5" />
                          no cartão{(l.parcelas ?? 1) > 1 && ` · parcela ${l.parcela} de ${l.parcelas}`}
                        </span>
                      )}
                      {l.juros_nao_segregados && (
                        <Etiqueta tom="ambar" className="mt-1">
                          juros não segregados
                        </Etiqueta>
                      )}
                    </td>
                    <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{nomeCaixa.get(l.conta_caixa_id)}</td>
                    <td className={t.td}>
                      <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta>
                      {conciliados.has(l.id) && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-slate-500" title="Ligado a uma movimentação do extrato do banco">
                          <Landmark className="size-3.5" />
                          conciliado
                        </span>
                      )}
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
                          {conciliados.has(l.id) && (
                            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              Este lançamento está conciliado com o extrato do banco: valor, entrada ou saída, conta de caixa e
                              situação não mudam. Para mudar, desfaça a conciliação na aba Extratos.
                            </p>
                          )}
                          <CamposLancamento
                            {...opcoesEdicao(l)}
                            lancamento={l}
                            contrapartes={opcoesContraparte(l.contraparte_id)}
                            cartao={l.fatura_id ? (l.situacao === "realizado" ? "Compra no cartão, em fatura já paga." : "Compra no cartão, em fatura aberta.") : undefined}
                          />
                        </PainelLateral>
                      )}
                      {l.situacao === "previsto" && !l.fatura_id && (
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
                      {l.fatura_id && l.compra_id && l.situacao === "previsto" && (
                        <BotaoAcao
                          acao={cancelarCompra.bind(null, l.compra_id)}
                          pergunta={`Cancelar a compra no cartão “${l.descricao}”? ${(l.parcelas ?? 1) > 1 ? "Todas as parcelas em faturas ainda não pagas são canceladas. " : ""}Ela sai do Resultado e da fatura, mas continua registrada.`}
                          aviso="Compra cancelada"
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Cancelar
                        </BotaoAcao>
                      )}
                      {l.situacao !== "cancelado" && !l.fatura_id && !conciliados.has(l.id) && (
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

// Compras de uma fatura, para ler: quando foi cada compra, em que categoria e de que fornecedor.
function DetalheFatura({
  fatura: f,
  compras,
  categorias,
  porId,
  nomeContraparte,
  parcial,
}: {
  fatura?: Fatura;
  compras: Lancamento[];
  categorias: { nome: string; valor: number }[];
  porId: Map<string, ContaPlano>;
  nomeContraparte: Map<string, string>;
  parcial: boolean;
}) {
  return (
    <>
      {f && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Fecha {formatarData(f.data_fechamento)} · vence {formatarData(f.data_vencimento)}
          {f.situacao === "paga" ? ` · paga em ${formatarData(f.data_pagamento)}, ${moeda(f.valor_pago!)}` : " · ainda não paga"}
        </p>
      )}
      {parcial && <p className="text-xs text-amber-700">Com os filtros em uso, só aparecem as compras (ou a parte delas) que entram no filtro.</p>}
      {categorias.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Por categoria</p>
          <ul className="space-y-0.5 text-sm">
            {categorias.map((c, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-slate-700">{c.nome}</span>
                <span className="tabular-nums text-slate-900">{moeda(Math.abs(c.valor))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Compras</p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {compras.map((c) => (
            <li key={c.id} className={cx("flex justify-between gap-3 px-3 py-2 text-sm", c.situacao === "cancelado" && "text-slate-400")}>
              <span className="min-w-0">
                <span className={cx("block font-medium", c.situacao === "cancelado" ? "line-through" : "text-slate-900")}>{c.descricao}</span>
                <span className="block text-xs text-slate-500">
                  {formatarData(c.data_competencia)}
                  {(c.parcelas ?? 1) > 1 && ` · parcela ${c.parcela} de ${c.parcelas}`}
                  {c.contraparte_id && ` · ${nomeContraparte.get(c.contraparte_id) ?? ""}`}
                  {c.situacao === "cancelado" && " · cancelada"}
                </span>
                <span className="block text-xs text-slate-500">
                  {c.rateios.map((r) => porId.get(r.conta_id)?.nome ?? "conta").join(" · ")}
                </span>
              </span>
              <span className={cx("whitespace-nowrap tabular-nums", c.direcao === "entrada" && c.situacao !== "cancelado" ? "text-emerald-700" : "")}>
                {moeda((c.direcao === "entrada" ? 1 : -1) * c.valor_total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
