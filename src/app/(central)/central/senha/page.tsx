import { CabecalhoPagina } from "@/components/ui";
import { FormularioSenha } from "./formulario";

export const metadata = { title: "Senha" };

// Trocar a senha de quem está logado. Quem chega pelo convite cria aqui a primeira senha;
// quem entrou pelo link de "Esqueci minha senha" cria a senha nova.
export default async function PaginaSenha({ searchParams }: PageProps<"/central/senha">) {
  const convite = (await searchParams).convite === "1";
  return (
    <>
      <CabecalhoPagina
        titulo={convite ? "Crie sua senha" : "Trocar senha"}
        subtitulo={
          convite
            ? "Boas-vindas ao AXIS! Crie a senha que você vai usar para entrar com o seu e-mail."
            : "Crie uma senha nova para entrar com e-mail e senha."
        }
      />
      <FormularioSenha convite={convite} />
    </>
  );
}
