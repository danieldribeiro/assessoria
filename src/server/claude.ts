"use server";

import { redirect } from "next/navigation";
import { selar } from "@/lib/mcp/cripto";
import { clienteAvulso, clienteRegistrado } from "@/lib/mcp/http";
import { lerPedidoAutorizacao, urlDeRetorno, VALIDADE } from "@/lib/mcp/oauth";
import { texto } from "@/server/util";

// Login do Claude no Axis. Pede a senha de novo de propósito: cria uma sessão separada da do navegador, que o
// Claude renova sozinho sem derrubar o login de quem está usando o site.
export async function autorizarClaude(_estado: { erro?: string; email?: string } | undefined, dados: FormData) {
  const lido = lerPedidoAutorizacao((k) => texto(dados, k), clienteRegistrado);
  if ("erro" in lido) return { erro: lido.erro };
  const { pedido } = lido;
  const email = texto(dados, "email");
  const senha = texto(dados, "senha");
  if (!email || !senha) return { erro: "Informe e-mail e senha.", email: email ?? undefined };

  const supabase = clienteAvulso();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return { erro: "E-mail ou senha incorretos.", email };

  // Por enquanto só a equipe da assessoria conecta o Claude; donos de clínica entram pela central.
  const { data: perfil } = await supabase.from("perfis").select("papel").eq("id", data.user.id).maybeSingle();
  if (perfil?.papel !== "equipe") {
    await supabase.auth.signOut({ scope: "local" });
    return { erro: "Só a equipe da assessoria pode conectar o Claude.", email };
  }

  const codigo = selar(
    "codigo",
    {
      at: data.session.access_token,
      atExp: data.session.expires_at,
      rt: data.session.refresh_token,
      uid: data.user.id,
      cc: pedido.desafio,
      ru: pedido.redirectUri,
      cid: pedido.clientId,
    },
    VALIDADE.codigo,
  );
  redirect(urlDeRetorno(pedido.redirectUri, { code: codigo, state: pedido.state }));
}
