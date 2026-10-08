"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };

// Confirmação discreta depois de salvar ("Salvo", "Status atualizado").
export function avisar(texto: string, tipo: Aviso["tipo"] = "ok") {
  window.dispatchEvent(new CustomEvent("aviso", { detail: { texto, tipo } }));
}

let proximo = 0;

export function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    function receber(e: Event) {
      const { texto, tipo } = (e as CustomEvent<Omit<Aviso, "id">>).detail;
      const id = ++proximo;
      setAvisos((lista) => [...lista.slice(-2), { id, texto, tipo }]);
      setTimeout(() => setAvisos((lista) => lista.filter((a) => a.id !== id)), tipo === "erro" ? 6000 : 2500);
    }
    window.addEventListener("aviso", receber);
    return () => window.removeEventListener("aviso", receber);
  }, []);

  return (
    <div
      aria-live="polite"
      className="nao-imprimir pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {avisos.map((a) => (
        <div
          key={a.id}
          role={a.tipo === "erro" ? "alert" : "status"}
          className={cx(
            "aviso-entrada flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg",
            a.tipo === "erro" ? "bg-red-600 text-white" : "bg-slate-900 text-white",
          )}
        >
          <span aria-hidden>{a.tipo === "erro" ? "!" : "✓"}</span>
          {a.texto}
        </div>
      ))}
    </div>
  );
}
