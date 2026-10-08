"use client";

import { Moon, Sun } from "lucide-react";

// Alterna entre tema claro e escuro e guarda a escolha neste navegador.
export function BotaoTema({ className }: { className?: string }) {
  function alternar() {
    const escuro = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("tema", escuro ? "escuro" : "claro");
    } catch {}
  }
  return (
    <button type="button" onClick={alternar} title="Alternar tema claro/escuro" aria-label="Alternar tema" className={className}>
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </button>
  );
}

// Roda antes da página aparecer, para não piscar no tema errado.
export const scriptTema = `try{var t=localStorage.getItem("tema");if(t==="escuro"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
