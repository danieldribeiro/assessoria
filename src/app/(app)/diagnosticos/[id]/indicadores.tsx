import { Plus } from "lucide-react";
import { BotaoExcluir } from "@/components/controles";
import { CamposIndicador } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Vazio, classeBotao, classeTabela as t } from "@/components/ui";
import { formatarValor } from "@/lib/datas";
import { agruparPorCategoria, type DiagnosticoCompleto } from "@/lib/consultas";
import { excluirIndicador, salvarIndicador } from "@/server/analise";

export function AbaIndicadores({ d }: { d: DiagnosticoCompleto }) {
  const faltam = d.indicadores.filter((i) => i.valor === null).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {faltam > 0 ? (
            <>
              <span className="font-medium text-slate-900">{faltam}</span> de {d.indicadores.length} indicadores a
              preencher.{" "}
            </>
          ) : null}
          Copie os valores da planilha de análise e registre a leitura da equipe sobre cada número.
        </p>
        <PainelLateral
          titulo="Novo indicador"
          gatilho={
            <>
              <Plus />
              Novo indicador
            </>
          }
          classeGatilho={classeBotao("primario")}
          acao={salvarIndicador.bind(null, d.id, null)}
        >
          <CamposIndicador />
        </PainelLateral>
      </div>

      {d.indicadores.length === 0 && (
        <Cartao>
          <Vazio>Nenhum indicador.</Vazio>
        </Cartao>
      )}

      {agruparPorCategoria(d.indicadores).map(({ categoria, itens }) => (
        <Cartao key={categoria} className="overflow-hidden">
          <CabecalhoCartao titulo={categoria} />
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={`${t.th} sm:w-72`}>Indicador</th>
                <th className={`${t.th} w-32 text-right sm:w-40`}>Valor</th>
                <th className={`${t.th} hidden w-36 sm:table-cell`}>Referência</th>
                <th className={`${t.th} hidden lg:table-cell`}>Análise</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const valor = formatarValor(i.valor, i.unidade);
                return (
                  <tr key={i.id} className={t.linha}>
                    <td className={t.td}>
                      <PainelLateral
                        titulo="Indicador"
                        gatilho={i.nome}
                        classeGatilho="text-left font-medium text-slate-900 hover:text-marca-700"
                        acao={salvarIndicador.bind(null, d.id, i.id)}
                        rodape={
                          <BotaoExcluir acao={excluirIndicador.bind(null, i.id)} pergunta={`Excluir “${i.nome}”?`} />
                        }
                      >
                        <CamposIndicador indicador={i} />
                      </PainelLateral>
                      {i.periodo && <div className="text-xs text-slate-500">{i.periodo}</div>}
                      {i.referencia && <div className="text-xs text-slate-500 sm:hidden">Referência {i.referencia}</div>}
                      {i.observacao && (
                        <div className="mt-1 line-clamp-2 text-xs text-slate-600 lg:hidden">{i.observacao}</div>
                      )}
                    </td>
                    <td className={`${t.td} text-right tabular-nums`}>
                      {valor ? (
                        <span className="font-semibold text-slate-900">{valor}</span>
                      ) : (
                        <span className="text-slate-400">a preencher</span>
                      )}
                    </td>
                    <td className={`${t.td} hidden text-slate-600 sm:table-cell`}>{i.referencia ?? "—"}</td>
                    <td className={`${t.td} hidden max-w-md text-slate-600 lg:table-cell`}>
                      <span className="line-clamp-2 whitespace-pre-wrap">{i.observacao ?? ""}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Cartao>
      ))}
    </div>
  );
}
