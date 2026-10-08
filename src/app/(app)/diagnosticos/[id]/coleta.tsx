import { Plus } from "lucide-react";
import { BotaoAcao, BotaoExcluir, SeletorImediato } from "@/components/controles";
import { CamposSolicitacao } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Vazio, classeBotao, classeTabela as t } from "@/components/ui";
import { STATUS_SOLICITACAO } from "@/lib/dominio";
import { formatarData, hoje, somarDiasUteis } from "@/lib/datas";
import { agruparPorCategoria, filtrarPorResponsavel, resumoColeta } from "@/lib/consultas";
import { excluirSolicitacao, mudarStatusSolicitacao, salvarSolicitacao, solicitarPendentes } from "@/server/coleta";
import { definirEntregaAPartirDeHoje } from "@/server/diagnosticos";
import { BarraFiltro, DonoDaArea, ResponsavelDoItem, type PropsAba } from "./responsaveis";

export function AbaColeta({ d, de, usuarioId }: PropsAba) {
  const lista = filtrarPorResponsavel(d.solicitacoes, d.responsaveis_area, de);
  const { total, recebidos, faltam } = resumoColeta(lista);
  const pendentes = d.solicitacoes.filter((s) => s.status === "Pendente").length;
  const percentual = total ? Math.round((recebidos / total) * 100) : 0;
  const novaEntrega = somarDiasUteis(hoje(), 5);

  return (
    <div className="space-y-4">
      <BarraFiltro d={d} de={de} usuarioId={usuarioId} aba="coleta" itens={d.solicitacoes} />
      <Cartao className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 basis-64 flex-1">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium text-slate-900">
                {recebidos} de {total} itens recebidos
              </span>
              <span className="text-slate-500">{percentual}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentual}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendentes > 0 && (
              <BotaoAcao acao={solicitarPendentes.bind(null, d.id)} className={classeBotao("secundario")}>
                Marcar {pendentes} pendente{pendentes > 1 ? "s" : ""} como solicitado{pendentes > 1 ? "s" : ""}
              </BotaoAcao>
            )}
            <PainelLateral
              titulo="Nova solicitação"
              gatilho={
            <>
              <Plus />
              Novo item
            </>
          }
              classeGatilho={classeBotao("primario")}
              acao={salvarSolicitacao.bind(null, d.id, null)}
            >
              <CamposSolicitacao equipe={d.equipe} areas={d.responsaveis_area} />
            </PainelLateral>
          </div>
        </div>
        {total > 0 && faltam === 0 && d.data_prevista !== novaEntrega && d.status === "Coleta" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>
              Coleta completa. O prazo padrão é de 5 dias úteis a partir de agora: entrega em{" "}
              <strong>{formatarData(novaEntrega)}</strong>.
            </span>
            <BotaoAcao
              acao={definirEntregaAPartirDeHoje.bind(null, d.id)}
              className={classeBotao("secundario", true)}
            >
              Atualizar entrega prevista
            </BotaoAcao>
          </div>
        )}
      </Cartao>

      {lista.length === 0 && (
        <Cartao>
          <Vazio>
            {de
              ? "Nenhum item de coleta com este responsável."
              : "Nenhum item na lista de coleta. Use “Novo item” para pedir um documento ao cliente."}
          </Vazio>
        </Cartao>
      )}

      {agruparPorCategoria(lista).map(({ categoria, itens }) => {
        const r = resumoColeta(itens);
        return (
          <Cartao key={categoria} className="overflow-hidden">
            <CabecalhoCartao titulo={categoria}>
              <DonoDaArea d={d} categoria={categoria} />
              <span className="text-xs text-slate-500">
                {r.recebidos}/{r.total} recebidos
              </span>
            </CabecalhoCartao>
            <table className={t.tabela}>
              <thead className={t.cabeca}>
                <tr>
                  <th className={t.th}>Item</th>
                  <th className={`${t.th} w-12`}>
                    <span className="sr-only">Responsável</span>
                  </th>
                  <th className={`${t.th} w-40`}>Status</th>
                  <th className={`${t.th} hidden w-28 md:table-cell`}>Solicitado</th>
                  <th className={`${t.th} hidden w-28 md:table-cell`}>Recebido</th>
                  <th className={`${t.th} hidden w-16 sm:table-cell`}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((s) => (
                  <tr key={s.id} className={t.linha}>
                    <td className={t.td}>
                      <PainelLateral
                        titulo="Editar solicitação"
                        gatilho={s.item}
                        classeGatilho="text-left font-medium text-slate-900 hover:text-marca-700"
                        acao={salvarSolicitacao.bind(null, d.id, s.id)}
                        rodape={
                          <BotaoExcluir acao={excluirSolicitacao.bind(null, s.id)} pergunta={`Excluir “${s.item}”?`} />
                        }
                      >
                        <CamposSolicitacao solicitacao={s} equipe={d.equipe} areas={d.responsaveis_area} />
                      </PainelLateral>
                      {s.observacao && <div className="mt-0.5 text-xs text-slate-500">{s.observacao}</div>}
                      {(s.data_recebimento || s.data_solicitacao || s.link) && (
                        <div className="mt-0.5 flex gap-2 text-xs text-slate-500 md:hidden">
                          {s.data_recebimento
                            ? `Recebido em ${formatarData(s.data_recebimento)}`
                            : s.data_solicitacao && `Solicitado em ${formatarData(s.data_solicitacao)}`}
                          {s.link && (
                            <a href={s.link} target="_blank" rel="noreferrer" className="text-marca-700 sm:hidden">
                              Abrir ↗
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`${t.td} pr-0`}>
                      <ResponsavelDoItem d={d} item={s} />
                    </td>
                    <td className={t.td}>
                      <SeletorImediato
                        key={s.status}
                        etiqueta
                        rotulo="Status"
                        valor={s.status}
                        opcoes={STATUS_SOLICITACAO}
                        acao={mudarStatusSolicitacao.bind(null, s.id)}
                      />
                    </td>
                    <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{formatarData(s.data_solicitacao)}</td>
                    <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{formatarData(s.data_recebimento)}</td>
                    <td className={`${t.td} hidden sm:table-cell`}>
                      {s.link && (
                        <a href={s.link} target="_blank" rel="noreferrer" className="text-marca-700 hover:underline">
                          Abrir
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        );
      })}
    </div>
  );
}
