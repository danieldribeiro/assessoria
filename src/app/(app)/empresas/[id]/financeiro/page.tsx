import { ArrowLeftRight, ChevronRight, Landmark, ListTree, ReceiptText, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { hoje } from "@/lib/datas";
import { carregarBaseFinanceira } from "@/lib/financeiro/consultas";
import { AbaContasCaixa } from "./contas-caixa";
import { AbaFluxo } from "./fluxo";
import { AbaLancamentos } from "./lancamentos";
import { AbaPlanoContas } from "./plano-contas";

const ABAS: { aba: string; nome: string; icone: LucideIcon }[] = [
  { aba: "fluxo", nome: "Fluxo de caixa", icone: ArrowLeftRight },
  { aba: "lancamentos", nome: "Lançamentos", icone: ReceiptText },
  { aba: "plano", nome: "Plano de contas", icone: ListTree },
  { aba: "caixas", nome: "Contas de caixa", icone: Landmark },
];

export async function generateMetadata({ params }: PageProps<"/empresas/[id]/financeiro">) {
  const { id } = await params;
  const { empresa } = await carregarBaseFinanceira(id);
  return { title: `Financeiro · ${empresa.nome}` };
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PaginaFinanceiro({ params, searchParams }: PageProps<"/empresas/[id]/financeiro">) {
  const { id } = await params;
  const busca = await searchParams;
  const valor = (k: string) => (typeof busca[k] === "string" ? (busca[k] as string) : undefined);
  const aba = ABAS.some((a) => a.aba === valor("aba")) ? valor("aba")! : "fluxo";
  const mesAtual = hoje().slice(0, 7);
  let de = MES.test(valor("de") ?? "") ? valor("de")! : mesAtual;
  let ate = MES.test(valor("ate") ?? "") ? valor("ate")! : de;
  if (ate < de) [de, ate] = [ate, de];
  const base = valor("base") === "previsto" ? "previsto" : "realizado";

  const dados = await carregarBaseFinanceira(id);
  const { empresa } = dados;
  const periodo = { de, ate };

  return (
    <>
      <div className="mb-6">
        <Link
          href={`/empresas/${empresa.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          {empresa.nome}
          <ChevronRight className="size-3.5" />
        </Link>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">Financeiro</h1>
        <p className="mt-1 text-sm text-slate-500">Só a equipe vê e lança. Nada daqui aparece na central da clínica.</p>
      </div>

      <nav aria-label="Seções do financeiro" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="inline-flex min-w-max gap-1 rounded-xl bg-slate-100 p-1">
          {ABAS.map((a) => {
            const ativa = aba === a.aba;
            const consulta = new URLSearchParams({ aba: a.aba, de, ate });
            return (
              <li key={a.aba}>
                <Link
                  href={`/empresas/${empresa.id}/financeiro?${consulta}`}
                  aria-current={ativa ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                    ativa ? "bg-superficie text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  <a.icone className={cx("size-4", ativa ? "text-marca-600" : "text-slate-400")} />
                  {a.nome}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {aba === "fluxo" && <AbaFluxo {...dados} periodo={periodo} base={base} />}
      {aba === "lancamentos" && <AbaLancamentos {...dados} periodo={periodo} situacao={valor("situacao")} />}
      {aba === "plano" && <AbaPlanoContas {...dados} />}
      {aba === "caixas" && <AbaContasCaixa {...dados} />}
    </>
  );
}
