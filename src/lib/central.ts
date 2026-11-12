import "server-only";
import { notFound } from "next/navigation";
import { criarCliente } from "@/lib/supabase/server";
import { CATEGORIAS, corDoIndicador, porPrioridade, type Assessoria, type Cadastro, type Cor, type Indicador, type Papel } from "@/lib/dominio";
import type { DiagnosticoCompleto } from "@/lib/consultas";

// Leituras da central da clínica. Tudo passa pelas funções central_* do banco, que conferem
// se a pessoa pode ver a clínica e devolvem só o que foi publicado.

export async function perfilAtual() {
  const supabase = await criarCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("perfis").select("nome, papel, foto_url").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email ?? "",
    nome: (data?.nome as string | undefined) ?? user.email ?? "",
    papel: ((data?.papel as Papel | undefined) ?? "cliente") as Papel,
    foto_url: (data?.foto_url as string | null | undefined) ?? null,
  };
}

export async function empresasDaCentral() {
  const supabase = await criarCliente();
  const { data } = await supabase.rpc("central_empresas");
  return (data ?? []) as { id: string; nome: string; logo_url: string | null }[];
}

// A clínica aberta na central: o cliente precisa ter acesso; a equipe vê qualquer uma.
export async function empresaDaCentral(id: string, papel: Papel) {
  if (papel === "equipe") {
    const supabase = await criarCliente();
    const { data } = await supabase.from("empresas").select("id, nome, logo_url").eq("id", id).maybeSingle();
    return data as { id: string; nome: string; logo_url: string | null } | null;
  }
  return (await empresasDaCentral()).find((e) => e.id === id) ?? null;
}

// O financeiro desta clínica aparece na central? A equipe vê o que o cliente veria (a chave da empresa);
// para o cliente, o banco confere o acesso e a chave. Antes da migration 0012, sempre não.
export async function financeiroNaCentral(empresaId: string, papel: Papel) {
  const supabase = await criarCliente();
  if (papel === "equipe") {
    const { data } = await supabase.from("empresas").select("financeiro_na_central").eq("id", empresaId).maybeSingle();
    return !!(data as { financeiro_na_central?: boolean } | null)?.financeiro_na_central;
  }
  const { data } = await supabase.rpc("central_financeiro_empresa", { p_empresa: empresaId });
  return !!data;
}

export async function assessoriaDaCentral() {
  const supabase = await criarCliente();
  const { data } = await supabase.rpc("central_assessoria");
  return (data ?? null) as Assessoria | null;
}

export type DiagnosticoPublicado = {
  id: string;
  periodo_inicio: string;
  periodo_fim: string;
  publicado_em: string;
  status: string;
};

export async function diagnosticosPublicados(empresaId: string) {
  const supabase = await criarCliente();
  const { data } = await supabase.rpc("central_diagnosticos", { p_empresa: empresaId });
  return (data ?? []) as DiagnosticoPublicado[];
}

type PessoaArea = { nome: string; foto_url: string | null };
export type DiagnosticoDaCentral = DiagnosticoCompleto & {
  donos_area: Partial<Record<string, PessoaArea>>;
  responsavel: PessoaArea | null;
};

const ordemCategoria = (c: string) => CATEGORIAS.indexOf(c as (typeof CATEGORIAS)[number]);

export async function diagnosticoDaCentral(id: string): Promise<DiagnosticoDaCentral> {
  const supabase = await criarCliente();
  const { data, error } = await supabase.rpc("central_diagnostico", { p_diagnostico: id });
  if (error) throw new Error(error.message);
  if (!data) notFound();
  const d = { ...data, equipe: [] } as DiagnosticoDaCentral;
  d.responsaveis_area ??= {};
  d.indicadores.sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria) || a.ordem - b.ordem);
  d.achados.sort(porPrioridade);
  d.oportunidades.sort(porPrioridade);
  d.acoes.sort(
    (a, b) =>
      Number(a.status === "Concluída") - Number(b.status === "Concluída") ||
      (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"),
  );
  return d;
}

export type IndicadorComCor = Indicador & { cor: Cor | null; anterior: number | null };

// Indicadores com a cor do semáforo e o valor do diagnóstico anterior, quando houver.
export function comCores(atual: Indicador[], anterior: Indicador[] = []): IndicadorComCor[] {
  return atual.map((i) => ({
    ...i,
    cor: corDoIndicador(i),
    anterior: anterior.find((a) => a.nome === i.nome)?.valor ?? null,
  }));
}

export type DadosEmpresaCentral = Cadastro & {
  id: string;
  nome: string;
  responsavel: { nome: string; cargo: string | null; telefone: string | null; email: string | null } | null;
};

// Cadastro da empresa para a tela "Dados da empresa" da central. Vazio se a pessoa não tem acesso
// ou se a migration 0016 ainda não foi aplicada (aí a tela avisa e o lembrete não aparece).
export async function dadosDaEmpresa(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase.rpc("central_dados_empresa", { p_empresa: empresaId });
  if (error) return null;
  return (data ?? null) as DadosEmpresaCentral | null;
}

// Faltam os dados básicos para a nota? (o lembrete na central some quando estão preenchidos)
export function faltamDados(d: DadosEmpresaCentral | null) {
  return !!d && (!d.cnpj || !d.razao_social || !d.cep || !d.responsavel);
}
