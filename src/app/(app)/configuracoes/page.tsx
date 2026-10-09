import { Briefcase, Settings, UserRound, Users } from "lucide-react";
import { CamposCadastro, SeletorImagem } from "@/components/cadastro";
import { Formulario } from "@/components/formulario";
import { AvatarResponsavel, iniciaisPessoa } from "@/components/responsaveis";
import { CabecalhoCartao, CabecalhoPagina, Campo, Cartao, Entrada, Selecao, iniciais } from "@/components/ui";
import { REGIMES_TRIBUTARIOS } from "@/lib/dominio";
import { carregarAssessoria, listarEquipe, usuarioAtual } from "@/lib/consultas";
import { salvarAssessoria, salvarPerfil } from "@/server/configuracoes";

export const metadata = { title: "Configurações" };

export default async function PaginaConfiguracoes() {
  const [usuario, equipe, assessoria] = await Promise.all([usuarioAtual(), listarEquipe(), carregarAssessoria()]);
  const eu = equipe.find((p) => p.id === usuario?.id);

  return (
    <>
      <CabecalhoPagina
        icone={<Settings />}
        titulo="Configurações"
        subtitulo="Seu perfil e os dados da assessoria que vão nas notas e nos relatórios."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Cartao>
            <CabecalhoCartao titulo="Seu perfil" icone={<UserRound />} />
            <Formulario acao={salvarPerfil} aviso="Perfil salvo">
              <SeletorImagem
                nome="foto"
                tipo="foto"
                valor={eu?.foto_url}
                substituto={iniciaisPessoa(eu?.nome ?? usuario?.email ?? "?")}
              />
              <Campo rotulo="Nome">
                <Entrada name="nome" defaultValue={eu?.nome} required />
              </Campo>
              <Campo rotulo="Cargo" dica="Ex.: sócio, consultor financeiro">
                <Entrada name="cargo" defaultValue={eu?.cargo ?? ""} />
              </Campo>
              <Campo rotulo="Telefone">
                <Entrada name="telefone" defaultValue={eu?.telefone ?? ""} inputMode="tel" />
              </Campo>
              <Campo rotulo="E-mail de acesso">
                <Entrada value={usuario?.email ?? ""} disabled readOnly />
              </Campo>
            </Formulario>
          </Cartao>

          <Cartao>
            <CabecalhoCartao titulo="Equipe" icone={<Users />} contagem={equipe.length} />
            <ul className="divide-y divide-slate-100">
              {equipe.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <AvatarResponsavel perfil={p} className="size-8 text-xs" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {p.nome}
                      {p.id === usuario?.id && (
                        <span className="ml-1.5 text-xs font-normal text-slate-500">(você)</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {[p.cargo, p.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Para incluir alguém, crie o acesso em Authentication → Users no Supabase. A pessoa aparece aqui no
              primeiro login.
            </p>
          </Cartao>
        </div>

        <Cartao className="self-start lg:col-span-2">
          <CabecalhoCartao titulo="Assessoria" icone={<Briefcase />} />
          <Formulario acao={salvarAssessoria} aviso="Dados da assessoria salvos">
            <SeletorImagem
              nome="logo"
              tipo="logo"
              valor={assessoria?.logo_url}
              substituto={
                <span className="text-sm text-slate-400">
                  {assessoria?.nome_fantasia ? iniciais(assessoria.nome_fantasia) : "Logo"}
                </span>
              }
            />
            <p className="-mt-2 text-xs text-slate-500">
              A logo aparece no topo dos relatórios entregues aos clientes.
            </p>
            <CamposCadastro
              ladoALado
              valores={assessoria}
              campoNome="nome_fantasia"
              extrasIdentificacao={
                <>
                  <Campo rotulo="Nome fantasia">
                    <Entrada name="nome_fantasia" defaultValue={assessoria?.nome_fantasia ?? ""} />
                  </Campo>
                  <Campo rotulo="Regime tributário">
                    <Selecao
                      name="regime_tributario"
                      opcoes={REGIMES_TRIBUTARIOS}
                      defaultValue={assessoria?.regime_tributario ?? ""}
                      vazio="Selecione"
                    />
                  </Campo>
                </>
              }
            />
            <Campo rotulo="Site">
              <Entrada name="site" defaultValue={assessoria?.site ?? ""} placeholder="www.suaassessoria.com.br" />
            </Campo>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
