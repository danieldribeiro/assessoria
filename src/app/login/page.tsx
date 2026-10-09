import { TelaLogin } from "./tela-login";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { modo, erro } = await searchParams;
  return <TelaLogin modoInicial={modo === "link" ? "link" : "senha"} erroLink={erro === "link"} />;
}
