import { Trash2 } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, cx, classeTabela as t } from "@/components/ui";
import { hoje } from "@/lib/datas";
import { carregarItensEstoque, carregarPerdas } from "@/lib/financeiro/consultas";
import { ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import { resumoPerdas, rotuloMotivo, valorPerda } from "@/lib/financeiro/perdas";
import { apagarPerda } from "@/server/estoque";
import { FormPerda } from "./form-perda";

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

function mesesAte(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7));
}

// Perdas de estoque (0027): anotadas no dia a dia e valorizadas pelo custo do insumo naquele momento.
export async function AbaPerdas({ empresa, mes }: { empresa: { id: string }; mes?: string }) {
  const dia = hoje();
  const atual = mes && /^\d{4}-\d{2}$/.test(mes) && mes <= dia.slice(0, 7) ? mes : dia.slice(0, 7);
  const inicio = `${atual}-01`;
  const [perdas, insumos] = await Promise.all([carregarPerdas(empresa.id, inicio, ultimoDiaDoMes(inicio)), carregarItensEstoque(empresa.id)]);
  if (perdas === null) {
    return (
      <Cartao>
        <Vazio icone={<Trash2 />}>As perdas aparecem aqui depois que a atualização 0027 do banco for aplicada.</Vazio>
      </Cartao>
    );
  }
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const resumo = resumoPerdas(perdas);
  const ativos = insumos.filter((i) => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="space-y-6">
      <Cartao>
        <CabecalhoCartao titulo="Anotar perda" />
        <FormPerda empresaId={empresa.id} hoje={dia} insumos={ativos.map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidade }))} />
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Anote o que foi jogado fora ou dado (vencido, quebrado, preparo errado, cortesia), na unidade em que o insumo é contado. A perda vale
          pelo custo do insumo no dia em que foi anotada. Ela não muda o CMV real, que já inclui tudo o que saiu do estoque; no CMV do mês ela
          mostra quanto da diferença entre o real e o teórico tem explicação.
        </p>
      </Cartao>

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo={`Perdas de ${rotuloMes(atual)}`} contagem={perdas.length} />
        <nav className="flex flex-wrap gap-1 border-b border-slate-100 px-5 py-2.5">
          {mesesAte(dia.slice(0, 7), 6).map((m) => (
            <Link
              key={m}
              href={`?aba=perdas&mes=${m}`}
              className={cx("rounded-full px-3 py-1 text-xs font-medium", m === atual ? "bg-marca-50 text-marca-700 ring-1 ring-marca-100" : "text-slate-500 hover:bg-slate-100")}
            >
              {rotuloMes(m)}
            </Link>
          ))}
        </nav>
        {perdas.length === 0 ? (
          <Vazio icone={<Trash2 />}>Nenhuma perda anotada neste mês.</Vazio>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
              <span className="font-semibold text-slate-900">{moeda(resumo.total)}</span>
              {resumo.porMotivo.map((m) => (
                <Etiqueta key={m.motivo}>
                  {m.rotulo} {moeda(m.valor)}
                </Etiqueta>
              ))}
              {resumo.semCusto > 0 && <Etiqueta tom="ambar">{resumo.semCusto} sem custo no insumo</Etiqueta>}
            </div>
            <table className={t.tabela}>
              <thead className={t.cabeca}>
                <tr>
                  <th className={t.th}>Data</th>
                  <th className={t.th}>Insumo</th>
                  <th className={`${t.th} text-right`}>Quant.</th>
                  <th className={`${t.th} hidden sm:table-cell`}>Motivo</th>
                  <th className={`${t.th} text-right`}>Valor</th>
                  <th className={`${t.th} w-10`} />
                </tr>
              </thead>
              <tbody>
                {perdas.map((p) => {
                  const i = porId.get(p.item_id);
                  return (
                    <tr key={p.id} className={t.linha}>
                      <td className="px-5 py-2 tabular-nums text-slate-600">{dataBR(p.data)}</td>
                      <td className="px-5 py-2">
                        {i?.nome ?? "—"}
                        <span className="block text-xs text-slate-500 sm:hidden">
                          {rotuloMotivo(p.motivo)}
                          {p.observacao && ` · ${p.observacao}`}
                        </span>
                        {p.observacao && <span className="hidden text-xs text-slate-500 sm:block">{p.observacao}</span>}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {qtd.format(p.quantidade)} {i?.unidade}
                      </td>
                      <td className="hidden px-5 py-2 sm:table-cell">{rotuloMotivo(p.motivo)}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{p.custo_unitario === null ? "sem custo" : moeda(valorPerda(p))}</td>
                      <td className="px-3 py-2 text-right">
                        <BotaoAcao
                          acao={apagarPerda.bind(null, p.id)}
                          pergunta={`Apagar a perda de ${qtd.format(p.quantidade)} ${i?.unidade ?? ""} de ${i?.nome ?? "insumo"}?`}
                          aviso="Perda apagada"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="size-4" aria-label="Apagar" />
                        </BotaoAcao>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Cartao>
    </div>
  );
}
