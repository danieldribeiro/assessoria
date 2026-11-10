"use server";

import { redirect } from "next/navigation";
import { criarCliente } from "@/lib/supabase/server";
import { texto } from "@/server/util";

export async function entrar(_estado: { erro?: string; email?: string } | undefined, dados: FormData) {
  const email = texto(dados, "email");
  const senha = texto(dados, "senha");
  if (!email || !senha) return { erro: "Informe e-mail e senha.", email: email ?? undefined };

  const supabase = await criarCliente();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: "E-mail ou senha incorretos.", email };
  redirect("/");
}

// Troca a senha de quem está logado (cliente ou equipe). Usado também depois do link de "Esqueci minha senha".
export async function trocarSenha(_estado: { erro?: string; ok?: boolean } | undefined, dados: FormData) {
  const senha = texto(dados, "senha") ?? "";
  const confirmacao = texto(dados, "confirmacao") ?? "";
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== confirmacao) return { erro: "As duas senhas não são iguais." };

  const supabase = await criarCliente();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    if (error.code === "same_password") return { erro: "A senha nova precisa ser diferente da atual." };
    if (error.code === "weak_password") return { erro: "Senha fraca. Use letras e números, com pelo menos 8 caracteres." };
    console.error(error);
    return { erro: "Não foi possível trocar a senha agora. Entre de novo e tente outra vez." };
  }
  return { ok: true };
}

export async function sair() {
  const supabase = await criarCliente();
  await supabase.auth.signOut();
  redirect("/login");
}
