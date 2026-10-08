"use server";

import { redirect } from "next/navigation";
import { criarCliente } from "@/lib/supabase/server";
import { atualizarTelas, cadastro, exigir, falha, imagemEnviada, marcado, texto } from "@/server/util";

export async function salvarEmpresa(id: string | null, dados: FormData) {
  const nome = texto(dados, "nome");
  if (!nome) return { erro: "Informe o nome da empresa." };

  const supabase = await criarCliente();
  let logo_url;
  try {
    logo_url = await imagemEnviada(supabase, dados, "logo", "empresas");
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const registro = {
    nome,
    ...cadastro(dados),
    segmento: texto(dados, "segmento") ?? "Odontologia",
    observacoes: texto(dados, "observacoes"),
    ...(logo_url !== undefined && { logo_url }),
  };

  if (id) {
    const { error } = await supabase.from("empresas").update(registro).eq("id", id);
    if (error) return falha(error);
    atualizarTelas();
    return;
  }

  const { data, error } = await supabase.from("empresas").insert(registro).select("id").single();
  if (error) return falha(error);
  atualizarTelas();
  redirect(`/empresas/${data.id}`);
}

export async function excluirEmpresa(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("empresas").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
  redirect("/empresas");
}

export async function salvarContato(empresaId: string, id: string | null, dados: FormData) {
  const nome = texto(dados, "nome");
  if (!nome) return { erro: "Informe o nome do contato." };

  const registro = {
    empresa_id: empresaId,
    nome,
    cargo: texto(dados, "cargo"),
    telefone: texto(dados, "telefone"),
    email: texto(dados, "email"),
    responsavel: marcado(dados, "responsavel"),
  };

  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("contatos").update(registro).eq("id", id)
    : await supabase.from("contatos").insert(registro);
  if (error) return falha(error);
  atualizarTelas();
}

export async function excluirContato(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("contatos").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}
