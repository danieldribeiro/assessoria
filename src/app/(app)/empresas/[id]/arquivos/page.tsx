import { Eye, ListPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/controles";
import { ListaDeEnvios, NovoItem, SeletorDeMes, SemLista } from "@/components/envios";
import { CabecalhoPagina, LinkBotao, classeBotao } from "@/components/ui";
import { hoje as hojeLocal } from "@/lib/datas";
import { LISTA_PADRAO, competenciaPadrao, lerMes, somarMeses } from "@/lib/envios";
import { carregarEnvios, nomesDePessoas } from "@/lib/envios-consultas";
import { criarCliente } from "@/lib/supabase/server";
import { ativarListaPadrao } from "@/server/envios";

// Arquivos recebidos da clínica: o que chegou em cada mês, download, dispensa e a lista que o cliente vê.
export const metadata = { title: "Arquivos recebidos" };

export default async function PaginaArquivosRecebidos({ params, searchParams }: PageProps<"/empresas/[id]/arquivos">) {
  const { id } = await params;
  const { mes } = await searchParams;
  const supabase = await criarCliente();
  const [{ data: empresa }, dados] = await Promise.all([
    supabase.from("empresas").select("id, nome").eq("id", id).maybeSingle(),
    carregarEnvios(id),
  ]);
  if (!empresa) notFound();
  const nomes = await nomesDePessoas(dados.arquivos.map((a) => a.enviado_por));

  const hoje = hojeLocal();
  const padrao = competenciaPadrao(hoje);
  const meses = [0, 1, 2, 3, 4, 5].map((i) => somarMeses(padrao, -i));
  const pedido = lerMes(typeof mes === "string" ? mes : undefined);
  const competencia = pedido ?? padrao;
  if (!meses.includes(competencia)) meses.push(competencia);

  return (
    <>
      <nav aria-label="Caminho" className="mb-2 text-sm text-slate-500">
        <Link href="/empresas" className="hover:text-slate-900">
          Empresas
        </Link>
        {" / "}
        <Link href={`/empresas/${empresa.id}`} className="hover:text-slate-900">
          {empresa.nome}
        </Link>
      </nav>
      <CabecalhoPagina
        titulo="Arquivos recebidos"
        subtitulo="O que a clínica mandou pela central. A lista abaixo é a mesma que o cliente vê."
      >
        <LinkBotao href={`/central/${empresa.id}/arquivos`}>
          <Eye />
          Ver como o cliente
        </LinkBotao>
        {dados.itens.length > 0 && <NovoItem empresaId={empresa.id} />}
      </CabecalhoPagina>

      {!dados.disponivel ? (
        <SemLista>O envio de arquivos ainda não foi ativado no banco de dados (migration 0014).</SemLista>
      ) : dados.itens.length === 0 ? (
        <SemLista>
          <p>Esta clínica ainda não tem lista. A lista padrão tem {LISTA_PADRAO.length} itens do kit de entrada de dados: {LISTA_PADRAO.filter((i) => i.frequencia === "unica").length} para o início do contrato e {LISTA_PADRAO.filter((i) => i.frequencia === "mensal").length} para todo mês. Depois dá para editar, tirar ou incluir itens.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <BotaoAcao
              acao={ativarListaPadrao.bind(null, empresa.id)}
              aviso="Lista ativada"
              pergunta="Ativar a lista padrão para esta clínica? Quem tem acesso à central passa a ver a lista e o botão de enviar."
              className={classeBotao("primario")}
            >
              <ListPlus />
              Ativar lista padrão
            </BotaoAcao>
            <NovoItem empresaId={empresa.id} />
          </div>
        </SemLista>
      ) : (
        <>
          <SeletorDeMes meses={meses} atual={competencia} href={(m) => `/empresas/${empresa.id}/arquivos?mes=${m.slice(0, 7)}`} />
          <ListaDeEnvios
            empresaId={empresa.id}
            competencia={competencia}
            hoje={hoje}
            itens={dados.itens}
            arquivos={dados.arquivos}
            dispensas={dados.dispensas}
            nomes={nomes}
            equipe
          />
        </>
      )}
    </>
  );
}
