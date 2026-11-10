import { CabecalhoPagina } from "@/components/ui";
import { FormularioSenha } from "./formulario";

export const metadata = { title: "Trocar senha" };

// Trocar a senha de quem está logado. Quem entrou pelo link de "Esqueci minha senha" cria a senha nova aqui.
export default function PaginaSenha() {
  return (
    <>
      <CabecalhoPagina titulo="Trocar senha" subtitulo="Crie uma senha nova para entrar com e-mail e senha." />
      <FormularioSenha />
    </>
  );
}
