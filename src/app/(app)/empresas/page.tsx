import Link from "next/link";
import { EtiquetaStatus } from "@/components/etiquetas";
import { CamposEmpresa } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoPagina, Cartao, Vazio, classeBotao, classeInput, classeTabela as t } from "@/components/ui";
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
      <CabecalhoPagina titulo="Empresas" subtitulo="Clientes da assessoria">
        <PainelLateral
          titulo="Nova empresa"
          gatilho="Nova empresa"
          classeGatilho={classeBotao("primario")}
          acao={salvarEmpresa.bind(null, null)}
          rotuloSalvar="Cadastrar"
        >
          <CamposEmpresa />
        </PainelLateral>
      </CabecalhoPagina>

      <form className="mb-4 max-w-sm">
        <input
          name="busca"
          defaultValue={termo}
          placeholder="Buscar por nome ou CNPJ"
          className={classeInput}
        />
      </form>

      <Cartao className="overflow-x-auto">
        {empresas.length === 0 ? (
          <Vazio>{termo ? "Nenhuma empresa encontrada." : "Nenhuma empresa cadastrada ainda."}</Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Empresa</th>
                <th className={t.th}>Segmento</th>
                <th className={t.th}>Responsável</th>
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
                      <Link href={`/empresas/${e.id}`} className="font-medium text-slate-900 hover:text-marca-700">
                        {e.nome}
                      </Link>
                      {e.cnpj && <div className="text-xs text-slate-500">{e.cnpj}</div>}
                    </td>
                    <td className={t.td}>{e.segmento}</td>
                    <td className={t.td}>{responsavel?.nome ?? <span className="text-slate-400">—</span>}</td>
                    <td className={t.td}>
                      {ultimo ? (
                        <Link href={`/diagnosticos/${ultimo.id}`} className="flex items-center gap-2 hover:text-marca-700">
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
