import { Ban, CreditCard, FileText, Link2, Plus, Undo2 } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { PainelLateral } from "@/components/painel-lateral";
import { AreaTexto, CabecalhoCartao, Campo, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t, type Tom } from "@/components/ui";
import { formatarData, formatarValor } from "@/lib/datas";
import {
  type BaseFinanceira,
  carregarConciliados,
  carregarExtratos,
  carregarFaturas,
  carregarFaturasConciliadas,
  carregarLancamentos,
  carregarMovimentosExtrato,
  carregarSaldos,
  carregarTransferencias,
} from "@/lib/financeiro/consultas";
import { compararCodigo, recebeLancamento, type ContaCaixa, type ContaPlano, type Contraparte, type SituacaoMovimento } from "@/lib/financeiro/dominio";
import { candidatosFatura, totalDaFatura } from "@/lib/financeiro/cartao";
import { candidatosConciliacao, candidatosTransferencia, somarDias } from "@/lib/financeiro/ofx";
import { conciliarComFormulario, desfazerConciliacao, ignorarMovimento, lancarDoExtrato } from "@/server/financeiro";
import { CamposLancamento } from "./campos";
import { textoPeriodo, type Periodo } from "@/lib/financeiro/periodo";
import { FiltroPeriodo } from "./filtro";
import { FiltroCaixa, filtrosAtivos } from "./painel";
import { ImportarExtrato } from "./importar-extrato";

const moeda = (v: number) => formatarValor(v, "R$")!;
const SITUACOES: Record<SituacaoMovimento, { rotulo: string; tom: Tom }> = {
  pendente: { rotulo: "Pendente", tom: "ambar" },
  conciliado: { rotulo: "Conciliado", tom: "verde" },
  ignorado: { rotulo: "Ignorado", tom: "cinza" },
};
// Distância máxima, em dias, entre a data do banco e a do lançamento para sugerir a conciliação.
const JANELA = 10;

