import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoExcluir } from "@/components/controles";
import { EtiquetaStatus } from "@/components/etiquetas";
import { CamposContato, CamposDiagnostico, CamposEmpresa } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import {
  CabecalhoCartao,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Vazio,
  classeBotao,
  classeTabela as t,
} from "@/components/ui";
import type { Contato, Diagnostico, Empresa } from "@/lib/dominio";
import { formatarData, formatarPeriodo } from "@/lib/datas";
import { listarEquipe, ultimasAreas, usuarioAtual } from "@/lib/consultas";
import { criarCliente } from "@/lib/supabase/server";
import { criarDiagnostico } from "@/server/diagnosticos";
import { excluirContato, excluirEmpresa, salvarContato, salvarEmpresa } from "@/server/empresas";

type EmpresaDetalhe = Empresa & {
  contatos: Contato[];
  diagnosticos: (Diagnostico & { responsavel: { nome: string } | null })[];
};

export default async function PaginaEmpresa({ params }: PageProps<"/empresas/[id]">) {
  const { id } = await params;
  const supabase = await criarCliente();
  const [{ data }, equipe, usuario, areasPadrao] = await Promise.all([
    supabase
      .from("empresas")
      .select("*, contatos(*), diagnosticos(*, responsavel:perfis!responsavel_id(nome))")
      .eq("id", id)
      .maybeSingle(),
    listarEquipe(),
    usuarioAtual(),
    ultimasAreas(),
  ]);
  if (!data) notFound();
  const empresa = data as EmpresaDetalhe;
  empresa.contatos.sort((a, b) => Number(b.responsavel) - Number(a.responsavel) || a.nome.localeCompare(b.nome));
  empresa.diagnosticos.sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));

  return (
    <>
      <nav aria-label="Caminho" className="mb-2 text-sm text-slate-500">
        <Link href="/empresas" className="hover:text-slate-900">
          Empresas
        </Link>
      </nav>
      <CabecalhoPagina
        titulo={empresa.nome}
        subtitulo={[empresa.segmento, empresa.cnpj].filter(Boolean).join(" · ")}
      >
        <PainelLateral
          titulo="Editar empresa"
          gatilho={
            <>
              <Pencil />
              Editar
            </>
          }
          classeGatilho={classeBotao("secundario")}
          acao={salvarEmpresa.bind(null, empresa.id)}
          rodape={
            <BotaoExcluir
              acao={excluirEmpresa.bind(null, empresa.id)}
              pergunta={`Excluir ${empresa.nome}, com todos os contatos e diagnósticos? Isso não pode ser desfeito.`}
            />
          }
        >
          <CamposEmpresa empresa={empresa} />
        </PainelLateral>
        <PainelLateral
          titulo="Novo diagnóstico"
          gatilho={
            <>
              <Plus />
              Novo diagnóstico
            </>
          }
          classeGatilho={classeBotao("primario")}
          acao={criarDiagnostico.bind(null, empresa.id)}
          rotuloSalvar="Criar diagnóstico"
        >
          <p className="rounded-md bg-marca-50 px-3 py-2 text-sm text-marca-800">
            O diagnóstico já é criado com a lista padrão de solicitações e de indicadores do segmento{" "}
            {empresa.segmento}.
          </p>
          <CamposDiagnostico equipe={equipe} usuarioId={usuario?.id} areasPadrao={areasPadrao} />
        </PainelLateral>
      </CabecalhoPagina>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Cartao>
            <CabecalhoCartao titulo="Diagnósticos" contagem={empresa.diagnosticos.length} />
            {empresa.diagnosticos.length === 0 ? (
              <Vazio>Nenhum diagnóstico ainda. Use “Novo diagnóstico” para começar.</Vazio>
            ) : (
              <table className={t.tabela}>
                <thead className={t.cabeca}>
                  <tr>
                    <th className={t.th}>Período</th>
                    <th className={t.th}>Status</th>
                    <th className={`${t.th} hidden md:table-cell`}>Responsável</th>
                    <th className={`${t.th} hidden sm:table-cell`}>Início</th>
                    <th className={t.th}>Entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {empresa.diagnosticos.map((d) => (
                    <tr key={d.id} className={t.linha}>
                      <td className={t.td}>
                        <Link href={`/diagnosticos/${d.id}`} className="font-medium text-slate-900 hover:text-marca-700">
                          {formatarPeriodo(d.periodo_inicio, d.periodo_fim)}
                        </Link>
                      </td>
                      <td className={t.td}>
                        <EtiquetaStatus status={d.status} />
                      </td>
                      <td className={`${t.td} hidden text-slate-600 md:table-cell`}>{d.responsavel?.nome ?? "—"}</td>
                      <td className={`${t.td} hidden text-slate-600 sm:table-cell`}>{formatarData(d.data_inicio)}</td>
                      <td className={t.td}>{formatarData(d.data_prevista)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Cartao>

          {empresa.observacoes && (
            <Cartao>
              <CabecalhoCartao titulo="Observações" />
              <p className="whitespace-pre-wrap px-5 py-4 text-sm text-slate-700">{empresa.observacoes}</p>
            </Cartao>
          )}
        </div>

        <Cartao className="self-start">
          <CabecalhoCartao titulo="Contatos" contagem={empresa.contatos.length}>
            <PainelLateral
              titulo="Novo contato"
              gatilho={
            <>
              <Plus />
              Adicionar
            </>
          }
              classeGatilho={classeBotao("fantasma", true)}
              acao={salvarContato.bind(null, empresa.id, null)}
            >
              <CamposContato />
            </PainelLateral>
          </CabecalhoCartao>
          {empresa.contatos.length === 0 ? (
            <Vazio>Nenhum contato. Cadastre ao menos o responsável pelas informações.</Vazio>
          ) : (
            <ul className="divide-y divide-slate-100">
              {empresa.contatos.map((c) => (
                <li key={c.id}>
                  <PainelLateral
                    titulo="Editar contato"
                    classeGatilho="block w-full px-5 py-3 text-left hover:bg-slate-50"
                    acao={salvarContato.bind(null, empresa.id, c.id)}
                    rodape={
                      <BotaoExcluir acao={excluirContato.bind(null, c.id)} pergunta={`Excluir o contato ${c.nome}?`} />
                    }
                    gatilho={
                      <>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{c.nome}</span>
                          {c.responsavel && <Etiqueta tom="azul">Responsável</Etiqueta>}
                        </span>
                        {c.cargo && <span className="block text-xs text-slate-500">{c.cargo}</span>}
                        <span className="mt-1 block space-y-0.5 text-xs text-slate-600">
                          {c.telefone && <span className="block">{c.telefone}</span>}
                          {c.email && <span className="block">{c.email}</span>}
                        </span>
                      </>
                    }
                  >
                    <CamposContato contato={c} />
                  </PainelLateral>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
