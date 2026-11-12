import { Building2, FileText, Upload, Wallet } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui";

// Seções da central. O Financeiro só aparece quando está ligado para a clínica.
export function AbasCentral({
  empresaId,
  atual,
  financeiro,
}: {
  empresaId: string;
  atual: "diagnostico" | "financeiro" | "arquivos" | "dados";
  financeiro: boolean;
}) {
  const abas = [
    { chave: "diagnostico", nome: "Diagnóstico", href: `/central/${empresaId}`, icone: FileText },
    ...(financeiro ? [{ chave: "financeiro", nome: "Financeiro", href: `/central/${empresaId}/financeiro`, icone: Wallet }] : []),
    { chave: "arquivos", nome: "Arquivos", href: `/central/${empresaId}/arquivos`, icone: Upload },
    { chave: "dados", nome: "Dados da empresa", href: `/central/${empresaId}/dados`, icone: Building2 },
  ];
  return (
    <nav aria-label="Seções da central" className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {abas.map((a) => {
        const ativa = a.chave === atual;
        return (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={cx(
              "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
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
