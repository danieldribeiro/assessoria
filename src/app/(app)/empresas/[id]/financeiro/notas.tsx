import { ReceiptText } from "lucide-react";
import { BotaoAcao } from "@/components/controles";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, classeTabela as t } from "@/components/ui";
import { hoje } from "@/lib/datas";
import { carregarDePara, carregarItensEstoque, carregarNotas, carregarSaidasParaLigar, type NotaCompra } from "@/lib/financeiro/consultas";
import type { ContaCaixa, ContaPlano, Contraparte } from "@/lib/financeiro/dominio";
import { apagarNota } from "@/server/estoque";
import { ContextoNotas, EditorNotas, type NotaGravada } from "./editor-nota";

const real = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const custo4 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

function mesesAtras(iso: string, meses: number) {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - meses, 1));
  return d.toISOString().slice(0, 10);
}

const paraEditor = (n: NotaCompra): NotaGravada => ({
  ...n,
  informacoes: null,
  itens: n.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valor: i.valor, item_id: i.item_id, fator: i.fator })),
});

// Notas de compra (0026): NF-e e NFS-e com os itens ligados aos insumos. Delas sai o custo médio de cada insumo.
export async function AbaNotas({
  empresa,
  contas,
  caixas,
  contrapartes,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  contrapartes: Contraparte[];
}) {
  const dia = hoje();
  const notas = await carregarNotas(empresa.id, mesesAtras(dia, 6));
  if (notas === null) {
    return (
      <Cartao>
        <Vazio icone={<ReceiptText />}>As notas de compra aparecem aqui depois que a atualização 0026 do banco for aplicada.</Vazio>
      </Cartao>
    );
  }
  const [insumos, depara, saidas] = await Promise.all([carregarItensEstoque(empresa.id), carregarDePara(empresa.id), carregarSaidasParaLigar(empresa.id, mesesAtras(dia, 4))]);
  const ligadas = new Set(notas.flatMap((n) => n.lancamentos));
  const porInsumo = new Map(insumos.map((i) => [i.id, i]));
  const porNota = new Map(notas.map((n) => [n.id, n]));
  const servicos = new Map<string, NotaCompra[]>();
  for (const n of notas) if (n.nota_produto_id) servicos.set(n.nota_produto_id, [...(servicos.get(n.nota_produto_id) ?? []), n]);

  // Contas para a compra: as de despesa ativas; a padrão é a marcada como custo do CMV (ou a primeira da linha 5 da DRE).
  const analiticas = contas.filter((c) => c.tipo === "analitica" && c.ativa && c.natureza === "despesa").sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  const contaPadrao = (analiticas.find((c) => c.custo_cmv) ?? analiticas.find((c) => c.dre_secao === 5))?.id ?? "";
  const ctx = {
    empresaId: empresa.id,
    insumos: insumos.map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidade })),
    depara,
    contrapartes: contrapartes.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome, documento: c.documento })),
    contas: analiticas.map((c) => ({ valor: c.id, rotulo: `${c.codigo} ${c.nome}` })),
    contaPadrao,
    caixas: caixas.filter((c) => c.ativa).map((c) => ({ valor: c.id, rotulo: c.nome })),
    saidas: saidas.map((s) => ({ ...s, ligada: ligadas.has(s.id) })),
    notasProduto: notas
      .filter((n) => n.tipo === "produto")
      .map((n) => ({ id: n.id, numero: n.numero, emitente_nome: n.emitente_nome, emitente_documento: n.emitente_documento, entrada: n.entrada })),
  };

  // Os dados do editor vão uma vez só para o navegador (e não em cada botão Editar).
  return (
    <ContextoNotas valor={ctx}>
      <Cartao>
        <CabecalhoCartao titulo="Notas de compra" contagem={notas.length}>
          <EditorNotas modo={{ tipo: "manual" }} />
          <EditorNotas modo={{ tipo: "xml" }} />
        </CabecalhoCartao>
        <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
          Cada item da nota fica ligado a um insumo. O custo do item é o valor dele mais a parte do frete e da nota de serviço (NFS-e) ligada, na
          proporção do valor. O custo do insumo vira o <strong>custo médio</strong>: a última contagem fechada mais as compras com entrada depois dela.
          As compras da DRE continuam vindo dos lançamentos; aqui você cria as contas a pagar da nota ou liga a nota às que já existem.
        </p>
        {notas.length === 0 ? (
          <Vazio icone={<ReceiptText />}>
            Nenhuma nota nos últimos 6 meses. Importe o XML da NF-e (e da NFS-e, quando houver) ou lance a nota à mão.
          </Vazio>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notas.map((n) => {
              const semInsumo = n.itens.filter((i) => !i.item_id).length;
              const servico = (servicos.get(n.id) ?? []).reduce((s, x) => s + x.valor_total, 0);
              const ref = n.nota_produto_id ? porNota.get(n.nota_produto_id) : null;
              return (
                <li key={n.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50/70">
                      <span className="w-20 text-slate-500 tabular-nums">{dataBR(n.entrada)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-900">
                          {n.tipo === "servico" ? "NFS" : "NF"} {n.numero ?? "s/n"}
                        </span>
                        <span className="ml-2 text-slate-600">{n.emitente_nome}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {n.tipo === "servico" ? (
                          ref ? (
                            <Etiqueta tom="cinza">serviço da NF {ref.numero ?? "s/n"}</Etiqueta>
                          ) : (
                            <Etiqueta tom="ambar">sem NF-e ligada</Etiqueta>
                          )
                        ) : (
                          <>
                            <Etiqueta tom="cinza">{n.itens.length} {n.itens.length === 1 ? "item" : "itens"}</Etiqueta>
                            {servico > 0 && <Etiqueta tom="cinza">+ serviço {real(servico)}</Etiqueta>}
                            {semInsumo > 0 && <Etiqueta tom="cinza">{semInsumo} fora do estoque</Etiqueta>}
                          </>
                        )}
                        {n.lancamentos.length === 0 ? <Etiqueta tom="ambar">sem pagamento</Etiqueta> : <Etiqueta tom="verde">{n.lancamentos.length === 1 ? "1 pagamento" : `${n.lancamentos.length} pagamentos`}</Etiqueta>}
                      </span>
                      <span className="w-28 text-right font-medium tabular-nums text-slate-900">{real(n.valor_total)}</span>
                    </summary>
                    <div className="space-y-3 bg-slate-50/50 px-5 pb-4 pt-1">
                      <p className="text-xs text-slate-500">
                        Emissão {dataBR(n.emissao)}
                        {n.chave && n.tipo === "produto" && <> · chave {n.chave}</>}
                        {n.remessa && <> · remessa {n.remessa}</>}
                        {n.valor_frete > 0 && <> · frete {real(n.valor_frete)}</>}
                        {n.origem === "xml" ? " · importada do XML" : " · lançada à mão"}
                        {n.observacoes && <> · {n.observacoes}</>}
                      </p>
                      {n.itens.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
                          <table className={t.tabela}>
                            <thead className={t.cabeca}>
                              <tr>
                                <th className={t.th}>Item da nota</th>
                                <th className={`${t.th} text-right`}>Quant.</th>
                                <th className={t.th}>Insumo</th>
                                <th className={`${t.th} text-right`}>Custo total</th>
                                <th className={`${t.th} text-right`}>Custo por unidade</th>
                              </tr>
                            </thead>
                            <tbody>
                              {n.itens.map((i) => {
                                const insumo = i.item_id ? porInsumo.get(i.item_id) : null;
                                const q = i.quantidade * i.fator;
                                return (
                                  <tr key={i.id} className={t.linha}>
                                    <td className="px-5 py-2">{i.descricao}</td>
                                    <td className="px-5 py-2 text-right tabular-nums">
                                      {qtd.format(i.quantidade)} {i.unidade}
                                    </td>
                                    <td className="px-5 py-2">
                                      {insumo ? (
                                        <>
                                          {insumo.nome}
                                          {i.fator !== 1 && <span className="block text-xs text-slate-500">{qtd.format(q)} {insumo.unidade}</span>}
                                        </>
                                      ) : (
                                        <span className="text-slate-400">não é insumo</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-2 text-right tabular-nums" title={`item ${real(i.valor)} + serviço ${real(i.servico)} + frete ${real(i.frete)}`}>
                                      {real(i.custo)}
                                    </td>
                                    <td className="px-5 py-2 text-right tabular-nums">{insumo && q > 0 ? `${custo4.format(i.custo / 100 / q)}/${insumo.unidade}` : "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <BotaoAcao
                          acao={apagarNota.bind(null, n.id)}
                          pergunta={`Apagar a ${n.tipo === "servico" ? "NFS" : "NF"} ${n.numero ?? ""} de ${n.emitente_nome}? Os lançamentos ligados continuam no financeiro; o custo médio dos insumos é refeito.`}
                          aviso="Nota apagada"
                          className={classeBotao("perigo", true)}
                        >
                          Apagar
                        </BotaoAcao>
                        <EditorNotas modo={{ tipo: "editar", nota: paraEditor(n) }} />
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </ContextoNotas>
  );
}
