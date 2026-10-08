"use server";

import { criarCliente } from "@/lib/supabase/server";
import { CATEGORIAS, STATUS_SOLICITACAO, type Categoria, type StatusSolicitacao } from "@/lib/dominio";
import { hoje } from "@/lib/datas";
import { atualizarTelas, exigir, falha, texto } from "@/server/util";

function categoria(dados: FormData): Categoria {
  const c = texto(dados, "categoria");
  return CATEGORIAS.includes(c as Categoria) ? (c as Categoria) : "Geral";
}

export async function salvarSolicitacao(diagnosticoId: string, id: string | null, dados: FormData) {
  const item = texto(dados, "item");
  if (!item) return { erro: "Descreva o item solicitado." };

  const status = (texto(dados, "status") ?? "Pendente") as StatusSolicitacao;
  const registro = {
    diagnostico_id: diagnosticoId,
    categoria: categoria(dados),
    item,
    status: STATUS_SOLICITACAO.includes(status) ? status : "Pendente",
    data_solicitacao: texto(dados, "data_solicitacao"),
    data_recebimento: texto(dados, "data_recebimento"),
    link: texto(dados, "link"),
    observacao: texto(dados, "observacao"),
  };

  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("solicitacoes").update(registro).eq("id", id)
    : await supabase.from("solicitacoes").insert({ ...registro, ordem: 999 });
  if (error) return falha(error);
  atualizarTelas();
}

// Ao mudar o status, preenche a data correspondente se ainda estiver vazia.
export async function mudarStatusSolicitacao(id: string, status: string) {
  if (!STATUS_SOLICITACAO.includes(status as StatusSolicitacao)) return;
  const supabase = await criarCliente();
  const { data: atual, error: erroLeitura } = await supabase
    .from("solicitacoes")
    .select("data_solicitacao, data_recebimento")
    .eq("id", id)
    .single();
  exigir(erroLeitura);

  const mudanca: Record<string, string | null> = { status };
  if ((status === "Solicitado" || status === "Recebido") && !atual!.data_solicitacao) {
    mudanca.data_solicitacao = hoje();
  }
  if (status === "Recebido" && !atual!.data_recebimento) mudanca.data_recebimento = hoje();
  if (status !== "Recebido") mudanca.data_recebimento = null;

  const { error } = await supabase.from("solicitacoes").update(mudanca).eq("id", id);
  exigir(error);
  atualizarTelas();
}

// Marca como solicitados, de uma vez, todos os itens ainda pendentes.
export async function solicitarPendentes(diagnosticoId: string) {
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("solicitacoes")
    .update({ status: "Solicitado", data_solicitacao: hoje() })
    .eq("diagnostico_id", diagnosticoId)
    .eq("status", "Pendente");
  exigir(error);
  atualizarTelas();
}

export async function excluirSolicitacao(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("solicitacoes").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}
