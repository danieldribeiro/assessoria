"use server";

import { headers } from "next/headers";
import { criarCliente } from "@/lib/supabase/server";
import { atualizarTelas, exigir, falha, texto } from "@/server/util";

export async function publicarDiagnostico(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("diagnosticos").update({ publicado_em: new Date().toISOString() }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function despublicarDiagnostico(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("diagnosticos").update({ publicado_em: null }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function salvarRecado(id: string, dados: FormData) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("diagnosticos").update({ recado: texto(dados, "recado") }).eq("id", id);
  if (error) return falha(error);
  atualizarTelas();
}

export async function liberarAcesso(empresaId: string, dados: FormData) {
  const email = texto(dados, "email")?.toLowerCase();
  if (!email || !email.includes("@")) return { erro: "Informe um e-mail válido." };
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("acessos_central")
    .insert({ empresa_id: empresaId, email, nome: texto(dados, "nome") });
  if (error?.code === "23505") return { erro: "Este e-mail já tem acesso a esta clínica." };
  if (error) return falha(error);
  atualizarTelas();
}

export async function removerAcesso(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("acessos_central").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}

export async function definirPapel(perfilId: string, papel: "equipe" | "cliente") {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("definir_papel", { p_perfil: perfilId, p_papel: papel });
  exigir(error);
  atualizarTelas();
}

// Login da central: manda um link de acesso para o e-mail, sem senha.
// Só envia para e-mails liberados, mas a resposta é a mesma para não revelar quem é cliente.
export async function pedirLink(_estado: { enviado?: boolean; erro?: string } | undefined, dados: FormData) {
  const email = texto(dados, "email")?.toLowerCase();
  if (!email) return { erro: "Informe seu e-mail." };

  const supabase = await criarCliente();
  const { data: liberado } = await supabase.rpc("pode_receber_link", { p_email: email });
  if (liberado) {
    const cabecalhos = await headers();
    const origem = cabecalhos.get("origin") ?? `https://${cabecalhos.get("host")}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origem}/auth/confirmar`, shouldCreateUser: true },
    });
    if (error) {
      console.error(error);
      return { erro: "Não foi possível enviar o link agora. Tente de novo em alguns minutos." };
    }
  }
  return { enviado: true };
}
