import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { criarCliente } from "@/lib/supabase/server";

// Destino dos links enviados por e-mail: troca o código pela sessão e abre a central.
// Quem chega pelo convite vai direto criar a senha.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await criarCliente();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && tipo
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
      : { error: new Error("Link sem código") };

  if (error) return NextResponse.redirect(new URL("/login?modo=link&erro=link", request.url));
  const destino = tipo === "invite" ? "/central/senha?convite=1" : "/central";
  return NextResponse.redirect(new URL(destino, request.url));
}
