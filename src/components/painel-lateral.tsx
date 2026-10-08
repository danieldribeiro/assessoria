"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Botao, cx } from "@/components/ui";

export type ResultadoAcao = { erro?: string } | void;

function BotaoSalvar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Botao>
  );
}

// Formulário em painel lateral: o botão de abertura fica onde o componente é usado
// e o formulário abre à direita, sem sair da página.
export function PainelLateral({
  titulo,
  gatilho,
  classeGatilho,
  acao,
  rotuloSalvar = "Salvar",
  rodape,
  children,
}: {
  titulo: string;
  gatilho: ReactNode;
  classeGatilho?: string;
  acao: (dados: FormData) => Promise<ResultadoAcao>;
  rotuloSalvar?: string;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [erro, setErro] = useState<string>();
  const [chave, setChave] = useState(0);

  function abrir() {
    setErro(undefined);
    setChave((c) => c + 1); // recria o formulário com os valores atuais
    dialogo.current?.showModal();
  }

  async function enviar(dados: FormData) {
    const resultado = await acao(dados);
    if (resultado && resultado.erro) {
      setErro(resultado.erro);
      return;
    }
    dialogo.current?.close();
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
        <form key={chave} action={enviar} className="flex h-full flex-col">
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
              <BotaoSalvar rotulo={rotuloSalvar} />
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
