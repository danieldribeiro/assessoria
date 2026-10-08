"use client";

import { classeBotao } from "@/components/ui";

export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className={classeBotao("primario")}>
      Imprimir / Salvar PDF
    </button>
  );
}
