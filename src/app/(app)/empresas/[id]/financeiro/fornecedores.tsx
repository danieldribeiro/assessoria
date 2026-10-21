import { Plus, Store } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import { TIPOS_CONTRAPARTE, formatarDocumento, type Contraparte } from "@/lib/financeiro/dominio";
import { mudarAtivacaoContraparte, salvarContraparte } from "@/server/financeiro";
import { CamposContraparte } from "./campos";

// Cadastro de fornecedores e clientes da empresa (0009). Nada é apagado: quem não é mais usado é desativado.
export function AbaFornecedores({
  empresa,
  contrapartes,
  periodo,
}: {
  empresa: { id: string };
  contrapartes: Contraparte[];
  periodo: { de: string; ate: string };
}) {
  return (
    <Cartao className="overflow-x-auto">
      <CabecalhoCartao titulo="Fornecedores e clientes" contagem={contrapartes.length}>
        <PainelLateral
          titulo="Novo fornecedor ou cliente"
          gatilho={
            <>
              <Plus />
              Novo
            </>
          }
          classeGatilho={classeBotao("primario", true)}
          acao={salvarContraparte.bind(null, empresa.id, null)}
          rotuloSalvar="Cadastrar"
          aviso="Cadastro criado"
        >
          <CamposContraparte />
        </PainelLateral>
      </CabecalhoCartao>
      {contrapartes.length === 0 ? (
        <Vazio icone={<Store />}>
          Nenhum fornecedor ou cliente cadastrado. Cadastre quem a empresa paga ou de quem recebe para ver, no painel, os
          principais fornecedores e filtrar os lançamentos por eles.
        </Vazio>
      ) : (
        <table className={t.tabela}>
          <thead className={t.cabeca}>
            <tr>
              <th className={t.th}>Nome</th>
              <th className={`${t.th} hidden sm:table-cell`}>CPF ou CNPJ</th>
              <th className={t.th}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {contrapartes.map((c) => (
              <tr key={c.id} className={cx(t.linha, !c.ativa && "text-slate-400")}>
                <td className={t.td}>
                  <PainelLateral
                    titulo="Editar fornecedor ou cliente"
                    classeGatilho="text-left font-medium text-slate-900 hover:text-marca-700"
                    acao={salvarContraparte.bind(null, empresa.id, c.id)}
                    gatilho={c.nome}
                  >
                    <CamposContraparte contraparte={c} />
                  </PainelLateral>
                  {!c.ativa && (
                    <Etiqueta className="ml-2" tom="cinza">
                      inativo
                    </Etiqueta>
                  )}
                  <span className="block text-xs text-slate-500">{TIPOS_CONTRAPARTE.find((x) => x.valor === c.tipo)?.rotulo}</span>
                </td>
                <td className={`${t.td} hidden tabular-nums text-slate-600 sm:table-cell`}>{formatarDocumento(c.documento) ?? "—"}</td>
                <td className={`${t.td} whitespace-nowrap text-right`}>
                  <Link
                    href={`?${new URLSearchParams({ aba: "lancamentos", de: periodo.de, ate: periodo.ate, contraparte: c.id })}`}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50"
                  >
                    Lançamentos
                  </Link>
                  <BotaoAcao
                    acao={mudarAtivacaoContraparte.bind(null, c.id, !c.ativa)}
                    aviso={c.ativa ? "Cadastro desativado" : "Cadastro reativado"}
                    pergunta={c.ativa ? `Desativar ${c.nome}? Não aparece mais em lançamentos novos; os antigos continuam com ele.` : undefined}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    {c.ativa ? "Desativar" : "Reativar"}
                  </BotaoAcao>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}
