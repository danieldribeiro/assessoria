import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, variaveisFaltando } from "@/lib/supabase/config";

// Sem as variáveis do Supabase nada funciona; melhor dizer o que falta do que um erro 500 genérico.
function paginaConfiguracao(faltando: string[]) {
  const itens = faltando.map((v) => `<li><code>${v}</code></li>`).join("");
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Configuração pendente</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 16px;color:#0f172a">
<h1 style="font-size:20px">Configuração pendente</h1>
<p>O sistema não encontrou estas variáveis de ambiente:</p><ul>${itens}</ul>
<p>Na Vercel, abra <b>Settings → Environment Variables</b>, cadastre-as com os valores de
<b>Supabase → Project Settings → API</b> e depois faça um novo deploy
(<b>Deployments → ⋯ → Redeploy</b>). As variáveis só valem a partir do próximo deploy.</p>
</body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// Renova a sessão do Supabase e manda quem não está logado para /login.
export async function proxy(request: NextRequest) {
  const faltando = variaveisFaltando();
  if (faltando.length) return paginaConfiguracao(faltando);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const naLogin = request.nextUrl.pathname.startsWith("/login");
  if (!user && !naLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && naLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
