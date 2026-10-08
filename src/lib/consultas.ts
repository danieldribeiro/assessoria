import "server-only";
import { notFound } from "next/navigation";
import { criarCliente } from "@/lib/supabase/server";
import {
  CATEGORIAS,
  porPrioridade,
  type Acao,
  type Achado,
  type Diagnostico,
  type Empresa,
  type Indicador,
  type Oportunidade,
  type Perfil,
  type Solicitacao,
} from "@/lib/dominio";

export async function usuarioAtual() {
  const supabase = await criarCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function listarEquipe() {
  const supabase = await criarCliente();
  const { data } = await supabase.from("perfis").select("id, nome, email").order("nome");
  return (data ?? []) as Perfil[];
}

const ordemCategoria = (c: string) => CATEGORIAS.indexOf(c as (typeof CATEGORIAS)[number]);

export type DiagnosticoCompleto = Diagnostico & {
  empresa: Pick<Empresa, "id" | "nome" | "segmento" | "cnpj">;
  responsavel: { nome: string } | null;
  solicitacoes: Solicitacao[];
  indicadores: Indicador[];
  achados: Achado[];
  oportunidades: Oportunidade[];
  acoes: Acao[];
};

export async function carregarDiagnostico(id: string): Promise<DiagnosticoCompleto> {
  const supabase = await criarCliente();
  const { data, error } = await supabase
    .from("diagnosticos")
    .select(
      `*, empresa:empresas(id, nome, segmento, cnpj), responsavel:perfis!responsavel_id(nome),
       solicitacoes(*), indicadores(*), achados(*), oportunidades(*), acoes(*)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const d = data as DiagnosticoCompleto;
  const porCategoriaEOrdem = (a: { categoria: string; ordem: number }, b: { categoria: string; ordem: number }) =>
    ordemCategoria(a.categoria) - ordemCategoria(b.categoria) || a.ordem - b.ordem;

  d.solicitacoes.sort(porCategoriaEOrdem);
  d.indicadores.sort(porCategoriaEOrdem);
  d.achados.sort(porPrioridade);
  d.oportunidades.sort(porPrioridade);
  d.acoes.sort(
    (a, b) =>
      Number(a.status === "Concluída" || a.status === "Cancelada") -
        Number(b.status === "Concluída" || b.status === "Cancelada") ||
      (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"),
  );
  return d;
}

export function agruparPorCategoria<T extends { categoria: string }>(itens: T[]) {
  return CATEGORIAS.map((categoria) => ({
    categoria,
    itens: itens.filter((i) => i.categoria === categoria),
  })).filter((g) => g.itens.length > 0);
}

export function resumoColeta(solicitacoes: { status: string }[]) {
  const total = solicitacoes.filter((s) => s.status !== "Não disponível").length;
  const recebidos = solicitacoes.filter((s) => s.status === "Recebido").length;
  return { total, recebidos, faltam: total - recebidos };
}
