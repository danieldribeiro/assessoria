"use server";

import { headers } from "next/headers";
import { criarClienteAdmin } from "@/lib/supabase/admin";
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

// Libera o e-mail na central e já manda o convite: a pessoa toca no link, cria a senha e entra.
// Quem já tem login no AXIS (por outra clínica, por exemplo) só ganha o acesso novo, sem convite.
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

  const convite = await convidar(email);
  if (convite === "enviado" || convite === "ja_tem_senha") return;
  return {
    erro: `Acesso liberado, mas o convite não saiu: ${MOTIVO[convite]} Use “Reenviar convite” na lista.`,
  };
}

// Manda o convite de novo (link vencido, e-mail perdido). Só para quem ainda não criou a senha.
export async function reenviarConvite(acessoId: string) {
  const supabase = await criarCliente();
  const { data: acesso } = await supabase.from("acessos_central").select("email").eq("id", acessoId).maybeSingle();
  if (!acesso?.email) return { erro: "Acesso não encontrado." };
  const convite = await convidar(acesso.email);
  if (convite === "enviado") return;
  if (convite === "ja_tem_senha")
    return {
      erro: "Esta pessoa já criou a senha. Se esqueceu, ela usa “Esqueci minha senha” na tela de entrada.",
    };
  return { erro: `O convite não saiu: ${MOTIVO[convite]}` };
}

type Convite = "enviado" | "ja_tem_senha" | "sem_chave" | "limite" | "falhou";

const MOTIVO: Record<Exclude<Convite, "enviado" | "ja_tem_senha">, string> = {
  sem_chave: "falta a chave SUPABASE_SERVICE_ROLE_KEY na Vercel.",
  limite: "o limite de e-mails por hora foi atingido. Tente de novo mais tarde.",
  falhou: "erro ao enviar o e-mail. Tente de novo em alguns minutos.",
};

// Cria a conta e envia o e-mail de convite pelo Supabase. Antes, confere que quem pede é da equipe,
// porque o cliente admin passa por cima das regras do banco.
async function convidar(email: string): Promise<Convite> {
  const supabase = await criarCliente();
  const { data: equipe } = await supabase.rpc("eh_equipe");
  if (equipe !== true) return "falhou";

  const admin = criarClienteAdmin();
  if (!admin) return "sem_chave";

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await origem()}/auth/confirmar`,
  });
  if (!error) return "enviado";
  if (error.code === "email_exists" || /already been registered/i.test(error.message)) return "ja_tem_senha";
  if (error.code === "over_email_send_rate_limit" || error.status === 429) return "limite";
  console.error(error);
  return "falhou";
}

async function origem() {
  const cabecalhos = await headers();
  return cabecalhos.get("origin") ?? `https://${cabecalhos.get("host")}`;
}

export async function removerAcesso(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("acessos_central").delete().eq("id", id);
  exigir(error);
  atualizarTelas();
}

// Liga ou desliga o financeiro (só leitura) na central desta clínica.
export async function definirFinanceiroNaCentral(empresaId: string, ligado: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("empresas").update({ financeiro_na_central: ligado }).eq("id", empresaId);
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${await origem()}/auth/confirmar`, shouldCreateUser: true },
    });
    if (error) {
      console.error(error);
      return { erro: "Não foi possível enviar o link agora. Tente de novo em alguns minutos." };
    }
  }
  return { enviado: true };
}
