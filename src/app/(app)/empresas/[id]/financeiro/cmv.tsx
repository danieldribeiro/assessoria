import { ChartPie } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import type { ContaPlano } from "@/lib/financeiro/dominio";
import { carregarCmvReal, carregarItensEstoque, carregarProdutos, carregarVendas } from "@/lib/financeiro/consultas";
import { cmvTeorico } from "@/lib/financeiro/estoque";
import { apagarVendas } from "@/server/estoque";
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
  const teorico = cmvTeorico(aberta.linhas, fichas, new Map(itens.map((i) => [i.id, i])));
  const realMes = await carregarCmvReal(empresa.id, contas, aberta.mes);
  const linhas = [...teorico.linhas].sort((a, b) => (b.venda ?? 0) - (a.venda ?? 0) || b.quantidade - a.quantidade);
  const pTeorico = parte(teorico.cmv, teorico.vendaComFicha);
  const pReal = realMes.variacao === null ? null : parte(realMes.cmv, teorico.venda);
  const cobertura = parte(teorico.vendaComFicha, teorico.venda);

  return (
    <div className="space-y-6">
      <Cartao>
        <CabecalhoCartao titulo={`CMV de ${rotuloMes(aberta.mes)}`}>
          <BotaoAcao
            acao={apagarVendas.bind(null, aberta.id)}
            pergunta={`Apagar as vendas de ${rotuloMes(aberta.mes)}? Os produtos e as fichas continuam.`}
            aviso="Vendas apagadas"
            className={classeBotao("perigo", true)}
          >
            Apagar vendas
          </BotaoAcao>
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
          <Numero rotulo="Vendas no PDV" valor={moeda(teorico.venda)} nota={`${linhas.length} produtos`} />
          <Numero
            rotulo="CMV teórico"
            valor={moeda(teorico.cmv)}
            nota={pTeorico === null ? "sem fichas" : `${pct.format(pTeorico)} das vendas com ficha`}
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
              .
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
      CMV teórico: para cada produto vendido, quantidade × custo da ficha técnica (com o custo atual dos insumos). CMV real:
      compras do mês (linha 5 da DRE, por competência) + estoque inicial − estoque final, pelas contagens fechadas. Real acima do
      teórico aponta perda, desperdício, porção maior que a ficha, consumo interno ou compra lançada no mês errado. Os percentuais
      são sobre o total vendido no relatório do PDV.
    </p>
  );
}
