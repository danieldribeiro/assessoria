"use client";

import { Eye, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { Botao, Campo, Entrada } from "@/components/ui";
import { autorizarClaude } from "@/server/claude";

export function TelaClaude({ campos, cancelar }: { campos: Record<string, string>; cancelar: string }) {
  const [estado, acao, pendente] = useActionState(autorizarClaude, undefined);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex size-10 items-center justify-center rounded-lg bg-marca-600 text-white">
          <ShieldCheck className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Conectar o Claude ao AXIS</h1>
        <p className="mt-2 text-sm text-slate-500">
          O Claude vai poder <b>consultar</b> empresas, diagnósticos e o financeiro que a sua conta enxerga.
        </p>
        <ul className="mt-4 space-y-2 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">
          <li className="flex gap-2">
            <Eye className="mt-0.5 size-4 shrink-0 text-slate-400" />
            Só leitura: ele não lança, não edita e não apaga nada.
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-400" />
            Você pode desconectar quando quiser nas configurações do Claude.
          </li>
        </ul>
        <form action={acao} className="mt-6 space-y-4">
          {Object.entries(campos).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Campo rotulo="E-mail">
            <Entrada name="email" type="email" autoComplete="email" defaultValue={estado?.email} required autoFocus className="h-11" />
          </Campo>
          <Campo rotulo="Senha do AXIS">
            <Entrada name="senha" type="password" autoComplete="current-password" required className="h-11" />
          </Campo>
          {estado?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>}
          <Botao type="submit" className="h-11 w-full" disabled={pendente}>
            {pendente ? "Conectando…" : "Permitir acesso de leitura"}
          </Botao>
        </form>
        <a href={cancelar} className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-900">
          Cancelar
        </a>
      </div>
    </main>
  );
}
