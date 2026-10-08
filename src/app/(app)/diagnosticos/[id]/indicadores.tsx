import { BotaoExcluir } from "@/components/controles";
import { CamposIndicador } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Vazio, classeBotao, classeTabela as t } from "@/components/ui";
import { formatarValor } from "@/lib/datas";
import { agruparPorCategoria, type DiagnosticoCompleto } from "@/lib/consultas";
import { excluirIndicador, salvarIndicador } from "@/server/analise";

export function AbaIndicadores({ d }: { d: DiagnosticoCompleto }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Registre aqui o resultado dos cálculos feitos na planilha de trabalho e a leitura da equipe sobre cada número.
        </p>
        <PainelLateral
          titulo="Novo indicador"
          gatilho="+ Indicador"
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
        <Cartao key={categoria} className="overflow-x-auto">
          <CabecalhoCartao titulo={categoria} />
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={`${t.th} w-72`}>Indicador</th>
                <th className={`${t.th} w-40 text-right`}>Valor</th>
                <th className={`${t.th} w-36`}>Referência</th>
                <th className={t.th}>Análise</th>
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
                    </td>
                    <td className={`${t.td} text-right tabular-nums`}>
                      {valor ? (
                        <span className="font-semibold text-slate-900">{valor}</span>
                      ) : (
                        <span className="text-slate-400">a preencher</span>
                      )}
                    </td>
                    <td className={`${t.td} text-slate-600`}>{i.referencia ?? "—"}</td>
                    <td className={`${t.td} max-w-md text-slate-600`}>
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
