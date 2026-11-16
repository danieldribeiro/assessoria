import { Boxes, ClipboardList } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { Formulario } from "@/components/formulario";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, classeInput, cx, classeTabela as t } from "@/components/ui";
import { carregarContagens, carregarItensEstoque } from "@/lib/financeiro/consultas";
import { MEDIDAS_CONTEUDO, linhaComCusto, medidaPadronizada, resumoContagem, valorLinha } from "@/lib/financeiro/estoque";
import { paraCampoBR } from "@/lib/numeros";
import { apagarContagem, fecharContagem, reabrirContagem, salvarCustos } from "@/server/estoque";
import { ImportarContagem, ImportarCustos } from "./importar-estoque";

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const custo = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Regra() {
  return (
    <p className="text-xs text-slate-500">
      O CMV do mês na DRE é: compras do mês + estoque inicial − estoque final. Para isso o mês precisa de duas contagens
      fechadas: a do último dia do mês anterior (estoque inicial) e a do último dia do mês (estoque final). Fechar a
      contagem congela o custo de cada item; mudar um custo depois não altera meses já fechados.
    </p>
  );
}

// Contagens de estoque (0018): importadas de planilha em rascunho, conferidas e fechadas.
export async function AbaContagens({ empresa, contagemId }: { empresa: { id: string }; contagemId: string | null }) {
  const [contagens, itens] = await Promise.all([carregarContagens(empresa.id), carregarItensEstoque(empresa.id)]);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const comValores = contagens.map((c) => {
    const linhas = c.linhas.map((l) => linhaComCusto(l, c.situacao, porId));
    return { ...c, linhas, resumo: resumoContagem(linhas) };
  });
  const aberta = comValores.find((c) => c.id === contagemId) ?? null;
  const nomes = itens.map((i) => i.nome);

  return (
    <div className="space-y-6">
      {aberta && <DetalheContagem contagem={aberta} />}

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo="Contagens de estoque" contagem={contagens.length}>
          <ImportarContagem empresaId={empresa.id} insumos={nomes} />
        </CabecalhoCartao>
        {comValores.length === 0 ? (
          <Vazio icone={<ClipboardList />}>
            Nenhuma contagem ainda. Importe a planilha da contagem (do Omnia ou outra com as colunas Produto e Qtd Contada).
            Os itens viram insumos; depois informe o custo de cada um na aba Insumos e feche a contagem.
          </Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Data</th>
                <th className={t.th}>Situação</th>
                <th className={`${t.th} hidden text-right sm:table-cell`}>Itens</th>
                <th className={`${t.th} text-right`}>Valor em estoque</th>
                <th className={t.th}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {comValores.map((c) => (
                <tr key={c.id} className={cx(t.linha, c.id === aberta?.id && "bg-marca-50/40")}>
                  <td className={`${t.td} font-medium tabular-nums text-slate-900`}>
                    {dataBR(c.data)}
                    {c.arquivo_nome && <span className="block text-xs font-normal text-slate-500">{c.arquivo_nome}</span>}
                  </td>
                  <td className={t.td}>
                    <Situacao contagem={c} />
                  </td>
                  <td className={`${t.td} hidden text-right tabular-nums sm:table-cell`}>{c.resumo.itens}</td>
                  <td className={`${t.td} text-right tabular-nums`}>{moeda(c.resumo.centavos)}</td>
                  <td className={`${t.td} text-right`}>
                    <Link href={`?aba=contagens&contagem=${c.id}`} className="rounded-md px-2.5 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      <Regra />
    </div>
  );
}

type ContagemComValores = Awaited<ReturnType<typeof carregarContagens>>[number] & { resumo: ReturnType<typeof resumoContagem> };

function Situacao({ contagem: c }: { contagem: ContagemComValores }) {
  if (c.situacao === "fechada") return <Etiqueta tom="verde">fechada</Etiqueta>;
  return (
    <span className="flex flex-wrap gap-1">
      <Etiqueta tom="cinza">rascunho</Etiqueta>
      {c.resumo.semCusto > 0 && <Etiqueta tom="ambar">{plural(c.resumo.semCusto, "item sem custo", "itens sem custo")}</Etiqueta>}
    </span>
  );
}

function DetalheContagem({ contagem: c }: { contagem: ContagemComValores }) {
  const fechada = c.situacao === "fechada";
  return (
    <Cartao className="overflow-x-auto">
      <CabecalhoCartao titulo={`Contagem de ${dataBR(c.data)}`}>
        {fechada ? (
          <BotaoAcao
            acao={reabrirContagem.bind(null, c.id)}
            pergunta="Reabrir esta contagem? Ela deixa de contar na DRE até ser fechada de novo, e os custos voltam a vir dos insumos."
            aviso="Contagem reaberta"
            className={classeBotao("secundario", true)}
          >
            Reabrir
          </BotaoAcao>
        ) : (
          <>
            <BotaoAcao
              acao={apagarContagem.bind(null, c.id)}
              pergunta={`Apagar a contagem de ${dataBR(c.data)}? Os insumos cadastrados continuam.`}
              aviso="Contagem apagada"
              className={classeBotao("perigo", true)}
            >
              Apagar
            </BotaoAcao>
            <BotaoAcao
              acao={fecharContagem.bind(null, c.id)}
              pergunta={`Fechar a contagem de ${dataBR(c.data)}? O custo de cada item fica congelado e a contagem passa a valer na DRE.`}
              aviso="Contagem fechada"
              className={classeBotao("primario", true)}
            >
              Fechar contagem
            </BotaoAcao>
          </>
        )}
      </CabecalhoCartao>
      <dl className="grid grid-cols-2 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-4">
        {[
          ["Valor em estoque", moeda(c.resumo.centavos)],
          ["Itens contados", String(c.resumo.itens)],
          ["Sem custo", String(c.resumo.semCusto)],
          ["Fora do CMV", String(c.resumo.fora)],
        ].map(([r, v]) => (
          <div key={r}>
            <dt className="text-xs text-slate-500">{r}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      {!fechada && c.resumo.semCusto > 0 && (
        <p className="border-b border-slate-100 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
          Para fechar, informe o custo dos itens marcados na{" "}
          <Link href="?aba=insumos" className="font-medium underline">
            aba Insumos
          </Link>{" "}
          ou marque-os como fora do CMV. Item com quantidade zero não precisa de custo.
        </p>
      )}
      <table className={t.tabela}>
        <thead className={t.cabeca}>
          <tr>
            <th className={t.th}>Item</th>
            <th className={`${t.th} text-right`}>Quantidade</th>
            <th className={`${t.th} hidden text-right sm:table-cell`}>Custo</th>
            <th className={`${t.th} text-right`}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {c.linhas.map((l) => (
            <tr key={l.id} className={cx(t.linha, l.fora_do_cmv && "text-slate-400")}>
              <td className="px-5 py-2">
                {l.nome_origem}
                {l.fora_do_cmv ? (
                  <Etiqueta className="ml-2" tom="cinza">
                    fora do CMV
                  </Etiqueta>
                ) : (
                  l.custo_unitario === null &&
                  l.quantidade > 0 && (
                    <Etiqueta className="ml-2" tom="ambar">
                      sem custo
                    </Etiqueta>
                  )
                )}
                {l.categoria_origem && <span className="block text-xs text-slate-500">{l.categoria_origem}</span>}
              </td>
              <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">
                {qtd.format(l.quantidade)} {l.unidade_origem ?? ""}
              </td>
              <td className="hidden whitespace-nowrap px-5 py-2 text-right tabular-nums sm:table-cell">
                {l.custo_unitario === null ? "—" : custo.format(l.custo_unitario)}
              </td>
              <td className="whitespace-nowrap px-5 py-2 text-right tabular-nums">{valorLinha(l) ? moeda(valorLinha(l)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Cartao>
  );
}

// Insumos (0018): custo por unidade contada (kg, pacote, unidade) e a marca "fora do CMV" (limpeza, por exemplo).
export async function AbaInsumos({ empresa }: { empresa: { id: string } }) {
  const itens = await carregarItensEstoque(empresa.id);
  const semCusto = itens.filter((i) => !i.fora_do_cmv && i.custo_unitario === null).length;
  // Conteúdo de 1 unidade (0021): só aparece depois da migração e só para insumo contado por unidade, pacote, caixa...
  const comConteudo = itens.length > 0 && "conteudo" in itens[0];
  return (
    <div className="space-y-6">
      <Cartao>
        <CabecalhoCartao titulo="Insumos" contagem={itens.length}>
          {itens.length > 0 && <ImportarCustos empresaId={empresa.id} insumos={itens.map((i) => i.nome)} />}
        </CabecalhoCartao>
        {itens.length === 0 ? (
          <Vazio icone={<Boxes />}>
            Os insumos aparecem aqui quando você importa a primeira contagem, na aba Contagens. Depois é só informar o
            custo de cada um, digitando ou importando uma planilha de custos.
          </Vazio>
        ) : (
          <>
            {semCusto > 0 && (
              <p className="border-b border-slate-100 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
                {plural(semCusto, "insumo ainda está sem custo", "insumos ainda estão sem custo")}.
              </p>
            )}
            <Formulario acao={salvarCustos.bind(null, empresa.id)} aviso="Custos salvos" rotuloSalvar="Salvar custos">
              <div className="-mx-5 -mt-5 overflow-x-auto">
                <table className={t.tabela}>
                  <thead className={t.cabeca}>
                    <tr>
                      <th className={t.th}>Insumo</th>
                      <th className={`${t.th} w-40`}>Custo por unidade</th>
                      {comConteudo && (
                        <th className={`${t.th} w-56`} title="Para a ficha técnica aceitar g ou ml em insumo contado por unidade">
                          Conteúdo de 1 unidade
                        </th>
                      )}
                      <th className={`${t.th} w-24 text-center`}>Fora do CMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.id} className={cx(t.linha, i.fora_do_cmv && "text-slate-400")}>
                        <td className="px-5 py-2">
                          {i.nome}
                          {i.categoria && <span className="block text-xs text-slate-500">{i.categoria}</span>}
                        </td>
                        <td className="px-5 py-2">
                          <label className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">R$</span>
                            <input
                              name={`custo_${i.id}`}
                              defaultValue={paraCampoBR(i.custo_unitario)}
                              inputMode="decimal"
                              placeholder="0,00"
                              aria-label={`Custo de ${i.nome} por ${i.unidade}`}
                              className={cx(classeInput, "w-24 px-2 py-1 text-right tabular-nums")}
                            />
                            <span className="whitespace-nowrap text-xs text-slate-500">/ {i.unidade}</span>
                          </label>
                        </td>
                        {comConteudo && (
                          <td className="px-5 py-2">
                            {medidaPadronizada(i.unidade) ? (
                              <span className="text-xs text-slate-400">já em {medidaPadronizada(i.unidade)}</span>
                            ) : (
                              <label className="flex items-center gap-1.5">
                                <span className="whitespace-nowrap text-xs text-slate-500">1 {i.unidade} =</span>
                                <input
                                  name={`conteudo_${i.id}`}
                                  defaultValue={paraCampoBR(i.conteudo)}
                                  inputMode="decimal"
                                  placeholder="—"
                                  aria-label={`Conteúdo de 1 ${i.unidade} de ${i.nome}`}
                                  className={cx(classeInput, "w-20 px-2 py-1 text-right tabular-nums")}
                                />
                                <select
                                  name={`medida_${i.id}`}
                                  defaultValue={i.conteudo_medida ?? "g"}
                                  aria-label={`Medida do conteúdo de ${i.nome}`}
                                  className={cx(classeInput, "w-16 px-2 py-1")}
                                >
                                  {MEDIDAS_CONTEUDO.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </td>
                        )}
                        <td className="px-5 py-2 text-center">
                          <input
                            type="checkbox"
                            name={`fora_${i.id}`}
                            defaultChecked={i.fora_do_cmv}
                            aria-label={`${i.nome} fora do CMV`}
                            className="size-4 rounded border-slate-300 text-marca-600"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Formulario>
          </>
        )}
      </Cartao>
      <p className="text-xs text-slate-500">
        O custo é por unidade contada: se o café é contado em kg, o custo é do kg. Marque como fora do CMV o que é
        contado mas não é custo da mercadoria vendida (material de limpeza, por exemplo): entra na contagem com valor zero.
        Mudar um custo atualiza as contagens em rascunho; as fechadas guardam o custo do dia em que foram fechadas. O conteúdo de 1
        unidade (ex.: 1 un de leite = 1 L) só serve para a ficha técnica aceitar g ou ml; não muda a contagem.
      </p>
      <Regra />
    </div>
  );
}
