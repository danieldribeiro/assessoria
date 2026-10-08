import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { EtiquetaStatus } from "@/components/etiquetas";
import { CamposEmpresa } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoPagina, Cartao, Vazio, classeBotao, classeInput, classeTabela as t, iniciais } from "@/components/ui";
import { formatarPeriodo } from "@/lib/datas";
import { criarCliente } from "@/lib/supabase/server";
import { salvarEmpresa } from "@/server/empresas";

export const metadata = { title: "Empresas" };

type Linha = {
  id: string;
  nome: string;
  cnpj: string | null;
  segmento: string;
  contatos: { nome: string; responsavel: boolean }[];
  diagnosticos: { id: string; status: string; periodo_inicio: string; periodo_fim: string; data_inicio: string }[];
};

export default async function Empresas({ searchParams }: PageProps<"/empresas">) {
  const { busca } = await searchParams;
  const termo = typeof busca === "string" ? busca.trim() : "";

  const supabase = await criarCliente();
  let consulta = supabase
    .from("empresas")
    .select("id, nome, cnpj, segmento, contatos(nome, responsavel), diagnosticos(id, status, periodo_inicio, periodo_fim, data_inicio)")
    .order("nome");
  if (termo) {
    const seguro = termo.replace(/[,()%]/g, " ");
    consulta = consulta.or(`nome.ilike.%${seguro}%,cnpj.ilike.%${seguro}%`);
  }
  const { data } = await consulta;
  const empresas = (data ?? []) as Linha[];

  return (
    <>
      <CabecalhoPagina titulo="Empresas" icone={<Building2 />} subtitulo="Clientes da assessoria e seus diagnósticos">
        <PainelLateral
          titulo="Nova empresa"
          gatilho={
            <>
              <Plus />
              Nova empresa
            </>
          }
          classeGatilho={classeBotao("primario")}
          acao={salvarEmpresa.bind(null, null)}
          rotuloSalvar="Cadastrar"
        >
          <CamposEmpresa />
        </PainelLateral>
      </CabecalhoPagina>

      <form role="search" className="mb-4 flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a.75.75 0 11-1.06 1.06l-3.08-3.08A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="search"
            name="busca"
            aria-label="Buscar empresa"
            defaultValue={termo}
            placeholder="Buscar por nome ou CNPJ"
            className={`${classeInput} pl-9`}
          />
        </div>
        {termo && (
          <Link href="/empresas" className="text-sm text-slate-500 hover:text-slate-900">
            Limpar
          </Link>
        )}
      </form>

      <Cartao className="overflow-hidden">
        {empresas.length === 0 ? (
          <Vazio>
            {termo
              ? `Nenhuma empresa encontrada para “${termo}”.`
              : "Nenhuma empresa cadastrada ainda. Use “Nova empresa” para cadastrar o primeiro cliente."}
          </Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Empresa</th>
                <th className={`${t.th} hidden md:table-cell`}>Segmento</th>
                <th className={`${t.th} hidden sm:table-cell`}>Responsável</th>
                <th className={t.th}>Último diagnóstico</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => {
                const ultimo = [...e.diagnosticos].sort((a, b) =>
                  b.data_inicio.localeCompare(a.data_inicio),
                )[0];
                const responsavel = e.contatos.find((c) => c.responsavel) ?? e.contatos[0];
                return (
                  <tr key={e.id} className={t.linha}>
                    <td className={t.td}>
                      <Link href={`/empresas/${e.id}`} className="group flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600 group-hover:bg-marca-50 group-hover:text-marca-700">
                          {iniciais(e.nome)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 group-hover:text-marca-700">{e.nome}</span>
                          {e.cnpj && <span className="block text-xs text-slate-500">{e.cnpj}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className={`${t.td} hidden align-middle text-slate-600 md:table-cell`}>{e.segmento}</td>
                    <td className={`${t.td} hidden align-middle text-slate-600 sm:table-cell`}>
                      {responsavel?.nome ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className={`${t.td} align-middle`}>
                      {ultimo ? (
                        <Link href={`/diagnosticos/${ultimo.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 hover:text-marca-700">
                          <span>{formatarPeriodo(ultimo.periodo_inicio, ultimo.periodo_fim)}</span>
                          <EtiquetaStatus status={ultimo.status} />
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  );
}
