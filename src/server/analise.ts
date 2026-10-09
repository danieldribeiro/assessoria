"use server";

import { criarCliente } from "@/lib/supabase/server";
import {
  CATEGORIAS,
  CORES,
  PRIORIDADES,
  STATUS_ACHADO,
  STATUS_OPORTUNIDADE,
  type Categoria,
  type Prioridade,
} from "@/lib/dominio";
import { atualizarTelas, exigir, falha, nota, numero, responsavel, texto } from "@/server/util";

function categoria(dados: FormData): Categoria {
  const c = texto(dados, "categoria");
  return CATEGORIAS.includes(c as Categoria) ? (c as Categoria) : "Geral";
}

function priorizacao(dados: FormData) {
  const manual = texto(dados, "prioridade_manual");
  return {
    nota_impacto: nota(dados, "nota_impacto"),
    nota_urgencia: nota(dados, "nota_urgencia"),
    nota_esforco: nota(dados, "nota_esforco"),
    prioridade_manual: PRIORIDADES.includes(manual as Prioridade) ? manual : null,
  };
}

export async function salvarIndicador(diagnosticoId: string, id: string | null, dados: FormData) {
  const nome = texto(dados, "nome");
  if (!nome) return { erro: "Informe o nome do indicador." };

  const registro = {
    diagnostico_id: diagnosticoId,
    categoria: categoria(dados),
    nome,
    valor: numero(dados, "valor"),
    unidade: texto(dados, "unidade"),
    periodo: texto(dados, "periodo"),
    referencia: texto(dados, "referencia"),
    ref_min: numero(dados, "ref_min"),
    ref_max: numero(dados, "ref_max"),
    tolerancia: numero(dados, "tolerancia"),
    significado: texto(dados, "significado"),
    cor_manual: CORES.find((c) => c === dados.get("cor_manual")) ?? null,
    observacao: texto(dados, "observacao"),
    ...responsavel(dados),
  };

  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("indicadores").update(registro).eq("id", id)
    : await supabase.from("indicadores").insert({ ...registro, ordem: 999 });
  if (error) return falha(error);
  atualizarTelas();
}

export async function excluirIndicador(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("indicadores").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function salvarAchado(diagnosticoId: string, id: string | null, dados: FormData) {
  const titulo = texto(dados, "titulo");
  if (!titulo) return { erro: "Dê um título ao achado." };

  const registro = {
    diagnostico_id: diagnosticoId,
    categoria: categoria(dados),
    titulo,
    descricao: texto(dados, "descricao"),
    evidencia: texto(dados, "evidencia"),
    causa_provavel: texto(dados, "causa_provavel"),
    impacto: texto(dados, "impacto"),
    ...priorizacao(dados),
    ...responsavel(dados),
    ...(texto(dados, "status") ? { status: texto(dados, "status") } : {}),
  };

  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("achados").update(registro).eq("id", id)
    : await supabase.from("achados").insert(registro);
  if (error) return falha(error);
  atualizarTelas();
}

export async function mudarStatusAchado(id: string, status: string) {
  if (!(STATUS_ACHADO as readonly string[]).includes(status)) return;
  const supabase = await criarCliente();
  const { error } = await supabase.from("achados").update({ status }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function excluirAchado(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("achados").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function salvarOportunidade(diagnosticoId: string, id: string | null, dados: FormData) {
  const titulo = texto(dados, "titulo");
  if (!titulo) return { erro: "Dê um título à oportunidade." };

  const registro = {
    diagnostico_id: diagnosticoId,
    categoria: categoria(dados),
    titulo,
    descricao: texto(dados, "descricao"),
    potencial_impacto: texto(dados, "potencial_impacto"),
    esforco_estimado: texto(dados, "esforco_estimado"),
    ...priorizacao(dados),
    ...responsavel(dados),
    ...(texto(dados, "status") ? { status: texto(dados, "status") } : {}),
  };

  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("oportunidades").update(registro).eq("id", id)
    : await supabase.from("oportunidades").insert(registro);
  if (error) return falha(error);
  atualizarTelas();
}

export async function mudarStatusOportunidade(id: string, status: string) {
  if (!(STATUS_OPORTUNIDADE as readonly string[]).includes(status)) return;
  const supabase = await criarCliente();
  const { error } = await supabase.from("oportunidades").update({ status }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function excluirOportunidade(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("oportunidades").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}
