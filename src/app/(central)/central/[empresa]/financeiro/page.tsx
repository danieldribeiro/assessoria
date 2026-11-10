import { ArrowLeftRight, CalendarClock, LayoutDashboard, ReceiptText, Scale, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoEmpresa, cx } from "@/components/ui";
import { empresaDaCentral, financeiroNaCentral, perfilAtual } from "@/lib/central";
import { hoje } from "@/lib/datas";
import { carregarBaseFinanceira } from "@/lib/financeiro/consultas";
import { ORDENS, type Ordem } from "@/lib/financeiro/painel";
import { lerPeriodo } from "@/lib/financeiro/periodo";
import { HORIZONTES } from "@/lib/financeiro/projecao";
import { AbaAPagar } from "@/app/(app)/empresas/[id]/financeiro/apagar";
import { AbaFluxo } from "@/app/(app)/empresas/[id]/financeiro/fluxo";
import { AbaLancamentos } from "@/app/(app)/empresas/[id]/financeiro/lancamentos";
import { AbaPainel, lerFiltros } from "@/app/(app)/empresas/[id]/financeiro/painel";
import { AbaResultado } from "@/app/(app)/empresas/[id]/financeiro/resultado";
import { AbasCentral } from "../abas";

// Financeiro na central da clínica: as mesmas telas da equipe, só para ver.
// Quem decide o que volta é o banco (pode_usar_financeiro): o cliente só lê, e só com a chave da empresa ligada.
const ABAS: { aba: string; nome: string; icone: LucideIcon }[] = [
  { aba: "painel", nome: "Painel", icone: LayoutDashboard },
  { aba: "resultado", nome: "Resultado", icone: Scale },
  { aba: "fluxo", nome: "Fluxo de caixa", icone: ArrowLeftRight },
  { aba: "apagar", nome: "A pagar e receber", icone: CalendarClock },
  { aba: "lancamentos", nome: "Lançamentos", icone: ReceiptText },
];

export const metadata = { title: "Financeiro" };

export default async function PaginaCentralFinanceiro({ params, searchParams }: PageProps<"/central/[empresa]/financeiro">) {
  const { empresa: empresaId } = await params;
  const busca = await searchParams;
  const valor = (k: string) => (typeof busca[k] === "string" ? (busca[k] as string) : undefined);

  const perfil = await perfilAtual();
  if (!perfil) notFound();
  const [empresa, ligado] = await Promise.all([empresaDaCentral(empresaId, perfil.papel), financeiroNaCentral(empresaId, perfil.papel)]);
  if (!empresa || !ligado) notFound();

  const periodo = lerPeriodo(valor("de"), valor("ate"), hoje());
  const { de, ate } = periodo;
  const dados = await carregarBaseFinanceira(empresaId, "central");
  const aba = ABAS.some((a) => a.aba === valor("aba")) ? valor("aba")! : "painel";
  const filtros = lerFiltros(valor, dados.contas, dados.caixas, dados.contrapartes);
  const ordem = (valor("ordem") ?? "") in ORDENS ? (valor("ordem") as Ordem) : "recentes";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <LogoEmpresa nome={empresa.nome} logo={empresa.logo_url} largo className="size-14 text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{empresa.nome}</h1>
          <p className="mt-1 text-sm text-slate-500">Financeiro organizado pela assessoria. Para corrigir algo, fale com a assessoria.</p>
        </div>
      </div>
      <AbasCentral empresaId={empresaId} atual="financeiro" financeiro />

      <nav aria-label="Seções do financeiro" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="inline-flex min-w-max gap-1 border-b border-slate-200">
          {ABAS.map((a) => {
            const ativa = aba === a.aba;
            return (
              <li key={a.aba}>
                <Link
                  href={`/central/${empresaId}/financeiro?${new URLSearchParams({ aba: a.aba, de, ate })}`}
                  aria-current={ativa ? "page" : undefined}
                  className={cx(
                    "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                    ativa ? "border-marca-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
                  )}
                >
                  <a.icone className={cx("size-4 shrink-0", ativa ? "text-marca-600" : "text-slate-400")} />
                  {a.nome}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {aba === "painel" && (
        <AbaPainel {...dados} periodo={periodo} base={valor("visao") === "caixa" ? "caixa" : "competencia"} filtros={filtros} somenteLeitura />
      )}
      {aba === "resultado" && <AbaResultado {...dados} periodo={periodo} filtros={filtros} />}
      {aba === "fluxo" && (
        <AbaFluxo
          {...dados}
          periodo={periodo}
          base={valor("base") === "previsto" ? "previsto" : "realizado"}
          horizonte={HORIZONTES.find((h) => String(h) === valor("horizonte")) ?? 30}
        />
      )}
      {aba === "apagar" && <AbaAPagar {...dados} somenteLeitura />}
      {aba === "lancamentos" && (
        <AbaLancamentos
          {...dados}
          periodo={periodo}
          situacao={valor("situacao")}
          criterio={valor("data") === "competencia" ? "competencia" : "movimento"}
          filtros={filtros}
          ordem={ordem}
          somenteLeitura
        />
      )}
    </>
  );
}
