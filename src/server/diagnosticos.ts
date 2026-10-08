"use server";

import { redirect } from "next/navigation";
import { criarCliente } from "@/lib/supabase/server";
import { CATEGORIAS, STATUS_DIAGNOSTICO, type ResponsaveisArea, type StatusDiagnostico } from "@/lib/dominio";
import { hoje, somarDiasUteis } from "@/lib/datas";
import { modeloDoSegmento } from "@/lib/modelos";
import { atualizarTelas, exigir, falha, texto } from "@/server/util";

function areas(dados: FormData) {
  const mapa: ResponsaveisArea = {};
  for (const c of CATEGORIAS) {
    const id = texto(dados, `area_${c}`);
    if (id) mapa[c] = id;
  }
  return mapa;
}

function periodo(dados: FormData) {
  // Campos <input type="month"> chegam como AAAA-MM.
  const inicio = texto(dados, "periodo_inicio");
  const fim = texto(dados, "periodo_fim");
  if (!inicio || !fim) return null;
  const [a, m] = fim.split("-").map(Number);
  const ultimoDia = new Date(a, m, 0).getDate();
  return { periodo_inicio: `${inicio}-01`, periodo_fim: `${fim}-${ultimoDia}` };
}

export async function criarDiagnostico(empresaId: string, dados: FormData) {
  const p = periodo(dados);
  if (!p) return { erro: "Informe o período analisado." };
  if (p.periodo_fim < p.periodo_inicio) return { erro: "O fim do período é anterior ao início." };

  const supabase = await criarCliente();
  const { data: empresa, error: erroEmpresa } = await supabase
    .from("empresas")
    .select("segmento")
    .eq("id", empresaId)
    .single();
  if (erroEmpresa) return falha(erroEmpresa);

  const dataInicio = texto(dados, "data_inicio") ?? hoje();
  const { data: diagnostico, error } = await supabase
    .from("diagnosticos")
    .insert({
      empresa_id: empresaId,
      ...p,
      data_inicio: dataInicio,
      data_prevista: texto(dados, "data_prevista"),
      responsavel_id: texto(dados, "responsavel_id"),
      responsaveis_area: areas(dados),
      pasta_url: texto(dados, "pasta_url"),
      observacoes: texto(dados, "observacoes"),
    })
    .select("id")
    .single();
  if (error) return falha(error);

  const modelo = modeloDoSegmento(empresa.segmento);
  const [solicitacoes, indicadores] = await Promise.all([
    supabase.from("solicitacoes").insert(
      modelo.solicitacoes.map((s, i) => ({ ...s, diagnostico_id: diagnostico.id, ordem: i })),
    ),
    supabase.from("indicadores").insert(
      modelo.indicadores.map((s, i) => ({ ...s, diagnostico_id: diagnostico.id, ordem: i })),
    ),
  ]);
  if (solicitacoes.error || indicadores.error) return falha(solicitacoes.error ?? indicadores.error);

  atualizarTelas();
  redirect(`/diagnosticos/${diagnostico.id}?aba=coleta`);
}

export async function atualizarDiagnostico(id: string, dados: FormData) {
  const p = periodo(dados);
  if (!p) return { erro: "Informe o período analisado." };
  if (p.periodo_fim < p.periodo_inicio) return { erro: "O fim do período é anterior ao início." };

  const supabase = await criarCliente();
  const { error } = await supabase
    .from("diagnosticos")
    .update({
      ...p,
      data_inicio: texto(dados, "data_inicio") ?? hoje(),
      data_prevista: texto(dados, "data_prevista"),
      responsavel_id: texto(dados, "responsavel_id"),
      responsaveis_area: areas(dados),
      pasta_url: texto(dados, "pasta_url"),
      observacoes: texto(dados, "observacoes"),
    })
    .eq("id", id);
  if (error) return falha(error);
  atualizarTelas();
}

export async function salvarConclusoes(id: string, dados: FormData) {
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("diagnosticos")
    .update({
      situacao_atual: texto(dados, "situacao_atual"),
      recomendacoes: texto(dados, "recomendacoes"),
    })
    .eq("id", id);
  if (error) return falha(error);
  atualizarTelas();
}

export async function mudarStatusDiagnostico(id: string, status: string) {
  if (!STATUS_DIAGNOSTICO.includes(status as StatusDiagnostico)) return;
  const supabase = await criarCliente();
  const { error } = await supabase.from("diagnosticos").update({ status }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

// Prazo padrão: 5 dias úteis a partir do recebimento de todas as informações.
export async function definirEntregaAPartirDeHoje(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("diagnosticos")
    .update({ data_prevista: somarDiasUteis(hoje(), 5) })
    .eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function excluirDiagnostico(id: string, empresaId: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("diagnosticos").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
  redirect(`/empresas/${empresaId}`);
}
