"use server";

import { redirect } from "next/navigation";
import { criarCliente } from "@/lib/supabase/server";
import { texto } from "@/server/util";

export async function entrar(_estado: { erro?: string } | undefined, dados: FormData) {
  const email = texto(dados, "email");
  const senha = texto(dados, "senha");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const supabase = await criarCliente();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: "E-mail ou senha incorretos." };
  redirect("/");
}

export async function sair() {
  const supabase = await criarCliente();
  await supabase.auth.signOut();
  redirect("/login");
}
