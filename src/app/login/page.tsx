"use client";

import { useActionState } from "react";
import { Botao, Campo, Entrada } from "@/components/ui";
import { entrar } from "@/server/sessao";

export default function Login() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-marca-600 text-lg font-semibold text-white">
            D
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Diagnósticos</h1>
          <p className="text-sm text-slate-500">Acesso da equipe da assessoria</p>
        </div>
        <form action={acao} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Campo rotulo="E-mail">
            <Entrada name="email" type="email" autoComplete="email" required autoFocus />
          </Campo>
          <Campo rotulo="Senha">
            <Entrada name="senha" type="password" autoComplete="current-password" required />
          </Campo>
          {estado?.erro && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>
          )}
          <Botao type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Entrando…" : "Entrar"}
          </Botao>
        </form>
      </div>
    </main>
  );
}
