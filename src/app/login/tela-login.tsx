"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao, Campo, Entrada } from "@/components/ui";
import { pedirLink } from "@/server/central";
import { entrar } from "@/server/sessao";

// Equipe entra com senha; o dono da clínica recebe um link por e-mail.
export function TelaLogin({ modoInicial, erroLink }: { modoInicial: "senha" | "link"; erroLink: boolean }) {
  const [modo, setModo] = useState(modoInicial);
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  const [link, pedir, pedindo] = useActionState(pedirLink, undefined);

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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {modo === "senha" ? "Entrar" : "Central da clínica"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {modo === "senha"
                ? "Acesso da equipe da assessoria"
                : "Receba no seu e-mail um link para entrar, sem senha."}
            </p>
          </div>
          {modo === "senha" ? (
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
          ) : link?.enviado ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
              <MailCheck className="mb-2 size-6" />
              Se este e-mail tiver acesso, o link chega em instantes. Abra o e-mail neste aparelho e toque em “Entrar”.
              Confira também a caixa de spam.
            </div>
          ) : (
            <form action={pedir} className="space-y-4">
              <Campo rotulo="Seu e-mail">
                <Entrada name="email" type="email" autoComplete="email" required autoFocus className="h-11" />
              </Campo>
              {(link?.erro || erroLink) && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {link?.erro ?? "Este link expirou ou já foi usado. Peça um novo."}
                </p>
              )}
              <Botao type="submit" className="h-11 w-full" disabled={pedindo}>
                {pedindo ? "Enviando…" : "Receber link de acesso"}
              </Botao>
            </form>
          )}
          <button
            type="button"
            onClick={() => setModo(modo === "senha" ? "link" : "senha")}
            className="mt-6 w-full text-center text-sm text-slate-500 hover:text-slate-900"
          >
            {modo === "senha" ? "É dono de clínica? Entre com um link por e-mail" : "Sou da equipe da assessoria"}
          </button>
        </div>
      </section>
    </main>
  );
}
