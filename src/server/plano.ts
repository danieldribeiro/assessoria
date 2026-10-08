"use server";

import { criarCliente } from "@/lib/supabase/server";
import { PRIORIDADES, STATUS_ACAO, type Prioridade, type StatusAcao } from "@/lib/dominio";
import { atualizarTelas, exigir, falha, texto } from "@/server/util";

// O campo "relacionado" vem como "achado:<id>" ou "oportunidade:<id>".
function relacionado(dados: FormData) {
  const valor = texto(dados, "relacionado");
  const [tipo, id] = valor?.split(":") ?? [];
  return {
    achado_id: tipo === "achado" ? id : null,
    oportunidade_id: tipo === "oportunidade" ? id : null,
  };
}

export async function salvarAcao(diagnosticoId: string, id: string | null, dados: FormData) {
  const acao = texto(dados, "acao");
  if (!acao) return { erro: "Descreva a ação." };

  const prioridade = texto(dados, "prioridade") as Prioridade;
  const status = texto(dados, "status") as StatusAcao;
  const vinculo = relacionado(dados);
  const registro = {
    diagnostico_id: diagnosticoId,
    acao,
    ...vinculo,
    responsavel: texto(dados, "responsavel"),
    prazo: texto(dados, "prazo"),
    prioridade: PRIORIDADES.includes(prioridade) ? prioridade : "Média",
    status: STATUS_ACAO.includes(status) ? status : "A fazer",
    observacoes: texto(dados, "observacoes"),
  };

  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("acoes").update(registro).eq("id", id)
    : await supabase.from("acoes").insert(registro);
  if (error) return falha(error);

  // Um item em aberto que ganhou ação passa a "endereçado no plano".
  if (vinculo.achado_id) {
    await supabase
      .from("achados")
      .update({ status: "Endereçado no plano" })
      .eq("id", vinculo.achado_id)
      .eq("status", "Aberto");
  }
  if (vinculo.oportunidade_id) {
    await supabase
      .from("oportunidades")
      .update({ status: "Endereçada no plano" })
      .eq("id", vinculo.oportunidade_id)
      .eq("status", "Aberta");
  }

  atualizarTelas();
}

export async function mudarStatusAcao(id: string, status: string) {
  if (!STATUS_ACAO.includes(status as StatusAcao)) return;
  const supabase = await criarCliente();
  const { error } = await supabase.from("acoes").update({ status }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function excluirAcao(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("acoes").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}
