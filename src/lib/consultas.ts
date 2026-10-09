import "server-only";
import { notFound } from "next/navigation";
import { criarCliente } from "@/lib/supabase/server";
import {
  CATEGORIAS,
  porPrioridade,
  type Acao,
  type Assessoria,
  type Achado,
  type Diagnostico,
  type Empresa,
  type Indicador,
  type Oportunidade,
  type Perfil,
  type ResponsaveisArea,
  responsavelDoItem,
  type Solicitacao,
} from "@/lib/dominio";

export async function usuarioAtual() {
  const supabase = await criarCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Contas que entraram no sistema mas não são da equipe nem foram liberadas para uma clínica.
// Um sócio decide se a pessoa entra para a equipe.
export async function contasAguardando() {
  const supabase = await criarCliente();
  const [{ data: contas }, { data: acessos }] = await Promise.all([
    supabase.from("perfis").select("id, nome, email").eq("papel", "cliente").order("nome"),
    supabase.from("acessos_central").select("email"),
  ]);
  const clientes = new Set((acessos ?? []).map((a) => a.email));
  return ((contas ?? []) as Perfil[]).filter((p) => !clientes.has(p.email.toLowerCase()));
}

export async function carregarAssessoria() {
  const supabase = await criarCliente();
  const { data } = await supabase.from("assessoria").select("*").maybeSingle();
  return data as Assessoria | null;
}

export async function listarEquipe() {
  const supabase = await criarCliente();
  const { data } = await supabase
    .from("perfis")
    .select("id, nome, email, cargo, telefone, foto_url")
    .eq("papel", "equipe")
    .order("nome");
  return (data ?? []) as Perfil[];
}

const ordemCategoria = (c: string) => CATEGORIAS.indexOf(c as (typeof CATEGORIAS)[number]);

export type DiagnosticoCompleto = Diagnostico & {
  empresa: Pick<Empresa, "id" | "nome" | "segmento" | "cnpj" | "logo_url">;
  responsavel: { nome: string } | null;
  solicitacoes: Solicitacao[];
  indicadores: Indicador[];
  achados: Achado[];
  oportunidades: Oportunidade[];
  acoes: Acao[];
  equipe: Perfil[];
};

export async function carregarDiagnostico(id: string): Promise<DiagnosticoCompleto> {
  const supabase = await criarCliente();
  const [{ data, error }, equipe] = await Promise.all([
    supabase
    .from("diagnosticos")
    .select(
      `*, empresa:empresas(id, nome, segmento, cnpj, logo_url), responsavel:perfis!responsavel_id(nome),
       solicitacoes(*), indicadores(*), achados(*), oportunidades(*), acoes(*)`,
    )
    .eq("id", id)
    .maybeSingle(),
    listarEquipe(),
  ]);
  if (error) throw new Error(error.message);
  if (!data) notFound();

  const d = { ...data, equipe } as DiagnosticoCompleto;
  d.responsaveis_area ??= {};
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

// Filtro por responsável usado nas abas: undefined = todos, "sem" = ninguém, senão o id da pessoa.
export function filtrarPorResponsavel<T extends { responsavel_id: string | null; categoria: string }>(
  itens: T[],
  areas: ResponsaveisArea,
  de: string | undefined,
) {
  if (!de) return itens;
  return itens.filter((i) => {
    const r = responsavelDoItem(i, areas);
    return de === "sem" ? r === null : r === de;
  });
}

// Divisão de áreas do diagnóstico mais recente, para já vir preenchida no próximo.
export async function ultimasAreas(): Promise<ResponsaveisArea> {
  const supabase = await criarCliente();
  const { data } = await supabase
    .from("diagnosticos")
    .select("responsaveis_area")
    .neq("responsaveis_area", "{}")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.responsaveis_area as ResponsaveisArea | undefined) ?? {};
}
