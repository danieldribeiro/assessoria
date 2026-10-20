import { ListTree, Plus } from "lucide-react";
import { BotaoAcao } from "@/components/controles";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import {
  CLASSIFICACOES,
  NOME_CAIXA,
  compararCodigo,
  nomeSecaoDre,
  type ContaPlano,
} from "@/lib/financeiro/dominio";
import { criarCliente } from "@/lib/supabase/server";
import { mudarAtivacaoConta, salvarConta } from "@/server/financeiro";
import { CamposConta } from "./campos";

// Plano em árvore: cada conta logo abaixo do seu grupo, na ordem definida (e pelo código).
function emArvore(contas: ContaPlano[]) {
  const filhos = new Map<string | null, ContaPlano[]>();
  for (const c of contas) filhos.set(c.conta_pai_id, [...(filhos.get(c.conta_pai_id) ?? []), c]);
  const saida: { conta: ContaPlano; nivel: number }[] = [];
  const visitar = (pai: string | null, nivel: number) => {
    for (const c of (filhos.get(pai) ?? []).sort((a, b) => a.ordem - b.ordem || compararCodigo(a.codigo, b.codigo))) {
      saida.push({ conta: c, nivel });
      visitar(c.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return saida;
}

export async function AbaPlanoContas({ empresa, contas }: { empresa: { id: string }; contas: ContaPlano[] }) {
  const supabase = await criarCliente();
  const { data: usos } = await supabase.from("fin_lancamento_rateios").select("conta_id").eq("empresa_id", empresa.id);
  const usadas = new Set((usos ?? []).map((u) => u.conta_id as string));
  const arvore = emArvore(contas);
  const grupos = arvore
    .filter((l) => l.conta.tipo === "grupo")
    .map((l) => ({ valor: l.conta.id, rotulo: `${"  ".repeat(l.nivel)}${l.conta.codigo} · ${l.conta.nome}` }));

  return (
    <Cartao className="overflow-x-auto">
      <CabecalhoCartao titulo="Plano de contas" contagem={contas.length}>
        <PainelLateral
          titulo="Nova conta"
          gatilho={
            <>
              <Plus />
              Nova conta
            </>
          }
          classeGatilho={classeBotao("primario", true)}
          acao={salvarConta.bind(null, empresa.id, null)}
          rotuloSalvar="Criar conta"
          aviso="Conta criada"
        >
          <CamposConta grupos={grupos} />
        </PainelLateral>
      </CabecalhoCartao>
      {contas.length === 0 ? (
        <Vazio icone={<ListTree />}>
          Nenhuma conta ainda. Crie os grupos e as contas desta empresa com “Nova conta”. Os modelos prontos (por exemplo,
          o de Odontologia) ainda aguardam validação e não estão disponíveis.
        </Vazio>
      ) : (
        <table className={t.tabela}>
          <thead className={t.cabeca}>
            <tr>
              <th className={t.th}>Conta</th>
              <th className={t.th}>Classificação</th>
              <th className={`${t.th} hidden md:table-cell`}>Caixa</th>
              <th className={`${t.th} hidden lg:table-cell`}>DRE</th>
              <th className={t.th}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {arvore.map(({ conta: c, nivel }) => {
              const usada = usadas.has(c.id);
              return (
                <tr key={c.id} className={cx(t.linha, !c.ativa && "text-slate-400")}>
                  <td className="px-5 py-2.5" style={{ paddingLeft: `${1.25 + nivel * 1.25}rem` }}>
                    <PainelLateral
                      titulo="Editar conta"
                      classeGatilho="text-left hover:text-marca-700"
                      acao={salvarConta.bind(null, empresa.id, c.id)}
                      gatilho={
                        <span className={cx(c.tipo === "grupo" ? "font-semibold" : "", c.ativa ? "text-slate-900" : "text-slate-400")}>
                          <span className="mr-2 text-xs tabular-nums text-slate-400">{c.codigo}</span>
                          {c.nome}
                        </span>
                      }
                    >
                      <CamposConta conta={c} grupos={grupos.filter((g) => g.valor !== c.id)} usada={usada} />
                    </PainelLateral>
                    {!c.ativa && (
                      <Etiqueta className="ml-2" tom="cinza">
                        inativa
                      </Etiqueta>
                    )}
                  </td>
                  <td className={`${t.td} text-slate-600`}>
                    {c.tipo === "grupo" ? (
                      <span className="text-xs text-slate-400">grupo</span>
                    ) : (
                      <>
                        {c.classificacao ? CLASSIFICACOES[c.classificacao].rotulo : "—"}
                        {c.custo_cmv && (
                          <Etiqueta className="ml-1.5" tom="roxo">
                            CMV
                          </Etiqueta>
                        )}
                      </>
                    )}
                  </td>
                  <td className={`${t.td} hidden text-slate-600 md:table-cell`}>
                    {c.comportamento_caixa ? NOME_CAIXA[c.comportamento_caixa] : ""}
                  </td>
                  <td className={`${t.td} hidden text-xs text-slate-500 lg:table-cell`}>
                    {c.dre_secao ? `${c.dre_secao}. ${nomeSecaoDre(c.dre_secao)}` : c.tipo === "analitica" ? "fora da DRE" : ""}
                  </td>
                  <td className={`${t.td} whitespace-nowrap text-right`}>
                    <BotaoAcao
                      acao={mudarAtivacaoConta.bind(null, c.id, !c.ativa)}
                      aviso={c.ativa ? "Conta desativada" : "Conta reativada"}
                      pergunta={c.ativa ? `Desativar ${c.codigo} ${c.nome}? Ela deixa de receber lançamentos novos; o histórico continua.` : undefined}
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
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        Contas não são excluídas: uma conta que deixa de ser usada é desativada, e o histórico continua. Toda criação e
        alteração fica registrada.
      </p>
    </Cartao>
  );
}
