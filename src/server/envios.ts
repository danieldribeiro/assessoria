"use server";

import { criarCliente } from "@/lib/supabase/server";
import { LISTA_PADRAO, lerReferencia, type Frequencia } from "@/lib/envios";
import { atualizarTelas, exigir, falha, texto } from "@/server/util";

// Mensagens das regras do banco (0014) em português de gente.
function recusa(error: { message: string; code?: string } | null) {
  if (!error) return undefined;
  if (error.message.includes("envios_item_ativo")) return { erro: "Este item não está mais na lista. Atualize a página." };
  if (error.message.includes("envios_competencia")) return { erro: "Escolha o mês a que o arquivo se refere." };
  if (error.code === "42501") return { erro: "Você não tem permissão para enviar arquivos desta clínica." };
  return falha(error);
}

// Depois que o navegador subiu o arquivo para o armazenamento, registra o envio.
// O arquivo vai direto do navegador para o Supabase porque a Vercel não aceita arquivos grandes.
export async function registrarEnvio(
  empresaId: string,
  envio: { itemId: string | null; competencia: string | null; caminho: string; nomeArquivo: string; tamanho: number },
) {
  if (!envio.caminho.startsWith(`${empresaId}/`) || envio.caminho.includes("..")) return { erro: "Caminho do arquivo inválido." };
  const competencia = lerReferencia(envio.competencia);
  const supabase = await criarCliente();
  const { error } = await supabase.from("envios_arquivos").insert({
    empresa_id: empresaId,
    item_id: envio.itemId,
    competencia,
    caminho: envio.caminho,
    nome_arquivo: envio.nomeArquivo.slice(0, 200),
    tamanho: envio.tamanho,
  });
  if (error) return recusa(error);
  atualizarTelas();
}

// Equipe: cria a lista combinada no kit para a clínica. Só quando ela ainda não tem nenhum item.
export async function ativarListaPadrao(empresaId: string) {
  const supabase = await criarCliente();
  const { count, error: erroContagem } = await supabase
    .from("envios_itens")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId);
  exigir(erroContagem);
  if (count) return { erro: "Esta clínica já tem uma lista. Ajuste os itens um a um." };
  const { error } = await supabase
    .from("envios_itens")
    .insert(LISTA_PADRAO.map((i, n) => ({ ...i, empresa_id: empresaId, ordem: (n + 1) * 10 })));
  if (error) return falha(error);
  atualizarTelas();
}

// Equipe: cria ou edita um item da lista.
export async function salvarItem(empresaId: string, itemId: string | null, dados: FormData) {
  const nome = texto(dados, "nome");
  if (!nome) return { erro: "Informe o nome do item." };
  const frequencia = texto(dados, "frequencia") as Frequencia | null;
  if (frequencia !== "unica" && frequencia !== "semanal" && frequencia !== "mensal") return { erro: "Escolha quando o item é enviado." };
  const supabase = await criarCliente();
  const linha = { nome, dica: texto(dados, "dica"), frequencia };
  if (itemId) {
    const { error } = await supabase.from("envios_itens").update(linha).eq("id", itemId);
    if (error?.message.includes("envios_frequencia_fixa")) return { erro: "Este item já tem arquivos; para mudar quando é enviado, crie um item novo." };
    if (error) return falha(error);
  } else {
    const { data: ultimo } = await supabase
      .from("envios_itens")
      .select("ordem")
      .eq("empresa_id", empresaId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordem = ((ultimo as { ordem: number } | null)?.ordem ?? 0) + 10;
    const { error } = await supabase.from("envios_itens").insert({ ...linha, empresa_id: empresaId, ordem });
    if (error) return falha(error);
  }
  atualizarTelas();
}

// Equipe: tira o item da lista do cliente (os arquivos já recebidos continuam) ou devolve.
export async function definirItemAtivo(itemId: string, ativo: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("envios_itens").update({ ativo }).eq("id", itemId);
  exigir(error);
  atualizarTelas();
}

// Equipe: o item não vale para este mês ou esta semana (ex.: conta sem movimento).
export async function dispensarItem(empresaId: string, itemId: string, competencia: string, dados: FormData) {
  const mes = lerReferencia(competencia);
  if (!mes) return { erro: "Mês ou semana inválido." };
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("envios_dispensas")
    .insert({ empresa_id: empresaId, item_id: itemId, competencia: mes, motivo: texto(dados, "motivo") });
  if (error?.code === "23505") return { erro: "Este item já está dispensado neste mês." };
  if (error) return falha(error);
  atualizarTelas();
}

export async function desfazerDispensa(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("envios_dispensas").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}

// Equipe: apaga um arquivo enviado (ex.: mandado no item errado). O registro fica no histórico.
export async function excluirArquivo(id: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase.from("envios_arquivos").select("caminho").eq("id", id).maybeSingle();
  exigir(error);
  if (!data) return;
  const { error: erroArmazenamento } = await supabase.storage.from("envios").remove([(data as { caminho: string }).caminho]);
  exigir(erroArmazenamento);
  const { error: erroLinha } = await supabase.from("envios_arquivos").delete().eq("id", id);
  exigir(erroLinha);
  atualizarTelas();
}