// Extratos importados e conciliação. A movimentação do banco não mexe em saldo: o saldo continua vindo só dos
// lançamentos e transferências. Conciliar é ligar cada movimentação a um lançamento (ou transferência) que a explica.
export async function AbaExtratos({
  empresa,
  contas,
  caixas,
  contrapartes,
  cartoes,
  recursos,
  periodo,
  caixa,
  situacao,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  contrapartes: Contraparte[];
  cartoes: BaseFinanceira["cartoes"];
  recursos: BaseFinanceira["recursos"];
  periodo: Periodo;
  caixa: string | null;
  situacao: SituacaoMovimento | "todas";
}) {
  const { inicio, fim } = periodo;
  const [movimentos, extratos, todosLancamentos, transferencias, faturasBrutas, faturasConciliadas] = await Promise.all([
    carregarMovimentosExtrato(empresa.id, inicio, fim, caixa, recursos.cartoes),
    carregarExtratos(empresa.id),
    carregarLancamentos(empresa.id, somarDias(inicio, -JANELA), somarDias(fim, JANELA), "movimento"),
    carregarTransferencias(empresa.id, somarDias(inicio, -JANELA), somarDias(fim, JANELA)),
    recursos.cartoes ? carregarFaturas(empresa.id, somarDias(inicio, -JANELA), somarDias(fim, JANELA)) : Promise.resolve([]),
    recursos.cartoes ? carregarFaturasConciliadas(empresa.id) : Promise.resolve(new Set<string>()),
  ]);
  // Compra no cartão não se concilia sozinha: o que aparece no banco é o pagamento da fatura inteira.
  const lancamentos = todosLancamentos.filter((l) => !l.fatura_id);
  const faturas = faturasBrutas.map((f) => ({ ...f, total: totalDaFatura(f.compras) }));
  const porFatura = new Map(faturas.map((f) => [f.id, f]));
  const porCartao = new Map(cartoes.map((c) => [c.id, c]));
  const caixaDoCartao = new Map(cartoes.map((c) => [c.id, c.conta_caixa_id]));
  const nomeFatura = (f: { cartao_id: string; referencia: string }) =>
    `${porCartao.get(f.cartao_id)?.nome ?? "Cartão"}, fatura de ${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(f.referencia.slice(5, 7)) - 1]}/${f.referencia.slice(0, 4)}`;
  const conciliados = await carregarConciliados(empresa.id, lancamentos.map((l) => l.id));
  const transfConciliadas = new Map<string, Set<string>>();
  for (const m of movimentos) {
    if (!m.transferencia_id) continue;
    if (!transfConciliadas.has(m.conta_caixa_id)) transfConciliadas.set(m.conta_caixa_id, new Set());
    transfConciliadas.get(m.conta_caixa_id)!.add(m.transferencia_id);
  }

  const lista = movimentos
    .filter((m) => situacao === "todas" || m.situacao === situacao)
    // Pendentes primeiro; depois, as mais recentes.
    .sort((a, b) => Number(b.situacao === "pendente") - Number(a.situacao === "pendente") || b.data.localeCompare(a.data) || a.valor - b.valor);
  const contagem = (s: SituacaoMovimento) => movimentos.filter((m) => m.situacao === s).length;
  const totalPendente = movimentos.filter((m) => m.situacao === "pendente").reduce((a, m) => a + Math.round(m.valor * 100), 0) / 100;

  const nomeCaixa = new Map(caixas.map((c) => [c.id, c.nome]));
  const porLancamento = new Map(lancamentos.map((l) => [l.id, l]));
  const porTransferencia = new Map(transferencias.map((x) => [x.id, x]));
  const opcoesCaixa = caixas.filter((c) => c.ativa).map((c) => ({ valor: c.id, rotulo: c.nome }));
  const opcoesConta = contas
    .filter(recebeLancamento)
    .sort((a, b) => compararCodigo(a.codigo, b.codigo))
    .map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}` }));
  const opcoesContraparte = contrapartes.filter((c) => c.ativa).map((c) => ({ valor: c.id, rotulo: c.nome }));

  // Saldo do banco no último extrato de cada conta de caixa, ao lado do saldo do sistema na mesma data.
  const ultimoPorCaixa = new Map<string, (typeof extratos)[number]>();
  for (const e of extratos) if (e.saldo_banco !== null && e.saldo_banco_em && !ultimoPorCaixa.has(e.conta_caixa_id)) ultimoPorCaixa.set(e.conta_caixa_id, e);
  const conferencias = await Promise.all(
    [...ultimoPorCaixa.values()].map(async (e) => {
      const saldo = (await carregarSaldos(empresa.id, e.saldo_banco_em!)).find((s) => s.conta_caixa_id === e.conta_caixa_id)?.saldo ?? null;
      return { extrato: e, sistema: saldo };
    }),
  );

  const consulta = (extra: Record<string, string>) =>
    `?${new URLSearchParams({ aba: "extratos", de: periodo.de, ate: periodo.ate, ...(caixa ? { caixa } : {}), situacao, ...extra })}`;

  return (
    <div className="space-y-6">
      <FiltroPeriodo
        aba="extratos"
        periodo={periodo}
        ocultos={{ situacao }}
        ativos={filtrosAtivos({ caixa }, contas, caixas, [])}
        filtros={<FiltroCaixa caixas={caixas} valor={caixa} />}
        acoes={<ImportarExtrato empresaId={empresa.id} caixas={opcoesCaixa} />}
      />

      <p className="text-xs text-slate-500">
        As movimentações do extrato não mudam saldo nem resultado. Elas servem para conferir: cada uma é relacionada a um
        lançamento ou transferência que já existe, vira um lançamento novo ou é ignorada com um motivo.
      </p>

      {conferencias.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {conferencias.map(({ extrato: e, sistema }) => {
            const diferenca = sistema === null ? null : Math.round((e.saldo_banco! - sistema) * 100) / 100;
            return (
              <Cartao key={e.id} className="px-4 py-3">
                <p className="text-xs font-medium text-slate-500">
                  {nomeCaixa.get(e.conta_caixa_id)} · em {formatarData(e.saldo_banco_em)}
                </p>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
                  <dt className="text-slate-500">Banco</dt>
                  <dd className="text-right tabular-nums text-slate-900">{moeda(e.saldo_banco!)}</dd>
                  <dt className="text-slate-500">Sistema</dt>
                  <dd className="text-right tabular-nums text-slate-900">{sistema === null ? "—" : moeda(sistema)}</dd>
                </dl>
                <p className={cx("mt-1 text-xs font-medium", diferenca === 0 ? "text-emerald-700" : "text-amber-700")}>
                  {diferenca === null
                    ? "Data anterior ao saldo inicial da conta de caixa"
                    : diferenca === 0
                      ? "Saldos iguais"
                      : `Diferença de ${moeda(Math.abs(diferenca))} (${diferenca > 0 ? "banco maior" : "sistema maior"})`}
                </p>
              </Cartao>
            );
          })}
        </div>
      )}

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo={`Movimentações do banco · ${textoPeriodo(inicio, fim)}`} contagem={lista.length}>
          <span className="flex flex-wrap gap-1.5 text-xs">
            {(Object.keys(SITUACOES) as SituacaoMovimento[]).map((s) => (
              <Link
                key={s}
                href={consulta({ situacao: s })}
                className={cx("rounded-full px-2 py-0.5", situacao === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
              >
                {contagem(s)} {SITUACOES[s].rotulo.toLowerCase()}
                {contagem(s) === 1 ? "" : "s"}
              </Link>
            ))}
            <Link
              href={consulta({ situacao: "todas" })}
              className={cx("rounded-full px-2 py-0.5", situacao === "todas" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
            >
              todas
            </Link>
          </span>
        </CabecalhoCartao>
        {situacao === "pendente" && lista.length > 0 && (
          <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
            Soma das pendentes: <span className="font-medium tabular-nums text-slate-700">{moeda(totalPendente)}</span>
          </p>
        )}
        {lista.length === 0 ? (
          <Vazio icone={<FileText />}>
            {movimentos.length === 0
              ? "Nenhuma movimentação de extrato neste período. Use Importar extrato com o arquivo OFX do banco."
              : situacao === "pendente"
                ? "Nada pendente neste período: todas as movimentações foram conciliadas ou ignoradas."
                : "Nenhuma movimentação com esses filtros."}
          </Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Data</th>
                <th className={t.th}>Descrição no banco</th>
                <th className={`${t.th} hidden md:table-cell`}>Caixa</th>
                <th className={`${t.th} text-right`}>Valor</th>
                <th className={t.th}>Situação</th>
                <th className={t.th}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const s = SITUACOES[m.situacao];
                const lanc = m.lancamento_id ? porLancamento.get(m.lancamento_id) : null;
                const transf = m.transferencia_id ? porTransferencia.get(m.transferencia_id) : null;
                const fixo = {
                  direcao: m.valor > 0 ? ("entrada" as const) : ("saida" as const),
                  valor: Math.abs(m.valor),
                  data: m.data,
                  descricao: m.descricao,
                  documento: m.documento,
                };
                const cands =
                  m.situacao === "pendente" ? candidatosConciliacao(m, lancamentos, conciliados, JANELA) : [];
                const candsT =
                  m.situacao === "pendente" ? candidatosTransferencia(m, transferencias, transfConciliadas.get(m.conta_caixa_id) ?? new Set(), JANELA) : [];
                const candsF = m.situacao === "pendente" ? candidatosFatura(m, faturas, caixaDoCartao, faturasConciliadas, JANELA) : [];
                const nCands = cands.length + candsT.length + candsF.length;
                const fatura = m.fatura_id ? porFatura.get(m.fatura_id) : null;
                return (
                  <tr key={m.id} className={cx(t.linha, m.situacao === "ignorado" && "text-slate-400")}>
                    <td className={`${t.td} whitespace-nowrap`}>{formatarData(m.data)}</td>
                    <td className={t.td}>
                      <span className="font-medium text-slate-900">{m.descricao}</span>
                      {m.documento && <span className="text-xs text-slate-500"> · {m.documento}</span>}
                      {m.situacao === "conciliado" && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <Link2 className="size-3.5" />
                          {m.fatura_id
                            ? `Fatura: ${fatura ? nomeFatura(fatura) : "cartão"}`
                            : lanc
                            ? `Lançamento: ${lanc.descricao}`
                            : transf
                              ? `Transferência: ${nomeCaixa.get(transf.conta_origem_id)} → ${nomeCaixa.get(transf.conta_destino_id)}`
                              : m.transferencia_id
                                ? "Transferência"
                                : "Lançamento"}
                        </span>
                      )}
                      {m.situacao === "ignorado" && m.motivo && <span className="mt-0.5 block text-xs">Motivo: {m.motivo}</span>}
                      {m.situacao === "pendente" && nCands > 0 && (
                        <span className="mt-0.5 block text-xs text-marca-700">
                          {nCands === 1 ? "1 possível correspondência" : `${nCands} possíveis correspondências`}
                        </span>
                      )}
                    </td>
                    <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{nomeCaixa.get(m.conta_caixa_id)}</td>
                    <td
                      className={cx(
                        t.td,
                        "whitespace-nowrap text-right font-medium tabular-nums",
                        m.situacao !== "ignorado" && (m.valor > 0 ? "text-emerald-700" : "text-red-700"),
                      )}
                    >
                      {moeda(m.valor)}
                    </td>
                    <td className={t.td}>
                      <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta>
                    </td>
                    <td className={`${t.td} whitespace-nowrap text-right`}>
                      {m.situacao === "pendente" ? (
                        <>
                          <PainelLateral
                            titulo="Relacionar a um lançamento"
                            gatilho={
                              <>
                                <Link2 />
                                Relacionar
                              </>
                            }
                            classeGatilho={classeBotao("fantasma", true)}
                            acao={conciliarComFormulario.bind(null, m.id)}
                            rotuloSalvar="Relacionar"
                            aviso="Movimentação conciliada"
                          >
                            <ResumoMovimento descricao={m.descricao} valor={m.valor} data={m.data} caixa={nomeCaixa.get(m.conta_caixa_id)} />
                            {nCands === 0 ? (
                              <p className="text-sm text-slate-600">
                                Nenhum lançamento, transferência{recursos.cartoes ? " ou fatura de cartão" : ""} desta conta de caixa com o mesmo valor e o mesmo sentido, até{" "}
                                {JANELA} dias antes ou depois. Use Lançar para criar o lançamento a partir desta movimentação.
                              </p>
                            ) : (
                              <fieldset className="space-y-2">
                                <legend className="mb-1 text-sm font-medium text-slate-700">Escolha o que explica esta movimentação</legend>
                                {cands.map(({ lancamento: l, dias }, i) => (
                                  <label key={l.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                                    <input type="radio" name="vinculo" value={`lancamento:${l.id}`} defaultChecked={i === 0} className="mt-1" required />
                                    <span>
                                      <span className="block font-medium text-slate-900">{l.descricao}</span>
                                      <span className="block text-xs text-slate-500">
                                        {l.situacao === "previsto"
                                          ? `Previsto para ${formatarData(l.data_vencimento)}: passa a realizado em ${formatarData(m.data)}`
                                          : `Realizado em ${formatarData(l.data_liquidacao)}`}
                                        {dias > 0 && ` · ${dias} dia${dias === 1 ? "" : "s"} de diferença`}
                                      </span>
                                    </span>
                                  </label>
                                ))}
                                {candsF.map(({ fatura: f, dias }, i) => (
                                  <label key={f.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                                    <input
                                      type="radio"
                                      name="vinculo"
                                      value={`fatura:${f.id}`}
                                      defaultChecked={cands.length === 0 && i === 0}
                                      className="mt-1"
                                      required
                                    />
                                    <span>
                                      <span className="flex items-center gap-1 font-medium text-slate-900">
                                        <CreditCard className="size-3.5 text-slate-400" />
                                        {nomeFatura(f)}
                                      </span>
                                      <span className="block text-xs text-slate-500">
                                        {f.situacao === "paga"
                                          ? `Paga em ${formatarData(f.data_pagamento)}`
                                          : `Vence em ${formatarData(f.data_vencimento)}: as ${f.compras.filter((c) => c.situacao !== "cancelado").length} compras passam a pagas em ${formatarData(m.data)}`}
                                        {dias > 0 && ` · ${dias} dia${dias === 1 ? "" : "s"} de diferença`}
                                      </span>
                                    </span>
                                  </label>
                                ))}
                                {candsT.map(({ transferencia: x, dias }, i) => (
                                  <label key={x.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                                    <input
                                      type="radio"
                                      name="vinculo"
                                      value={`transferencia:${x.id}`}
                                      defaultChecked={cands.length + candsF.length === 0 && i === 0}
                                      className="mt-1"
                                      required
                                    />
                                    <span>
                                      <span className="block font-medium text-slate-900">
                                        Transferência {nomeCaixa.get(x.conta_origem_id)} → {nomeCaixa.get(x.conta_destino_id)}
                                      </span>
                                      <span className="block text-xs text-slate-500">
                                        {formatarData(x.data)}
                                        {x.descricao && ` · ${x.descricao}`}
                                        {dias > 0 && ` · ${dias} dia${dias === 1 ? "" : "s"} de diferença`}
                                      </span>
                                    </span>
                                  </label>
                                ))}
                              </fieldset>
                            )}
                          </PainelLateral>
                          {opcoesConta.length > 0 && (
                            <PainelLateral
                              titulo="Lançar a partir do extrato"
                              gatilho={
                                <>
                                  <Plus />
                                  Lançar
                                </>
                              }
                              classeGatilho={classeBotao("fantasma", true)}
                              acao={lancarDoExtrato.bind(null, m.id)}
                              rotuloSalvar="Lançar e conciliar"
                              aviso="Lançamento criado e conciliado"
                            >
                              <CamposLancamento caixas={[]} contas={opcoesConta} contrapartes={opcoesContraparte} fixo={fixo} />
                            </PainelLateral>
                          )}
                          <PainelLateral
                            titulo="Ignorar movimentação"
                            gatilho={
                              <>
                                <Ban />
                                Ignorar
                              </>
                            }
                            classeGatilho={classeBotao("fantasma", true)}
                            acao={ignorarMovimento.bind(null, m.id)}
                            rotuloSalvar="Ignorar"
                            aviso="Movimentação ignorada"
                          >
                            <ResumoMovimento descricao={m.descricao} valor={m.valor} data={m.data} caixa={nomeCaixa.get(m.conta_caixa_id)} />
                            <Campo rotulo="Motivo" dica="Ex.: estorno do mesmo dia, lançamento duplicado pelo banco, aplicação automática.">
                              <AreaTexto name="motivo" required rows={2} maxLength={300} />
                            </Campo>
                            <p className="text-xs text-slate-500">Ignorar não muda saldo nem resultado. Pode ser desfeito depois.</p>
                          </PainelLateral>
                        </>
                      ) : (
                        <BotaoAcao
                          acao={desfazerConciliacao.bind(null, m.id, recursos.cartoes)}
                          pergunta={
                            m.situacao === "conciliado"
                              ? m.fatura_id
                                ? "Desfazer a conciliação? A movimentação volta a pendente. A fatura continua paga; para desfazer o pagamento, use a aba Cartões."
                                : "Desfazer a conciliação? A movimentação volta a pendente. O lançamento continua existindo, sem mudança; se ele foi criado a partir do extrato e não deve existir, cancele-o na aba Lançamentos."
                              : "Voltar esta movimentação para pendente?"
                          }
                          aviso="Movimentação voltou a pendente"
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          <Undo2 className="size-3.5" />
                          Desfazer
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

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo="Arquivos importados" contagem={extratos.length} />
        {extratos.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Nenhum extrato importado ainda.</p>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Importado em</th>
                <th className={t.th}>Arquivo</th>
                <th className={`${t.th} hidden md:table-cell`}>Período</th>
                <th className={`${t.th} text-right`}>Novas</th>
                <th className={`${t.th} hidden text-right sm:table-cell`}>Já existiam</th>
                <th className={`${t.th} hidden text-right sm:table-cell`}>Com erro</th>
              </tr>
            </thead>
            <tbody>
              {extratos.map((e) => (
                <tr key={e.id} className={t.linha}>
                  <td className={`${t.td} whitespace-nowrap`}>{new Date(e.importado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</td>
                  <td className={t.td}>
                    <span className="font-medium text-slate-900">{e.arquivo_nome}</span>
                    <span className="block text-xs text-slate-500">
                      {nomeCaixa.get(e.conta_caixa_id)}
                      {e.conta && ` · conta ${e.conta}`}
                    </span>
                  </td>
                  <td className={`${t.td} hidden whitespace-nowrap text-slate-600 md:table-cell`}>
                    {e.periodo_inicio ? `${formatarData(e.periodo_inicio)} a ${formatarData(e.periodo_fim)}` : "—"}
                  </td>
                  <td className={`${t.td} text-right tabular-nums`}>{e.novas}</td>
                  <td className={`${t.td} hidden text-right tabular-nums sm:table-cell`}>{e.duplicadas}</td>
                  <td className={`${t.td} hidden text-right tabular-nums sm:table-cell`}>{e.com_erro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </div>
  );
}

function ResumoMovimento({ descricao, valor, data, caixa }: { descricao: string; valor: number; data: string; caixa?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <p className="font-medium text-slate-900">{descricao}</p>
      <p className="text-xs text-slate-500">
        {valor > 0 ? "Entrada" : "Saída"} de {moeda(Math.abs(valor))} em {formatarData(data)}
        {caixa && ` · ${caixa}`}
      </p>
    </div>
  );
}
