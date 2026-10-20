"use client";

import { useState, type ComponentProps } from "react";
import { cx, classeInput } from "@/components/ui";
import { colarMoeda, mascararMoeda, moedaParaCampo } from "@/lib/moeda";

type Props = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type"> & {
  defaultValue?: number | string | null;
  // Controlado: o texto mascarado ("1.234,56") e o aviso de mudança.
  value?: string;
  onChange?: (texto: string) => void;
  negativo?: boolean;
};

// Campo de valor em reais com máscara. Envia "1.234,56" (sem o "R$"), que o servidor lê com lerNumeroBR.
export function EntradaMoeda({ defaultValue, value, onChange, negativo = false, className, ...props }: Props) {
  const [interno, setInterno] = useState(() => moedaParaCampo(defaultValue));
  const texto = value ?? interno;
  const mudar = (novo: string) => {
    if (value === undefined) setInterno(novo);
    onChange?.(novo);
  };

  return (
    <span className={cx("relative block", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">R$</span>
      <input
        {...props}
        type="text"
        inputMode={negativo ? "text" : "numeric"}
        autoComplete="off"
        value={texto}
        onChange={(e) => mudar(mascararMoeda(e.target.value, texto, negativo))}
        onPaste={(e) => {
          const colado = colarMoeda(e.clipboardData.getData("text"), negativo);
          if (colado === null) return;
          e.preventDefault();
          mudar(colado);
        }}
        className={cx(classeInput, "pl-9 text-right tabular-nums")}
      />
    </span>
  );
}
