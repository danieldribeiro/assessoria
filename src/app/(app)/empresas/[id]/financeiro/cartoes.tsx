import { CalendarCog, CircleCheck, CreditCard, Pencil, Plus, Undo2 } from "lucide-react";
import { BotaoAcao } from "@/components/controles";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import { formatarData, formatarValor, hoje } from "@/lib/datas";
import { totalDaFatura } from "@/lib/financeiro/cartao";
import { carregarFaturas, carregarFaturasConciliadas, type BaseFinanceira } from "@/lib/financeiro/consultas";
import { compararCodigo, recebeLancamento, type Fatura, type Lancamento } from "@/lib/financeiro/dominio";
import { textoPeriodo, type Periodo } from "@/lib/financeiro/periodo";
import {
  ajustarFatura,
  cancelarCompra,
  desfazerPagamentoFatura,
  editarLancamento,
  lancarNoCartao,
  mudarAtivacaoCartao,
  pagarFatura,
  salvarCartao,
} from "@/server/financeiro";
import { CamposCartao, CamposCompraCartao, CamposDatasFatura, CamposLancamento, CamposPagamentoFatura } from "./campos";
import { CampoFiltro, FiltroPeriodo, classeFiltro } from "./filtro";

const moeda = (v: number) => formatarValor(v, "R$")!;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

