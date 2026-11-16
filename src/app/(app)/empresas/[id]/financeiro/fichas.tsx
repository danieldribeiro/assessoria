import { CookingPot } from "lucide-react";
import { BotaoAcao } from "@/components/controles";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, cx, classeTabela as t } from "@/components/ui";
import { carregarItensEstoque, carregarProdutos } from "@/lib/financeiro/consultas";
import { custoFicha, paraBusca } from "@/lib/financeiro/estoque";
import { mudarAtivacaoProduto } from "@/server/estoque";
import { EditorFicha } from "./editor-ficha";
import { FiltroLista } from "./filtro-lista";
import { ImportarFichas } from "./importar-estoque";

const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

// Fichas técnicas (0019): o cardápio. O que vai em cada produto, o custo pelos insumos, o preço de venda (0024) e a margem.
// O que o caixa de fato cobrou em cada mês fica na aba CMV do mês.
export async function AbaFichas({ empresa }: { empresa: { id: string } }) {
  const [produtos, itens] = await Promise.all([carregarProdutos(empresa.id), carregarItensEstoque(empresa.id)]);
  const porId = new Map(itens.map((i) => [i.id, i]));

  const linhas = produtos
    .map((p) => {
      const { custo, semCusto } = custoFicha(p.ficha, porId);
      const tabela = p.preco_venda ?? null; // preço de venda do cardápio (0024)
      const margem = p.ficha.length && tabela ? (tabela - custo) / tabela : null;
      return { ...p, custo, semCusto, tabela, margem };
    })
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || Number(a.ficha.length > 0) - Number(b.ficha.length > 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  const semFicha = linhas.filter((p) => p.ativo && !p.ficha.length).length;
  const semPreco = linhas.filter((p) => p.ativo && p.tabela === null).length;
  // Em ordem alfabética na lista do editor, como na aba Insumos.
  const insumos = itens
    .filter((i) => i.ativo !== false && !i.fora_do_cmv)
    .map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidade, custo: i.custo_unitario, conteudo: i.conteudo ?? null, conteudo_medida: i.conteudo_medida ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="space-y-6">
      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo="Fichas técnicas" contagem={produtos.length}>
          <ImportarFichas empresaId={empresa.id} insumos={itens.map((i) => i.nome)} />
        </CabecalhoCartao>
        {produtos.length === 0 ? (
          <Vazio icone={<CookingPot />}>
            Nenhum produto ainda. Os produtos aparecem quando você importa as vendas do PDV (aba CMV do mês) ou uma planilha
            de fichas. Depois é só montar a ficha de cada um: quanto de cada insumo vai em uma unidade vendida.
          </Vazio>
        ) : (
          <>
            {semFicha > 0 && (
              <p className="border-b border-slate-100 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
                {semFicha} {semFicha === 1 ? "produto ainda está sem ficha" : "produtos ainda estão sem ficha"}: eles ficam fora do CMV teórico.
              </p>
            )}
            {semPreco > 0 && (
              <p className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm text-slate-700">
                {semPreco} {semPreco === 1 ? "produto ainda está sem preço de venda" : "produtos ainda estão sem preço de venda"}: sem ele não há
                margem. Informe em Editar.
              </p>
            )}
            <FiltroLista
              alvo="lista-fichas"
              rotuloBusca="Buscar produto"
              categorias={[...new Set(produtos.map((p) => p.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "pt-BR"))}
              situacoes={[
                { valor: "sem-ficha", rotulo: "Sem ficha" },
                { valor: "sem-preco", rotulo: "Sem preço de venda" },
                { valor: "insumo-sem-custo", rotulo: "Insumo sem custo" },
                { valor: "margem-negativa", rotulo: "Margem negativa" },
                { valor: "ativo", rotulo: "Em linha" },
                { valor: "fora-de-linha", rotulo: "Fora de linha" },
              ]}
            />
            <table className={t.tabela}>
              <thead className={t.cabeca}>
                <tr>
                  <th className={t.th}>Produto</th>
                  <th className={`${t.th} hidden text-right sm:table-cell`}>Insumos</th>
                  <th className={`${t.th} text-right`}>Custo</th>
                  <th className={`${t.th} text-right`}>Preço de venda</th>
                  <th className={`${t.th} text-right`}>Margem</th>
                  <th className={t.th}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody id="lista-fichas">
                {linhas.map((p) => (
                  <tr
                    key={p.id}
                    className={cx(t.linha, !p.ativo && "text-slate-400")}
                    data-filtro=""
                    data-busca={paraBusca(`${p.nome} ${p.categoria ?? ""}`)}
                    data-categoria={p.categoria ?? ""}
                    data-situacoes={[
                      p.ativo ? "ativo" : "fora-de-linha",
                      !p.ficha.length && "sem-ficha",
                      p.tabela === null && "sem-preco",
                      p.ficha.length > 0 && p.semCusto > 0 && "insumo-sem-custo",
                      p.margem !== null && p.margem < 0 && "margem-negativa",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td className="px-5 py-2">
                      {p.nome}
                      {!p.ativo ? (
                        <Etiqueta className="ml-2" tom="cinza">
                          fora de linha
                        </Etiqueta>
                      ) : !p.ficha.length ? (
                        <Etiqueta className="ml-2" tom="ambar">
                          sem ficha
                        </Etiqueta>
                      ) : (
                        p.semCusto > 0 && (
                          <Etiqueta className="ml-2" tom="ambar" title="Algum insumo desta ficha está sem custo na aba Insumos">
                            insumo sem custo
                          </Etiqueta>
                        )
                      )}
                      {p.categoria && <span className="block text-xs text-slate-500">{p.categoria}</span>}
                    </td>
                    <td className="hidden px-5 py-2 text-right tabular-nums sm:table-cell">{p.ficha.length || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">{p.ficha.length ? real.format(p.custo) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">{p.tabela === null ? "—" : real.format(p.tabela)}</td>
                    <td className={cx("whitespace-nowrap px-5 py-2 text-right tabular-nums", p.margem !== null && p.margem < 0 && "text-red-700")}>
                      {p.margem === null ? "—" : pct.format(p.margem)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2 text-right">
                      <EditorFicha produto={{ id: p.id, nome: p.nome }} ficha={p.ficha} insumos={insumos} preco={"preco_venda" in p ? p.tabela : undefined} />
                      <BotaoAcao
                        acao={mudarAtivacaoProduto.bind(null, p.id, !p.ativo)}
                        aviso={p.ativo ? "Produto marcado como fora de linha" : "Produto reativado"}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                      >
                        {p.ativo ? "Tirar de linha" : "Reativar"}
                      </BotaoAcao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Cartao>
      <p className="text-xs text-slate-500">
        O custo da ficha usa o custo atual de cada insumo (aba Insumos). O preço de venda é o do cardápio, digitado em Editar, e
        a margem é sobre ele. Margem negativa (custo maior que o preço) aparece em vermelho. O que o caixa de fato cobrou em cada
        mês (preço médio, com descontos) está na aba CMV do mês. Produto fora de linha continua nos meses em que foi vendido.
      </p>
    </div>
  );
}
