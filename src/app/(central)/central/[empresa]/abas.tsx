import { FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui";

// Diagnóstico e Financeiro na central. Só aparece quando o financeiro está ligado para a clínica.
export function AbasCentral({ empresaId, atual }: { empresaId: string; atual: "diagnostico" | "financeiro" }) {
  const abas = [
    { chave: "diagnostico", nome: "Diagnóstico", href: `/central/${empresaId}`, icone: FileText },
    { chave: "financeiro", nome: "Financeiro", href: `/central/${empresaId}/financeiro`, icone: Wallet },
  ] as const;
  return (
    <nav aria-label="Seções da central" className="mb-6 inline-flex gap-1 rounded-xl bg-slate-100 p-1">
      {abas.map((a) => {
        const ativa = a.chave === atual;
        return (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={cx(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              ativa ? "bg-superficie text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <a.icone className={cx("size-4", ativa ? "text-marca-600" : "text-slate-400")} />
            {a.nome}
          </Link>
        );
      })}
    </nav>
  );
}
