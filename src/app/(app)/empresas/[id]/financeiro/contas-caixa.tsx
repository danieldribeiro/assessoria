import { Landmark, Plus } from "lucide-react";
import { BotaoAcao } from "@/components/controles";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import { formatarData, formatarValor, hoje } from "@/lib/datas";
import { carregarSaldos } from "@/lib/financeiro/consultas";
import { TIPOS_CAIXA, type ContaCaixa } from "@/lib/financeiro/dominio";
import { mudarAtivacaoCaixa, salvarContaCaixa } from "@/server/financeiro";
import { CamposContaCaixa } from "./campos";

const moeda = (v: number) => formatarValor(v, "R$")!;

export async function AbaContasCaixa({ empresa, caixas }: { empresa: { id: string }; caixas: ContaCaixa[] }) {
  const saldos = new Map((await carregarSaldos(empresa.id, hoje())).map((s) => [s.conta_caixa_id, s.saldo]));
  return (
    <Cartao className="overflow-x-auto">
      <CabecalhoCartao titulo="Contas de caixa" contagem={caixas.length}>
        <PainelLateral
          titulo="Nova conta de caixa"
          gatilho={
            <>
              <Plus />
              Nova conta de caixa
            </>
          }
          classeGatilho={classeBotao("primario", true)}
          acao={salvarContaCaixa.bind(null, empresa.id, null)}
          rotuloSalvar="Criar conta de caixa"
          aviso="Conta de caixa criada"
        >
          <CamposContaCaixa />
        </PainelLateral>
      </CabecalhoCartao>
      {caixas.length === 0 ? (
        <Vazio icone={<Landmark />}>
          Nenhuma conta de caixa. Cadastre cada banco, caixa ou aplicação com o saldo inicial e a data desse saldo.
        </Vazio>
      ) : (
        <table className={t.tabela}>
          <thead className={t.cabeca}>
            <tr>
              <th className={t.th}>Conta</th>
              <th className={`${t.th} hidden sm:table-cell`}>Saldo inicial</th>
              <th className={`${t.th} text-right`}>Saldo hoje</th>
              <th className={t.th}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {caixas.map((c) => {
              const saldo = saldos.get(c.id);
              return (
                <tr key={c.id} className={cx(t.linha, !c.ativa && "text-slate-400")}>
                  <td className={t.td}>
                    <PainelLateral
                      titulo="Editar conta de caixa"
                      classeGatilho="text-left font-medium text-slate-900 hover:text-marca-700"
                      acao={salvarContaCaixa.bind(null, empresa.id, c.id)}
                      gatilho={c.nome}
                    >
                      <CamposContaCaixa caixa={c} />
                    </PainelLateral>
                    {!c.ativa && (
                      <Etiqueta className="ml-2" tom="cinza">
                        inativa
                      </Etiqueta>
                    )}
                    <span className="block text-xs text-slate-500">{TIPOS_CAIXA.find((x) => x.valor === c.tipo)?.rotulo}</span>
                  </td>
                  <td className={`${t.td} hidden text-slate-600 sm:table-cell`}>
                    {moeda(c.saldo_inicial)} em {formatarData(c.data_saldo_inicial)}
                  </td>
                  <td className={`${t.td} text-right font-medium tabular-nums`}>
                    {saldo === null || saldo === undefined ? <span className="text-xs text-slate-400">começa depois</span> : moeda(saldo)}
                  </td>
                  <td className={`${t.td} text-right`}>
                    <BotaoAcao
                      acao={mudarAtivacaoCaixa.bind(null, c.id, !c.ativa)}
                      aviso={c.ativa ? "Conta de caixa desativada" : "Conta de caixa reativada"}
                      pergunta={c.ativa ? `Desativar ${c.nome}? Ela deixa de receber lançamentos novos; o saldo e o histórico continuam.` : undefined}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {c.ativa ? "Desativar" : "Reativar"}
                    </BotaoAcao>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}
