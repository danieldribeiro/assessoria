import { Eye, FileText, MonitorSmartphone, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoExcluir } from "@/components/controles";
import { EtiquetaStatus } from "@/components/etiquetas";
import { CamposContato, CamposDiagnostico, CamposEmpresa } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import {
  CabecalhoCartao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  Etiqueta,
  LogoEmpresa,
  Vazio,
  classeBotao,
  classeTabela as t,
} from "@/components/ui";
import { enderecoEmLinhas, type Contato, type Diagnostico, type Empresa } from "@/lib/dominio";
import { formatarData, formatarPeriodo } from "@/lib/datas";
import { listarEquipe, ultimasAreas, usuarioAtual } from "@/lib/consultas";
import { criarCliente } from "@/lib/supabase/server";
import { liberarAcesso, removerAcesso } from "@/server/central";
import { criarDiagnostico } from "@/server/diagnosticos";
import { excluirContato, excluirEmpresa, salvarContato, salvarEmpresa } from "@/server/empresas";

type Acesso = { id: string; email: string; nome: string | null; ultimo_acesso: string | null };

type EmpresaDetalhe = Empresa & {
  contatos: Contato[];
  acessos_central: Acesso[];
  diagnosticos: (Diagnostico & { responsavel: { nome: string } | null })[];
};

export default async function PaginaEmpresa({ params }: PageProps<"/empresas/[id]">) {
  const { id } = await params;
  const supabase = await criarCliente();
  const [{ data }, equipe, usuario, areasPadrao] = await Promise.all([
    supabase
      .from("empresas")
      .select(
        "*, contatos(*), acessos_central(id, email, nome, ultimo_acesso), diagnosticos(*, responsavel:perfis!responsavel_id(nome))",
      )
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
        titulo={
          <>
            <LogoEmpresa nome={empresa.nome} logo={empresa.logo_url} largo className="size-11 text-base" />
            {empresa.nome}
          </>
        }
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
            O diagnóstico já é criado com a lista padrão de solicitações e de indicadores do segmento {empresa.segmento}
            .
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
                        <Link
                          href={`/diagnosticos/${d.id}`}
                          className="font-medium text-slate-900 hover:text-marca-700"
                        >
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

        <div className="space-y-6 self-start">
          <CentralDaClinica empresa={empresa} />
          <DadosCadastrais empresa={empresa} />
          <Cartao>
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
                        <BotaoExcluir
                          acao={excluirContato.bind(null, c.id)}
                          pergunta={`Excluir o contato ${c.nome}?`}
                        />
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
      </div>
    </>
  );
}

// Razão social, inscrições, endereço e e-mail: o que a nota fiscal pede.
function DadosCadastrais({ empresa }: { empresa: Empresa }) {
  const endereco = enderecoEmLinhas(empresa);
  const linhas = [
    ["Razão social", empresa.razao_social],
    ["CNPJ", empresa.cnpj],
    ["Inscrição municipal", empresa.inscricao_municipal],
    ["Inscrição estadual", empresa.inscricao_estadual],
    ["E-mail para notas", empresa.email],
    ["Telefone", empresa.telefone],
  ].filter((l): l is [string, string] => Boolean(l[1]));
  const faltam = [
    !empresa.razao_social && "razão social",
    !empresa.cnpj && "CNPJ",
    !endereco.length && "endereço",
    !empresa.email && "e-mail",
  ].filter(Boolean);

  return (
    <Cartao>
      <CabecalhoCartao titulo="Dados cadastrais" icone={<FileText />} />
      <dl className="space-y-2.5 px-5 py-4 text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-xs text-slate-500">{rotulo}</dt>
            <dd className="break-words text-slate-900">{valor}</dd>
          </div>
        ))}
        {endereco.length > 0 && (
          <div>
            <dt className="text-xs text-slate-500">Endereço</dt>
            {endereco.map((l) => (
              <dd key={l} className="text-slate-900">
                {l}
              </dd>
            ))}
          </div>
        )}
      </dl>
      {faltam.length > 0 && (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-amber-700">
          Falta {faltam.join(", ").replace(/, ([^,]*)$/, " e $1")} para emitir nota. Use “Editar”.
        </p>
      )}
    </Cartao>
  );
}

// Quem entra na central desta clínica. O e-mail liberado recebe um link de acesso no login.
function CentralDaClinica({ empresa }: { empresa: EmpresaDetalhe }) {
  const publicados = empresa.diagnosticos.filter((d) => d.publicado_em).length;
  const sugestoes = empresa.contatos.filter(
    (c) => c.email && !empresa.acessos_central.some((a) => a.email === c.email!.toLowerCase()),
  );
  return (
    <Cartao>
      <CabecalhoCartao titulo="Central da clínica" icone={<MonitorSmartphone />}>
        <PainelLateral
          titulo="Liberar acesso à central"
          gatilho={
            <>
              <Plus />
              Liberar
            </>
          }
          classeGatilho={classeBotao("fantasma", true)}
          acao={liberarAcesso.bind(null, empresa.id)}
          rotuloSalvar="Liberar acesso"
          aviso="Acesso liberado"
        >
          <p className="rounded-md bg-marca-50 px-3 py-2 text-sm text-marca-800">
            A pessoa abre o endereço do sistema, toca em “É dono de clínica? Entre com um link por e-mail” e recebe o
            link neste e-mail. Ela vê só esta clínica e só os diagnósticos publicados.
          </p>
          <Campo rotulo="Nome">
            <Entrada name="nome" defaultValue={sugestoes[0]?.nome ?? ""} />
          </Campo>
          <Campo
            rotulo="E-mail"
            dica={sugestoes.length ? `Contatos com e-mail: ${sugestoes.map((c) => c.email).join(", ")}` : undefined}
          >
            <Entrada name="email" type="email" required defaultValue={sugestoes[0]?.email ?? ""} />
          </Campo>
        </PainelLateral>
      </CabecalhoCartao>
      {empresa.acessos_central.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">Ninguém da clínica tem acesso ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {empresa.acessos_central.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">{a.nome ?? a.email}</div>
                <div className="truncate text-xs text-slate-500">
                  {a.nome && `${a.email} · `}
                  {a.ultimo_acesso ? `entrou em ${formatarData(a.ultimo_acesso.slice(0, 10))}` : "ainda não entrou"}
                </div>
              </div>
              <BotaoExcluir
                acao={removerAcesso.bind(null, a.id)}
                pergunta={`Tirar o acesso de ${a.email} à central?`}
                rotulo="Tirar"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <span>
          {publicados} diagnóstico{publicados === 1 ? "" : "s"} publicado{publicados === 1 ? "" : "s"}
        </span>
        <Link
          href={`/central/${empresa.id}`}
          className="inline-flex items-center gap-1 font-medium text-marca-700 hover:underline"
        >
          <Eye className="size-3.5" />
          Ver como o cliente
        </Link>
      </div>
    </Cartao>
  );
}
