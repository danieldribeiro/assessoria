"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Botao, Campo, Cartao, Entrada } from "@/components/ui";
import { trocarSenha } from "@/server/sessao";

export function FormularioSenha({ convite = false }: { convite?: boolean }) {
  const [estado, acao, pendente] = useActionState(trocarSenha, undefined);

  if (estado?.ok)
    return (
      <Cartao className="max-w-md p-5 text-sm text-slate-700">
        <CircleCheck className="mb-2 size-6 text-emerald-600" />
        {convite ? "Senha criada." : "Senha trocada."} Da próxima vez, entre com o seu e-mail e esta senha.
        <Link href="/central" className="mt-4 block font-medium text-marca-700 hover:underline">
          {convite ? "Ir para a central" : "Voltar para a central"}
        </Link>
      </Cartao>
    );

  return (
    <Cartao className="max-w-md p-5">
      <form action={acao} className="space-y-4">
        <Campo rotulo={convite ? "Senha" : "Senha nova"} dica="Pelo menos 8 caracteres.">
          <Entrada name="senha" type="password" autoComplete="new-password" minLength={8} required autoFocus className="h-11" />
        </Campo>
        <Campo rotulo={convite ? "Repita a senha" : "Repita a senha nova"}>
          <Entrada name="confirmacao" type="password" autoComplete="new-password" minLength={8} required className="h-11" />
        </Campo>
        {estado?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>}
        <Botao type="submit" className="h-11 w-full" disabled={pendente}>
          {pendente ? "Salvando…" : convite ? "Criar senha e entrar" : "Salvar senha nova"}
        </Botao>
      </form>
    </Cartao>
  );
}
