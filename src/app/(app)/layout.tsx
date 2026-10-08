import { Avisos } from "@/components/avisos";
import { Navegacao } from "@/components/navegacao";
import { criarCliente } from "@/lib/supabase/server";
import { sair } from "@/server/sessao";

function saudacaoAgora() {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    ),
  );
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const supabase = await criarCliente();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("perfis").select("nome").eq("id", user.id).maybeSingle()
    : { data: null };

  const email = user?.email ?? "";
  return (
    <div className="min-h-dvh">
      <Navegacao saudacao={saudacaoAgora()} usuario={{ nome: perfil?.nome ?? email, email }} sair={sair} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      <Avisos />
    </div>
  );
}
