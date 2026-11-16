import { CookingPot } from "lucide-react";
import { BotaoAcao } from "@/components/controles";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, cx, classeTabela as t } from "@/components/ui";
import { carregarItensEstoque, carregarProdutos, carregarVendas } from "@/lib/financeiro/consultas";
import { custoFicha } from "@/lib/financeiro/estoque";
import { mudarAtivacaoProduto } from "@/server/estoque";
import { EditorFicha } from "./editor-ficha";
import { ImportarFichas } from "./importar-estoque";

const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

// Fichas técnicas (0019): o que vai em cada produto vendido, com o custo pelos insumos e a margem pelo preço médio de venda.
export async function AbaFichas({ empresa }: { empresa: { id: string } }) {
  const [produtos, itens, vendas] = await Promise.all([carregarProdutos(empresa.id), carregarItensEstoque(empresa.id), carregarVendas(empresa.id)]);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const ultimo = vendas[0];
  // Preço médio do último mês importado: total vendido ÷ quantidade.
  const precos = new Map<string, number>();
  for (const l of ultimo?.linhas ?? []) if (l.produto_id && l.valor !== null && l.quantidade > 0) precos.set(l.produto_id, l.valor / l.quantidade);

  const linhas = produtos
    .map((p) => {
      const { custo, semCusto } = custoFicha(p.ficha, porId);
      const preco = precos.get(p.id) ?? null;
      const margem = p.ficha.length && preco ? (preco - custo) / preco : null;
      return { ...p, custo, semCusto, preco, margem };
    })
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || Number(a.ficha.length > 0) - Number(b.ficha.length > 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  const semFicha = linhas.filter((p) => p.ativo && !p.ficha.length).length;
  // Em ordem alfabética na lista do editor (a aba Insumos ordena por categoria).
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
            <table className={t.tabela}>
              <thead className={t.cabeca}>
                <tr>
                  <th className={t.th}>Produto</th>
                  <th className={`${t.th} hidden text-right sm:table-cell`}>Insumos</th>
                  <th className={`${t.th} text-right`}>Custo</th>
                  <th className={`${t.th} hidden text-right md:table-cell`}>
                    Preço médio{ultimo && <span className="block font-normal text-slate-400">{rotuloMes(ultimo.mes)}</span>}
                  </th>
                  <th className={`${t.th} text-right`}>Margem</th>
                  <th className={t.th}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => (
                  <tr key={p.id} className={cx(t.linha, !p.ativo && "text-slate-400")}>
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
                    <td className="hidden whitespace-nowrap px-5 py-2 text-right tabular-nums md:table-cell">{p.preco === null ? "—" : real.format(p.preco)}</td>
                    <td className={cx("whitespace-nowrap px-5 py-2 text-right tabular-nums", p.margem !== null && p.margem < 0 && "text-red-700")}>
                      {p.margem === null ? "—" : pct.format(p.margem)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2 text-right">
                      <EditorFicha produto={{ id: p.id, nome: p.nome }} ficha={p.ficha} insumos={insumos} />
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
        O custo da ficha usa o custo atual de cada insumo (aba Insumos). A margem é sobre o preço médio do último mês de vendas
        importado (total vendido ÷ quantidade), então já reflete descontos. Margem negativa (custo maior que o preço) aparece em vermelho. Produto
        fora de linha continua nos meses em que foi vendido.
      </p>
    </div>
  );
}
