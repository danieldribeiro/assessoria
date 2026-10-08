"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { avisar } from "@/components/avisos";
import type { ResultadoAcao } from "@/components/painel-lateral";
import { Botao } from "@/components/ui";

// Formulário na própria página (Configurações), com o mesmo comportamento do PainelLateral.
export function Formulario({
  acao,
  aviso = "Alterações salvas",
  rotuloSalvar = "Salvar",
  children,
}: {
  acao: (dados: FormData) => Promise<ResultadoAcao>;
  aviso?: string;
  rotuloSalvar?: string;
  children: ReactNode;
}) {
  const [erro, setErro] = useState<string>();
  const [salvando, iniciar] = useTransition();

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    iniciar(async () => {
      const resultado = await acao(dados);
      setErro(resultado?.erro);
      if (!resultado?.erro) avisar(aviso);
    });
  }

  return (
    <form onSubmit={enviar}>
      <div className="space-y-4 px-5 py-5">
        {children}
        {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : rotuloSalvar}
        </Botao>
      </div>
    </form>
  );
}
