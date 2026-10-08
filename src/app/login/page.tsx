"use client";

import { useActionState } from "react";
import { Botao, Campo, Entrada } from "@/components/ui";
import { entrar } from "@/server/sessao";

export default function Login() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-blue-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute -top-40 -right-40 size-[32rem] rounded-full bg-marca-600/40 blur-3xl"
        />
        <div aria-hidden className="absolute -bottom-32 -left-24 size-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-base font-semibold ring-1 ring-white/20">
            D
          </span>
          <span className="text-base font-semibold">Diagnósticos</span>
        </div>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Da coleta ao plano de ação, cada diagnóstico no mesmo lugar.
          </p>
          <p className="mt-4 text-blue-200">Coleta · Análise · Achados · Oportunidades · Plano de ação</p>
        </div>
        <p className="relative text-sm text-blue-200/80">Ferramenta interna da assessoria</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="mb-6 flex size-10 items-center justify-center rounded-lg bg-marca-600 text-lg font-semibold text-white lg:hidden">
              D
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Entrar</h1>
            <p className="mt-1 text-sm text-slate-500">Acesso da equipe da assessoria</p>
          </div>
          <form action={acao} className="space-y-4">
            <Campo rotulo="E-mail">
              <Entrada
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={estado?.email}
                required
                autoFocus
                className="h-11"
              />
            </Campo>
            <Campo rotulo="Senha">
              <Entrada name="senha" type="password" autoComplete="current-password" required className="h-11" />
            </Campo>
            {estado?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>}
            <Botao type="submit" className="h-11 w-full" disabled={pendente}>
              {pendente ? "Entrando…" : "Entrar"}
            </Botao>
          </form>
        </div>
      </section>
    </main>
  );
}
