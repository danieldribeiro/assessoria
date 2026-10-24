import { ArrowLeftRight, CalendarClock, ChevronRight, CreditCard, FileText, Landmark, LayoutDashboard, ListTree, ReceiptText, Scale, Store, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { hoje } from "@/lib/datas";
import { carregarBaseFinanceira } from "@/lib/financeiro/consultas";
import { AbaAPagar } from "./apagar";
import { AbaCartoes } from "./cartoes";
import { AbaContasCaixa } from "./contas-caixa";
import { AbaExtratos } from "./extratos";
import { AbaFluxo } from "./fluxo";
import { AbaFornecedores } from "./fornecedores";
import { ORDENS, type Ordem } from "@/lib/financeiro/painel";
import { lerPeriodo } from "@/lib/financeiro/periodo";
import { AbaLancamentos } from "./lancamentos";
import { AbaPainel, lerFiltros } from "./painel";
import { AbaPlanoContas } from "./plano-contas";
import { AbaResultado } from "./resultado";

const ABAS: { aba: string; nome: string; icone: LucideIcon; recurso?: "fornecedores" | "extratos" | "cartoes" }[] = [
  { aba: "painel", nome: "Painel", icone: LayoutDashboard },
  { aba: "resultado", nome: "Resultado", icone: Scale },
  { aba: "fluxo", nome: "Fluxo de caixa", icone: ArrowLeftRight },
  { aba: "apagar", nome: "A pagar e receber", icone: CalendarClock },
  { aba: "lancamentos", nome: "Lançamentos", icone: ReceiptText },
  { aba: "cartoes", nome: "Cartões", icone: CreditCard, recurso: "cartoes" },
  { aba: "extratos", nome: "Extratos", icone: FileText, recurso: "extratos" },
  { aba: "fornecedores", nome: "Fornecedores", icone: Store, recurso: "fornecedores" },
  { aba: "plano", nome: "Plano de contas", icone: ListTree },
  { aba: "caixas", nome: "Contas de caixa", icone: Landmark },
];

export async function generateMetadata({ params }: PageProps<"/empresas/[id]/financeiro">) {
  const { id } = await params;
  const { empresa } = await carregarBaseFinanceira(id);
  return { title: `Financeiro · ${empresa.nome}` };
}

export default async function PaginaFinanceiro({ params, searchParams }: PageProps<"/empresas/[id]/financeiro">) {
  const { id } = await params;
  const busca = await searchParams;
  const valor = (k: string) => (typeof busca[k] === "string" ? (busca[k] as string) : undefined);
  const periodo = lerPeriodo(valor("de"), valor("ate"), hoje());
  const { de, ate } = periodo;
  const base = valor("base") === "previsto" ? "previsto" : "realizado";

  const dados = await carregarBaseFinanceira(id);
  const { empresa } = dados;
  // Abas das migrations 0009, 0010 e 0011 só aparecem depois de aplicadas.
  const abas = ABAS.filter((a) => !a.recurso || dados.recursos[a.recurso]);
  const aba = abas.some((a) => a.aba === valor("aba")) ? valor("aba")! : "painel";
  const filtros = lerFiltros(valor, dados.contas, dados.caixas, dados.contrapartes);
  const ordem = (valor("ordem") ?? "") in ORDENS ? (valor("ordem") as Ordem) : "recentes";

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
          {abas.map((a) => {
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

      {aba === "painel" && (
        <AbaPainel {...dados} periodo={periodo} base={valor("visao") === "caixa" ? "caixa" : "competencia"} filtros={filtros} />
      )}
      {aba === "resultado" && <AbaResultado {...dados} periodo={periodo} filtros={filtros} />}
      {aba === "fluxo" && <AbaFluxo {...dados} periodo={periodo} base={base} />}
      {aba === "apagar" && <AbaAPagar {...dados} />}
      {aba === "lancamentos" && (
        <AbaLancamentos
          {...dados}
          periodo={periodo}
          situacao={valor("situacao")}
          criterio={valor("data") === "competencia" ? "competencia" : "movimento"}
          filtros={filtros}
          ordem={ordem}
        />
      )}
      {aba === "cartoes" && (
        <AbaCartoes {...dados} periodo={periodo} cartao={dados.cartoes.some((c) => c.id === valor("cartao")) ? valor("cartao")! : null} />
      )}
      {aba === "extratos" && (
        <AbaExtratos
          {...dados}
          periodo={periodo}
          caixa={dados.caixas.some((c) => c.id === valor("caixa")) ? valor("caixa")! : null}
          situacao={(["pendente", "conciliado", "ignorado", "todas"] as const).find((s) => s === valor("situacao")) ?? "pendente"}
        />
      )}
      {aba === "fornecedores" && <AbaFornecedores empresa={empresa} contrapartes={dados.contrapartes} periodo={periodo} />}
      {aba === "plano" && <AbaPlanoContas {...dados} />}
      {aba === "caixas" && <AbaContasCaixa {...dados} />}
    </>
  );
}
