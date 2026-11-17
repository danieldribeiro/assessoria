import { ChartPie } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import type { ContaPlano } from "@/lib/financeiro/dominio";
import { carregarCmvReal, carregarItensEstoque, carregarProdutos, carregarVendas } from "@/lib/financeiro/consultas";
import { cmvTeorico } from "@/lib/financeiro/estoque";
import { apagarVendas, fecharCmvMes, reabrirCmvMes } from "@/server/estoque";
import { EditorComplementos } from "./complementos";
import { ImportarVendas } from "./importar-estoque";

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const parte = (a: number, b: number) => (b > 0 ? a / b : null);

// CMV do mês (0019): o teórico (vendas do PDV × fichas técnicas) ao lado do real (compras da DRE + estoque inicial − final).
export async function AbaCmv({ empresa, contas, mes }: { empresa: { id: string }; contas: ContaPlano[]; mes?: string }) {
  const [vendas, produtos, itens] = await Promise.all([carregarVendas(empresa.id), carregarProdutos(empresa.id), carregarItensEstoque(empresa.id)]);
  const aberta = vendas.find((v) => v.mes.slice(0, 7) === mes) ?? vendas[0] ?? null;
  const comFicha = produtos.filter((p) => p.ficha.length).map((p) => p.nome);

  if (!aberta) {
    return (
      <div className="space-y-6">
        <Cartao>
          <CabecalhoCartao titulo="CMV do mês">
            <ImportarVendas empresaId={empresa.id} produtosComFicha={comFicha} />
          </CabecalhoCartao>
          <Vazio icone={<ChartPie />}>
            Importe o relatório de vendas por produto do PDV (.xls ou .xlsx) de um mês. Com as fichas técnicas, o Axis calcula
            quanto o CMV deveria ter sido (teórico) e compara com o que foi de fato (real, pelas compras e contagens).
          </Vazio>
        </Cartao>
        <Explicacao />
      </div>
    );
  }

  const fichas = new Map(produtos.map((p) => [p.id, p.ficha]));
  // Fechar o mês (0023): só aparece depois da migração. Fechado, o teórico usa os custos gravados no fechamento.
  const podeFechar = "fechado_em" in aberta;
  const fechado = !!aberta.fechado_em;
  // Complementos (0025): adicionais digitados no mês. Só aparecem depois da migração.
  const temComplementos = aberta.linhas.length > 0 && "complemento" in aberta.linhas[0];
  const complementos = aberta.linhas.filter((l) => l.complemento);
  const vendaComplementos = complementos.reduce((a, l) => a + Math.round((l.valor ?? 0) * 100), 0);
  const teorico = cmvTeorico(aberta.linhas, fichas, new Map(itens.map((i) => [i.id, i])), fechado);
  const realMes = await carregarCmvReal(empresa.id, contas, aberta.mes);
  const linhas = [...teorico.linhas].sort((a, b) => (b.venda ?? 0) - (a.venda ?? 0) || b.quantidade - a.quantidade);
  const pTeorico = parte(teorico.cmv, teorico.vendaComFicha);
  const pReal = realMes.variacao === null ? null : parte(realMes.cmv, teorico.venda);
  const cobertura = parte(teorico.vendaComFicha, teorico.venda);
  // Preço de venda de tabela (0024): quanto daria pela tabela, comparado com o que o PDV registrou.
  const comPreco = produtos.length > 0 && "preco_venda" in produtos[0];
  const tabela = new Map(produtos.filter((p) => p.preco_venda).map((p) => [p.id, Number(p.preco_venda)]));
  const pelaTabela = (l: (typeof linhas)[number]) => {
    const preco = l.produto_id ? tabela.get(l.produto_id) : undefined;
    return preco === undefined ? null : Math.round(l.quantidade * preco * 100);
  };
  const comparaveis = linhas.filter((l) => pelaTabela(l) !== null && l.venda !== null);
  const totalTabela = comparaveis.reduce((a, l) => a + pelaTabela(l)!, 0);
  const totalCobrado = comparaveis.reduce((a, l) => a + l.venda!, 0);
  const comFichaETabela = comparaveis.filter((l) => l.cmv !== null);
  const tabelaComFicha = comFichaETabela.reduce((a, l) => a + pelaTabela(l)!, 0);
  const pTabela = parte(comFichaETabela.reduce((a, l) => a + l.cmv!, 0), tabelaComFicha);

  return (
    <div className="space-y-6">
      <Cartao>
        <CabecalhoCartao titulo={`CMV de ${rotuloMes(aberta.mes)}`}>
          {fechado ? (
            <BotaoAcao
              acao={reabrirCmvMes.bind(null, aberta.id)}
              pergunta={`Reabrir o CMV de ${rotuloMes(aberta.mes)}? O teórico volta a usar o custo atual dos insumos até você fechar de novo.`}
              aviso="Mês reaberto"
              className={classeBotao("secundario", true)}
            >
              Reabrir o mês
            </BotaoAcao>
          ) : (
            <>
              <BotaoAcao
                acao={apagarVendas.bind(null, aberta.id)}
                pergunta={`Apagar as vendas de ${rotuloMes(aberta.mes)}? Os produtos e as fichas continuam.`}
                aviso="Vendas apagadas"
                className={classeBotao("perigo", true)}
              >
                Apagar vendas
              </BotaoAcao>
              {temComplementos && (
                <EditorComplementos
                  vendaId={aberta.id}
                  mes={rotuloMes(aberta.mes)}
                  atuais={complementos.map((l) => ({ nome: l.nome_origem, quantidade: l.quantidade, valor: l.valor }))}
                  sugestoes={produtos.filter((p) => p.categoria === "Complementos").map((p) => p.nome)}
                />
              )}
              {podeFechar && (
                <BotaoAcao
                  acao={fecharCmvMes.bind(null, aberta.id)}
                  pergunta={`Fechar o CMV de ${rotuloMes(aberta.mes)}? O custo de cada ficha fica gravado como está hoje, e mudar o custo de um insumo depois não mexe mais neste mês.`}
                  aviso="CMV do mês fechado"
                  className={classeBotao("secundario", true)}
                >
                  Fechar o mês
                </BotaoAcao>
              )}
            </>
          )}
          <ImportarVendas empresaId={empresa.id} produtosComFicha={comFicha} />
        </CabecalhoCartao>
        {vendas.length > 1 && (
          <nav aria-label="Meses com vendas" className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
            {vendas.map((v) => (
              <Link
                key={v.id}
                href={`?aba=cmv&mes=${v.mes.slice(0, 7)}`}
                aria-current={v.id === aberta.id ? "page" : undefined}
                className={cx(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  v.id === aberta.id ? "bg-marca-50 text-marca-700 ring-1 ring-marca-100" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {rotuloMes(v.mes)}
              </Link>
            ))}
          </nav>
        )}
        <dl className="grid grid-cols-2 gap-4 px-5 py-4 lg:grid-cols-4">
          <Numero
            rotulo="Vendas no PDV"
            valor={moeda(teorico.venda)}
            nota={`${linhas.length - complementos.length} produtos${complementos.length ? ` · ${moeda(vendaComplementos)} de complementos` : ""}`}
          />
          <Numero
            rotulo="CMV teórico"
            valor={moeda(teorico.cmv)}
            nota={
              pTeorico === null
                ? "sem fichas"
                : `${pct.format(pTeorico)} das vendas com ficha${pTabela === null ? "" : ` · ${pct.format(pTabela)} pelo preço de venda`}`
            }
          />
          <Numero
            rotulo="CMV real"
            valor={realMes.variacao === null ? "—" : moeda(realMes.cmv)}
            nota={realMes.variacao === null ? "faltam contagens fechadas" : pReal === null ? "" : `${pct.format(pReal)} das vendas`}
          />
          <Numero
            rotulo="Diferença"
            valor={pReal === null || pTeorico === null ? "—" : `${pReal - pTeorico >= 0 ? "+" : "−"}${pct.format(Math.abs(pReal - pTeorico)).replace("%", " p.p.")}`}
            nota={pReal === null || pTeorico === null ? "" : "real menos teórico"}
            destaque={pReal !== null && pTeorico !== null && pReal - pTeorico > 0}
          />
        </dl>
        <div className="space-y-2 border-t border-slate-100 px-5 py-3 text-sm">
          {aberta.arquivo_nome && (
            <p className="text-xs text-slate-500">
              Arquivo {aberta.arquivo_nome}, importado em {dataBR(aberta.criado_em.slice(0, 10))}.
            </p>
          )}
          {podeFechar && (
            <p className="text-xs text-slate-500">
              {fechado ? (
                <>
                  <Etiqueta tom="cinza">fechado</Etiqueta> CMV teórico com os custos de {dataBR(aberta.fechado_em!.slice(0, 10))}, quando o mês foi
                  fechado. Mudar o custo de um insumo não mexe mais neste mês.
                </>
              ) : (
                <>
                  <Etiqueta tom="ambar">aberto</Etiqueta> CMV teórico com o custo atual dos insumos: muda sempre que um custo muda. Feche o mês
                  quando os custos estiverem certos para ele.
                </>
              )}
            </p>
          )}
          {temComplementos && !fechado && complementos.length === 0 && (
            <p className="text-xs text-slate-500">
              Adicionais cobrados à parte (leite de aveia, sem lactose, chantilly...) não vêm no relatório do PDV. Lance em “Lançar
              complementos” para entrarem no teórico.
            </p>
          )}
          {comparaveis.length > 0 && totalTabela !== totalCobrado && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
              Pelo preço de venda, {comparaveis.length === 1 ? "o produto com preço teria" : `os ${comparaveis.length} produtos com preço teriam`}{" "}
              vendido {moeda(totalTabela)}; o PDV registrou {moeda(totalCobrado)}:{" "}
              <strong>
                {moeda(Math.abs(totalTabela - totalCobrado))} {totalCobrado < totalTabela ? "abaixo" : "acima"} da tabela
              </strong>
              . Na tabela “Por produto”, o preço médio mostra em quais.
            </p>
          )}
          {comPreco && tabela.size === 0 && (
            <p className="text-xs text-slate-500">
              Informe o preço de venda de cada produto na{" "}
              <Link href="?aba=fichas" className="font-medium underline">
                aba Fichas técnicas
              </Link>{" "}
              para comparar o que o PDV cobrou com o cardápio.
            </p>
          )}
          {teorico.semFicha.produtos > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              {teorico.semFicha.produtos} {teorico.semFicha.produtos === 1 ? "produto vendido está" : "produtos vendidos estão"} sem ficha
              {teorico.semFicha.venda > 0 && <> ({moeda(teorico.semFicha.venda)} em vendas)</>}. O teórico cobre{" "}
              {cobertura === null ? "parte" : pct.format(cobertura)} das vendas; a comparação em % só fica justa com todas as fichas.{" "}
              <Link href="?aba=fichas" className="font-medium underline">
                Montar fichas
              </Link>
            </p>
          )}
          {teorico.comInsumoSemCusto > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              {teorico.comInsumoSemCusto} {teorico.comInsumoSemCusto === 1 ? "ficha usa" : "fichas usam"} insumo sem custo: o teórico fica abaixo do
              certo até informar o custo na{" "}
              <Link href="?aba=insumos" className="font-medium underline">
                aba Insumos
              </Link>
              {fechado && " (e reabrir e fechar o mês de novo)"}.
            </p>
          )}
          {realMes.variacao === null ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
              Para o CMV real faltam as contagens fechadas de{" "}
              {realMes.motivo && "faltam" in realMes.motivo && realMes.motivo.faltam.length
                ? realMes.motivo.faltam.map(dataBR).join(" e ")
                : "início e fim do mês"}
              . Compras do mês na DRE (linha 5): {moeda(realMes.compras)}.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              CMV real = compras do mês na DRE ({moeda(realMes.compras)}) − variação do estoque ({moeda(realMes.variacao)}).
            </p>
          )}
        </div>
      </Cartao>

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo="Por produto" contagem={linhas.length} />
        <table className={t.tabela}>
          <thead className={t.cabeca}>
            <tr>
              <th className={t.th}>Produto</th>
              <th className={`${t.th} text-right`}>Qtd.</th>
              <th className={`${t.th} hidden text-right sm:table-cell`}>Vendas</th>
              <th className={`${t.th} hidden text-right md:table-cell`}>Custo unit.</th>
              <th className={`${t.th} hidden text-right md:table-cell`} title="Total vendido ÷ quantidade: o que o caixa cobrou em média, já com descontos">
                Preço médio
              </th>
              <th className={`${t.th} text-right`}>CMV teórico</th>
              <th className={`${t.th} text-right`}>% da venda</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const p = l.cmv === null || l.venda === null ? null : parte(l.cmv, l.venda);
              return (
                <tr key={`${l.nome}-${i}`} className={t.linha}>
                  <td className="px-5 py-2">
                    {l.nome}
                    {l.complemento && (
                      <Etiqueta className="ml-2" tom="cinza">
                        complemento
                      </Etiqueta>
                    )}
                    {l.custoUnitario === null ? (
                      <Etiqueta className="ml-2" tom="ambar">
                        sem ficha
                      </Etiqueta>
                    ) : (
                      l.semCusto > 0 && (
                        <Etiqueta className="ml-2" tom="ambar">
                          insumo sem custo
                        </Etiqueta>
                      )
                    )}
                    {l.categoria && <span className="block text-xs text-slate-500">{l.categoria}</span>}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">{qtd.format(l.quantidade)}</td>
                  <td className="hidden whitespace-nowrap px-5 py-2 text-right tabular-nums sm:table-cell">{l.venda === null ? "—" : moeda(l.venda)}</td>
                  <td className="hidden whitespace-nowrap px-5 py-2 text-right tabular-nums md:table-cell">
                    {l.custoUnitario === null ? "—" : real.format(l.custoUnitario)}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-2 text-right tabular-nums md:table-cell">
                    {(() => {
                      if (l.venda === null || l.quantidade <= 0) return "—";
                      const medio = l.venda / 100 / l.quantidade;
                      const preco = l.produto_id ? tabela.get(l.produto_id) : undefined;
                      const desvio = preco ? (medio - preco) / preco : null;
                      return (
                        <>
                          {real.format(medio)}
                          {desvio !== null && Math.abs(desvio) > 0.01 && (
                            <span className={cx("block text-xs", desvio < 0 ? "text-amber-700" : "text-slate-500")}>
                              {desvio > 0 ? "+" : "−"}
                              {pct.format(Math.abs(desvio))} da tabela ({real.format(preco!)})
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">{l.cmv === null ? "—" : moeda(l.cmv)}</td>
                  <td className={cx("whitespace-nowrap px-5 py-2 text-right tabular-nums", p !== null && p > 1 && "text-red-700")}>
                    {p === null ? "—" : pct.format(p)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Cartao>
      <Explicacao />
    </div>
  );
}

function Numero({ rotulo, valor, nota, destaque }: { rotulo: string; valor: string; nota: string; destaque?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className={cx("text-lg font-semibold tabular-nums", destaque ? "text-amber-700" : "text-slate-900")}>{valor}</dd>
      {nota && <dd className="text-xs text-slate-500">{nota}</dd>}
    </div>
  );
}

function Explicacao() {
  return (
    <p className="text-xs text-slate-500">
      CMV teórico: para cada produto vendido, quantidade × custo da ficha técnica, com o custo atual dos insumos enquanto o mês
      está aberto e com o custo gravado no fechamento depois que o mês é fechado. CMV real:
      compras do mês (linha 5 da DRE, por competência) + estoque inicial − estoque final, pelas contagens fechadas. Real acima do
      teórico aponta perda, desperdício, porção maior que a ficha, consumo interno ou compra lançada no mês errado. Os percentuais
      são sobre o total vendido no relatório do PDV; “pelo preço de venda” refaz a conta com o preço do cardápio de cada produto
      (só os que têm preço). Complementos são os adicionais cobrados à parte, lançados à mão a cada mês, com a dose média na ficha de
      cada um.
    </p>
  );
}
