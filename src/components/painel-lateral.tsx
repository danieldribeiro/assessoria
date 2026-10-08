"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { avisar } from "@/components/avisos";
import { Botao, cx } from "@/components/ui";

export type ResultadoAcao = { erro?: string } | void;

// Formulário em painel lateral: o botão de abertura fica onde o componente é usado
// e o formulário abre à direita, sem sair da página.
export function PainelLateral({
  titulo,
  gatilho,
  classeGatilho,
  acao,
  rotuloSalvar = "Salvar",
  aviso = "Alterações salvas",
  rodape,
  children,
}: {
  titulo: string;
  gatilho: ReactNode;
  classeGatilho?: string;
  acao: (dados: FormData) => Promise<ResultadoAcao>;
  rotuloSalvar?: string;
  aviso?: string;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [erro, setErro] = useState<string>();
  const [chave, setChave] = useState(0);
  const [salvando, iniciar] = useTransition();

  function abrir() {
    setErro(undefined);
    setChave((c) => c + 1); // recria o formulário com os valores atuais
    dialogo.current?.showModal();
  }

  // onSubmit em vez de <form action>: assim o formulário não é limpo quando o servidor recusa.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    iniciar(async () => {
      const resultado = await acao(dados);
      if (resultado && resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      dialogo.current?.close();
      avisar(aviso);
    });
  }

  return (
    <>
      <button type="button" onClick={abrir} className={classeGatilho}>
        {gatilho}
      </button>
      <dialog
        ref={dialogo}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-lg bg-white p-0 shadow-xl"
        onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}
      >
        <form key={chave} onSubmit={enviar} className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {children}
            {erro && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
            )}
          </div>
          <div
            className={cx(
              "flex items-center gap-2 border-t border-slate-200 px-5 py-3",
              rodape ? "justify-between" : "justify-end",
            )}
          >
            {rodape}
            <div className="flex gap-2">
              <Botao type="button" variante="secundario" onClick={() => dialogo.current?.close()}>
                Cancelar
              </Botao>
              <Botao type="submit" disabled={salvando}>
                {salvando ? "Salvando…" : rotuloSalvar}
              </Botao>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
