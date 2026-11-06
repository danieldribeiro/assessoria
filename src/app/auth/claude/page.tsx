import { clienteRegistrado } from "@/lib/mcp/http";
import { segredoConfigurado } from "@/lib/mcp/cripto";
import { lerPedidoAutorizacao, urlDeRetorno } from "@/lib/mcp/oauth";
import { TelaClaude } from "./tela";

export const metadata = { title: "Conectar o Claude" };

// Tela que o Claude abre para a pessoa autorizar o conector (passo "authorize" do OAuth).
export default async function ConectarClaude({ searchParams }: PageProps<"/auth/claude">) {
  const busca = await searchParams;
  const ler = (k: string) => (typeof busca[k] === "string" ? (busca[k] as string) : null);
  const lido = segredoConfigurado() ? lerPedidoAutorizacao(ler, clienteRegistrado) : { erro: "O conector do Claude ainda não foi ligado neste ambiente." };

  if ("erro" in lido) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-slate-900">Não foi possível conectar</h1>
          <p className="mt-2 text-sm text-slate-500">{lido.erro}</p>
        </div>
      </main>
    );
  }
  const campos = Object.fromEntries(
    ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "resource"]
      .map((k) => [k, ler(k)])
      .filter(([, v]) => v !== null),
  ) as Record<string, string>;
  const cancelar = urlDeRetorno(lido.pedido.redirectUri, { error: "access_denied", state: lido.pedido.state });
  return <TelaClaude campos={campos} cancelar={cancelar} />;
}
