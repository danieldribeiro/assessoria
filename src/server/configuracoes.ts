"use server";

import { criarCliente } from "@/lib/supabase/server";
import { atualizarTelas, cadastro, falha, imagemEnviada, texto } from "@/server/util";

// Cada pessoa edita só o próprio perfil.
export async function salvarPerfil(dados: FormData) {
  const nome = texto(dados, "nome");
  if (!nome) return { erro: "Informe seu nome." };

  const supabase = await criarCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sua sessão expirou. Entre de novo." };

  try {
    const foto_url = await imagemEnviada(supabase, dados, "foto", "perfis");
    const registro = {
      nome,
      cargo: texto(dados, "cargo"),
      telefone: texto(dados, "telefone"),
      ...(foto_url !== undefined && { foto_url }),
    };
    const { error } = await supabase.from("perfis").update(registro).eq("id", user.id);
    if (error) return falha(error);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  atualizarTelas();
}

export async function salvarAssessoria(dados: FormData) {
  const supabase = await criarCliente();
  try {
    const logo_url = await imagemEnviada(supabase, dados, "logo", "assessoria");
    const registro = {
      id: true,
      ...cadastro(dados),
      nome_fantasia: texto(dados, "nome_fantasia"),
      regime_tributario: texto(dados, "regime_tributario"),
      site: texto(dados, "site"),
      ...(logo_url !== undefined && { logo_url }),
    };
    const { error } = await supabase.from("assessoria").upsert(registro);
    if (error) return falha(error);
  } catch (e) {
    return { erro: (e as Error).message };
  }
  atualizarTelas();
}