// Cartões de crédito (0011). Cada compra é um lançamento com a sua categoria e a competência da compra; a fatura
// reúne as compras e, ao ser paga, realiza todas na data do pagamento. Assim o Resultado mostra cada compra no mês
// em que foi feita, e o Fluxo de caixa mostra a saída no dia do pagamento, separada por categoria.
export async function AbaCartoes({
  empresa,
  contas,
  caixas,
  contrapartes,
  cartoes,
  recursos,
  periodo,
  cartao,
}: BaseFinanceira & { periodo: Periodo; cartao: string | null }) {
  const { inicio, fim } = periodo;
  const [faturas, conciliadas] = await Promise.all([
    carregarFaturas(empresa.id, inicio, fim, cartao),
    recursos.extratos ? carregarFaturasConciliadas(empresa.id) : Promise.resolve(new Set<string>()),
  ]);
  const dia = hoje();
  const porCartao = new Map(cartoes.map((c) => [c.id, c]));
  const porConta = new Map(contas.map((c) => [c.id, c]));
  const nomeCaixa = new Map(caixas.map((c) => [c.id, c.nome]));
  const nomeContraparte = new Map(contrapartes.map((c) => [c.id, c.nome]));
  const opcoesCaixa = caixas.filter((c) => c.ativa).map((c) => ({ valor: c.id, rotulo: c.nome }));
  const opcoesCartao = cartoes
    .filter((c) => c.ativo)
    .map((c) => ({ valor: c.id, rotulo: c.nome, dia_fechamento: c.dia_fechamento, dia_vencimento: c.dia_vencimento }));
  const opcoesConta = contas
    .filter(recebeLancamento)
    .sort((a, b) => compararCodigo(a.codigo, b.codigo))
    .map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}` }));
  const opcoesContraparte = (atual?: string | null) =>
    recursos.fornecedores
      ? contrapartes.filter((c) => c.ativa || c.id === atual).map((c) => ({ valor: c.id, rotulo: c.ativa ? c.nome : `${c.nome} (inativo)` }))
      : null;
  const contasDaEdicao = (l: Lancamento) =>
    contas
      .filter((c) => recebeLancamento(c) || l.rateios.some((r) => r.conta_id === c.id))
      .sort((a, b) => compararCodigo(a.codigo, b.codigo))
      .map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}${c.ativa ? "" : " (inativa)"}` }));
  const comFaturas = new Set(faturas.map((f) => f.cartao_id));
  const totalPeriodo = faturas.reduce((a, f) => a + Math.round((f.situacao === "paga" ? f.valor_pago! : totalDaFatura(f.compras)) * 100), 0) / 100;

  return (
    <div className="space-y-6">
      <FiltroPeriodo
        aba="cartoes"
        periodo={periodo}
        ativos={cartao ? [{ chaves: ["cartao"], rotulo: `Cartão: ${porCartao.get(cartao)?.nome ?? ""}` }] : []}
        filtros={
          cartoes.length > 1 ? (
            <CampoFiltro rotulo="Cartão">
              <select name="cartao" defaultValue={cartao ?? ""} className={classeFiltro}>
                <option value="">Todos</option>
                {cartoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </CampoFiltro>
          ) : undefined
        }
        acoes={
          <>
            {opcoesCaixa.length > 0 && (
              <PainelLateral
                titulo="Novo cartão"
                gatilho={
                  <>
                    <Plus />
                    Cartão
                  </>
                }
                classeGatilho={classeBotao("secundario")}
                acao={salvarCartao.bind(null, empresa.id, null)}
                rotuloSalvar="Cadastrar cartão"
                aviso="Cartão cadastrado"
              >
                <CamposCartao caixas={opcoesCaixa} />
              </PainelLateral>
            )}
            {opcoesCartao.length > 0 && opcoesConta.length > 0 && (
              <PainelLateral
                titulo="Compra no cartão"
                gatilho={
                  <>
                    <CreditCard />
                    Compra no cartão
                  </>
                }
                classeGatilho={classeBotao("primario")}
                acao={lancarNoCartao}
                rotuloSalvar="Lançar compra"
                aviso="Compra lançada"
              >
                <CamposCompraCartao cartoes={opcoesCartao} contas={opcoesConta} contrapartes={opcoesContraparte()} />
              </PainelLateral>
            )}
          </>
        }
      />

      {cartoes.length === 0 ? (
        <Cartao>
          <Vazio icone={<CreditCard />}>
            Nenhum cartão cadastrado. Cadastre o cartão com o dia de fechamento, o dia de vencimento e a conta de caixa que
            paga a fatura; depois, lance cada compra com a sua categoria.
          </Vazio>
        </Cartao>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Faturas com vencimento ou pagamento em {textoPeriodo(inicio, fim)}
            {faturas.length > 1 && (
              <>
                {" "}
                · total <span className="font-medium tabular-nums text-slate-700">{moeda(totalPeriodo)}</span>
              </>
            )}
            . Cada compra entra no Resultado pelo mês da compra; o pagamento da fatura entra no Fluxo de caixa no dia em
            que foi pago, separado pelas categorias.
          </p>

          {faturas.length === 0 && (
            <Cartao>
              <Vazio icone={<CreditCard />}>Nenhuma fatura vence neste período. Use as setas do período para ver outros meses.</Vazio>
            </Cartao>
          )}

          {faturas.map((f) => (
            <CartaoFatura
              key={f.id}
              fatura={f}
              compras={f.compras}
              nomeCartao={porCartao.get(f.cartao_id)?.nome ?? "Cartão"}
              caixa={nomeCaixa.get(porCartao.get(f.cartao_id)?.conta_caixa_id ?? "")}
              conciliada={conciliadas.has(f.id)}
              dia={dia}
              porConta={porConta}
              nomeContraparte={nomeContraparte}
              editar={(l) => (
                <PainelLateral
                  titulo="Editar compra no cartão"
                  gatilho={
                    <>
                      <Pencil />
                      Editar
                    </>
                  }
                  classeGatilho={classeBotao("fantasma", true)}
                  acao={editarLancamento.bind(null, l.id)}
                  rotuloSalvar="Salvar alterações"
                  aviso="Compra alterada"
                >
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Toda alteração fica registrada, com o valor de antes e o de depois.
                    {f.situacao === "paga" && " Com a fatura paga, valor e tipo só mudam depois de desfazer o pagamento."}
                  </p>
                  <CamposLancamento
                    caixas={[]}
                    contas={contasDaEdicao(l)}
                    lancamento={l}
                    contrapartes={opcoesContraparte(l.contraparte_id)}
                    cartao={`${porCartao.get(f.cartao_id)?.nome ?? "Cartão"}, fatura de ${nomeMes(f.referencia)}.`}
                  />
                </PainelLateral>
              )}
            />
          ))}
        </>
      )}

      {cartoes.length > 0 && (
        <Cartao className="overflow-x-auto">
          <CabecalhoCartao titulo="Cartões cadastrados" contagem={cartoes.length} />
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Cartão</th>
                <th className={t.th}>Fecha / vence</th>
                <th className={`${t.th} hidden sm:table-cell`}>Pago pela conta</th>
                <th className={t.th}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cartoes.map((c) => (
                <tr key={c.id} className={cx(t.linha, !c.ativo && "text-slate-400")}>
                  <td className={t.td}>
                    <PainelLateral
                      titulo="Editar cartão"
                      classeGatilho="text-left font-medium text-slate-900 hover:text-marca-700"
                      acao={salvarCartao.bind(null, empresa.id, c.id)}
                      gatilho={c.nome}
                      aviso="Cartão alterado"
                    >
                      <CamposCartao
                        cartao={c}
                        caixas={caixas.filter((x) => x.ativa || x.id === c.conta_caixa_id).map((x) => ({ valor: x.id, rotulo: x.nome }))}
                        comFaturas={comFaturas.has(c.id) || undefined}
                      />
                    </PainelLateral>
                    {!c.ativo && (
                      <Etiqueta className="ml-2" tom="cinza">
                        inativo
                      </Etiqueta>
                    )}
                  </td>
                  <td className={`${t.td} whitespace-nowrap text-slate-600`}>
                    dia {c.dia_fechamento} / dia {c.dia_vencimento}
                  </td>
                  <td className={`${t.td} hidden text-slate-600 sm:table-cell`}>{nomeCaixa.get(c.conta_caixa_id)}</td>
                  <td className={`${t.td} text-right`}>
                    <BotaoAcao
                      acao={mudarAtivacaoCartao.bind(null, c.id, !c.ativo)}
                      aviso={c.ativo ? "Cartão desativado" : "Cartão reativado"}
                      pergunta={c.ativo ? `Desativar ${c.nome}? Ele deixa de receber compras novas; as faturas e o histórico continuam.` : undefined}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {c.ativo ? "Desativar" : "Reativar"}
                    </BotaoAcao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </div>
  );
}

function CartaoFatura({
  fatura: f,
  compras,
  nomeCartao,
  caixa,
  conciliada,
  dia,
  porConta,
  nomeContraparte,
  editar,
}: {
  fatura: Fatura;
  compras: Lancamento[];
  nomeCartao: string;
  caixa?: string;
  conciliada: boolean;
  dia: string;
  porConta: Map<string, { codigo: string; nome: string }>;
  nomeContraparte: Map<string, string>;
  editar: (l: Lancamento) => React.ReactNode;
}) {
  const ativas = compras.filter((c) => c.situacao !== "cancelado");
  const total = f.situacao === "paga" ? f.valor_pago! : totalDaFatura(compras);
  const fechada = f.situacao === "aberta" && dia >= f.data_fechamento;
  const etiqueta =
    f.situacao === "paga"
      ? { tom: "verde" as const, rotulo: "Paga" }
      : fechada
        ? { tom: dia > f.data_vencimento ? ("vermelho" as const) : ("ambar" as const), rotulo: dia > f.data_vencimento ? "Vencida" : "Fechada, a pagar" }
        : { tom: "azul" as const, rotulo: "Aberta" };

  // Quanto da fatura vai para cada categoria (saídas menos estornos), para a fatura não virar uma linha só.
  const porCategoria = new Map<string, number>();
  for (const c of ativas)
    for (const r of c.rateios)
      porCategoria.set(r.conta_id, (porCategoria.get(r.conta_id) ?? 0) + (c.direcao === "saida" ? 1 : -1) * Math.round(r.valor * 100));
  const categorias = [...porCategoria.entries()]
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => ({ conta: porConta.get(id), valor: v / 100 }));

  return (
    <Cartao className="overflow-x-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <CreditCard className="size-4 text-slate-400" />
            {nomeCartao} · fatura de {nomeMes(f.referencia)}
            <Etiqueta tom={etiqueta.tom}>{etiqueta.rotulo}</Etiqueta>
            {conciliada && <Etiqueta tom="cinza">conciliada com o extrato</Etiqueta>}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Fecha {formatarData(f.data_fechamento)} · vence {formatarData(f.data_vencimento)}
            {f.situacao === "paga" && ` · paga em ${formatarData(f.data_pagamento)}`}
            {caixa && ` · ${caixa}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-right">
            <span className="block text-xs text-slate-500">{f.situacao === "paga" ? "Valor pago" : "Total"}</span>
            <span className="text-base font-semibold tabular-nums text-slate-900">{moeda(total)}</span>
          </span>
          {f.situacao === "aberta" && (
            <>
              <PainelLateral
                titulo={`Ajustar datas: fatura de ${nomeMes(f.referencia)}`}
                gatilho={
                  <>
                    <CalendarCog />
                    Ajustar datas
                  </>
                }
                classeGatilho={classeBotao("fantasma", true)}
                acao={ajustarFatura.bind(null, f.id)}
                rotuloSalvar="Salvar datas"
                aviso="Datas da fatura alteradas"
              >
                <CamposDatasFatura fechamento={f.data_fechamento} vencimento={f.data_vencimento} />
              </PainelLateral>
              {total > 0 && (
                <PainelLateral
                  titulo={`Pagar fatura de ${nomeMes(f.referencia)}`}
                  gatilho={
                    <>
                      <CircleCheck />
                      Pagar fatura
                    </>
                  }
                  classeGatilho={classeBotao("primario", true)}
                  acao={pagarFatura.bind(null, f.id)}
                  rotuloSalvar={`Pagar ${moeda(total)}`}
                  aviso="Fatura paga"
                >
                  <CamposPagamentoFatura total={total} vencimento={f.data_vencimento} />
                </PainelLateral>
              )}
            </>
          )}
          {f.situacao === "paga" && !conciliada && (
            <BotaoAcao
              acao={desfazerPagamentoFatura.bind(null, f.id)}
              pergunta="Desfazer o pagamento? As compras voltam a previstas, com o vencimento da fatura, e o saldo da conta volta ao que era."
              aviso="Pagamento desfeito"
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              <Undo2 className="size-3.5" />
              Desfazer pagamento
            </BotaoAcao>
          )}
        </div>
      </div>

      {categorias.length > 0 && (
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
          Por categoria:{" "}
          {categorias.map((c, i) => (
            <span key={i} className="whitespace-nowrap">
              {i > 0 && " · "}
              {c.conta ? c.conta.nome : "conta"} <span className="tabular-nums text-slate-700">{moeda(c.valor)}</span>
            </span>
          ))}
        </p>
      )}

      {compras.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Nenhuma compra nesta fatura.</p>
      ) : (
        <table className={t.tabela}>
          <thead className={t.cabeca}>
            <tr>
              <th className={t.th}>Compra</th>
              <th className={t.th}>Descrição e categoria</th>
              <th className={`${t.th} text-right`}>Valor</th>
              <th className={t.th}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {compras.map((l) => {
              const sinal = l.direcao === "entrada" ? 1 : -1;
              const cancelada = l.situacao === "cancelado";
              return (
                <tr key={l.id} className={cx(t.linha, cancelada && "text-slate-400")}>
                  <td className={`${t.td} whitespace-nowrap`}>
                    {formatarData(l.data_competencia)}
                    {(l.parcelas ?? 1) > 1 && (
                      <span className="block text-xs text-slate-500">
                        parcela {l.parcela} de {l.parcelas}
                      </span>
                    )}
                  </td>
                  <td className={t.td}>
                    <span className={cx("font-medium", cancelada ? "line-through" : "text-slate-900")}>{l.descricao}</span>
                    {l.documento && <span className="text-xs text-slate-500"> · {l.documento}</span>}
                    {l.direcao === "entrada" && (
                      <Etiqueta tom="verde" className="ml-2">
                        estorno
                      </Etiqueta>
                    )}
                    {cancelada && (
                      <Etiqueta tom="cinza" className="ml-2">
                        cancelada
                      </Etiqueta>
                    )}
                    {l.contraparte_id && <span className="block text-xs font-medium text-slate-600">{nomeContraparte.get(l.contraparte_id)}</span>}
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {l.rateios.map((r, i) => {
                        const c = porConta.get(r.conta_id);
                        return (
                          <span key={i} className="block">
                            {c ? `${c.codigo} ${c.nome}` : "conta"}
                            {l.rateios.length > 1 && ` · ${moeda(r.valor)}`}
                          </span>
                        );
                      })}
                    </span>
                    {l.observacoes && <span className="mt-0.5 block whitespace-pre-line text-xs italic text-slate-500">{l.observacoes}</span>}
                  </td>
                  <td className={cx(t.td, "whitespace-nowrap text-right font-medium tabular-nums", !cancelada && (sinal > 0 ? "text-emerald-700" : "text-slate-900"))}>
                    {moeda(sinal * l.valor_total)}
                  </td>
                  <td className={`${t.td} whitespace-nowrap text-right`}>
                    {!cancelada && editar(l)}
                    {l.situacao === "previsto" && l.compra_id && (
                      <BotaoAcao
                        acao={cancelarCompra.bind(null, l.compra_id)}
                        pergunta={
                          (l.parcelas ?? 1) > 1
                            ? `Cancelar a compra “${l.descricao}”? Todas as parcelas em faturas ainda não pagas são canceladas. Elas saem do Resultado e da fatura, mas continuam registradas.`
                            : `Cancelar a compra “${l.descricao}”? Ela sai do Resultado e da fatura, mas continua registrada.`
                        }
                        aviso="Compra cancelada"
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
  );
}
