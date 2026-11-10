import "server-only";
import { criarCliente } from "@/lib/supabase/server";
import type { ArquivoEnvio, DispensaEnvio, ItemEnvio } from "@/lib/envios";

// Tudo o que a tela de envios precisa de uma clínica. O banco (RLS) só devolve o que a pessoa pode ver.
// Antes da migration 0014 as tabelas não existem: a tela mostra a lista vazia em vez de quebrar.
export async function carregarEnvios(empresaId: string) {
  const supabase = await criarCliente();
  const [itens, arquivos, dispensas] = await Promise.all([
    supabase.from("envios_itens").select("id, nome, dica, frequencia, ativo, ordem").eq("empresa_id", empresaId).order("ordem"),
    supabase
      .from("envios_arquivos")
      .select("id, item_id, competencia, nome_arquivo, tamanho, enviado_por, enviado_em")
      .eq("empresa_id", empresaId)
      .order("enviado_em", { ascending: false })
      .limit(1000),
    supabase.from("envios_dispensas").select("id, item_id, competencia, motivo").eq("empresa_id", empresaId),
  ]);
  return {
    disponivel: !itens.error,
    itens: (itens.data ?? []) as ItemEnvio[],
    arquivos: (arquivos.data ?? []) as ArquivoEnvio[],
    dispensas: (dispensas.data ?? []) as DispensaEnvio[],
  };
}

// Nomes de quem enviou, para a equipe. O cliente não lê perfis de outras pessoas e fica sem.
export async function nomesDePessoas(ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unicos.length) return {};
  const supabase = await criarCliente();
  const { data } = await supabase.from("perfis").select("id, nome").in("id", unicos);
  return Object.fromEntries(((data ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome ?? ""]));
}
