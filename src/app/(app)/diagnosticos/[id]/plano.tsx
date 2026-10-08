import { Plus } from "lucide-react";
import { BotaoExcluir, SeletorImediato } from "@/components/controles";
import { EtiquetaPrioridade } from "@/components/etiquetas";
import { CamposAcao } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { Cartao, Vazio, classeBotao, classeTabela as t, cx } from "@/components/ui";
import { STATUS_ACAO } from "@/lib/dominio";
import { atrasada, formatarData } from "@/lib/datas";
import type { DiagnosticoCompleto } from "@/lib/consultas";
import { excluirAcao, mudarStatusAcao, salvarAcao } from "@/server/plano";

export function tituloRelacionado(
  d: Pick<DiagnosticoCompleto, "achados" | "oportunidades">,
  acao: { achado_id: string | null; oportunidade_id: string | null },
) {
  if (acao.achado_id) return d.achados.find((a) => a.id === acao.achado_id)?.titulo ?? null;
  if (acao.oportunidade_id) return d.oportunidades.find((o) => o.id === acao.oportunidade_id)?.titulo ?? null;
  return null;
}

export function AbaPlano({ d }: { d: DiagnosticoCompleto }) {
  const conta = (s: string) => d.acoes.filter((a) => a.status === s).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          {STATUS_ACAO.map((s) => (
            <span key={s}>
              {s} <span className="tabular-nums font-medium text-slate-900">{conta(s)}</span>
            </span>
          ))}
        </div>
        <PainelLateral
          titulo="Nova ação"
          gatilho={
            <>
              <Plus />
              Nova ação
            </>
          }
          classeGatilho={classeBotao("primario")}
          acao={salvarAcao.bind(null, d.id, null)}
        >
          <CamposAcao achados={d.achados} oportunidades={d.oportunidades} />
        </PainelLateral>
      </div>

      <Cartao className="overflow-hidden">
        {d.acoes.length === 0 ? (
          <Vazio>Nenhuma ação no plano ainda. Crie aqui ou pelo botão “+ Ação” de um achado ou oportunidade.</Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Ação</th>
                <th className={`${t.th} hidden md:table-cell`}>Responsável</th>
                <th className={`${t.th} hidden w-28 sm:table-cell`}>Prazo</th>
                <th className={`${t.th} hidden w-24 md:table-cell`}>Prioridade</th>
                <th className={`${t.th} w-36`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.acoes.map((a) => {
                const relacionado = tituloRelacionado(d, a);
                const fechada = a.status === "Concluída" || a.status === "Cancelada";
                return (
                  <tr key={a.id} className={cx(t.linha, fechada && "opacity-60")}>
                    <td className={t.td}>
                      <PainelLateral
                        titulo="Ação"
                        gatilho={a.acao}
                        classeGatilho="text-left font-medium text-slate-900 hover:text-marca-700"
                        acao={salvarAcao.bind(null, d.id, a.id)}
                        rodape={<BotaoExcluir acao={excluirAcao.bind(null, a.id)} pergunta="Excluir esta ação?" />}
                      >
                        <CamposAcao acao={a} achados={d.achados} oportunidades={d.oportunidades} />
                      </PainelLateral>
                      {relacionado && (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {a.achado_id ? "Achado" : "Oportunidade"}: {relacionado}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 md:hidden">
                        <EtiquetaPrioridade prioridade={a.prioridade} />
                        {a.responsavel && <span>{a.responsavel}</span>}
                        {a.prazo && (
                          <span className={cx("sm:hidden", atrasada(a.prazo, a.status) && "font-medium text-red-600")}>
                            até {formatarData(a.prazo)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{a.responsavel ?? "—"}</td>
                    <td
                      className={cx(
                        t.td,
                        "hidden sm:table-cell",
                        atrasada(a.prazo, a.status) ? "font-medium text-red-600" : "text-slate-600",
                      )}
                    >
                      {formatarData(a.prazo)}
                    </td>
                    <td className={`${t.td} hidden md:table-cell`}>
                      <EtiquetaPrioridade prioridade={a.prioridade} />
                    </td>
                    <td className={t.td}>
                      <SeletorImediato
                        key={a.status}
                        etiqueta
                        rotulo="Status"
                        valor={a.status}
                        opcoes={STATUS_ACAO}
                        acao={mudarStatusAcao.bind(null, a.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Cartao>
    </div>
  );
}
