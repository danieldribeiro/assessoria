import { ChevronRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { GraficoMensal } from "@/components/graficos";
import { CabecalhoCartao, Cartao, Etiqueta, cx } from "@/components/ui";
import { formatarData, formatarValor, hoje } from "@/lib/datas";
import { itensContas } from "@/lib/financeiro/apagar";
import { carregarFaturasPorId, carregarLancamentos, carregarPrevistos, carregarPrimeiroRealizado, carregarSaldos } from "@/lib/financeiro/consultas";
import type { ContaPlano } from "@/lib/financeiro/dominio";
import {
  DIAS_MEDIA,
  HORIZONTES,
  alvoDoMes,
  janelaMedia,
  menorPonto,
  operacaoDaJanela,
  projetarDiario,
  resumirProjecao,
  type Horizonte,
} from "@/lib/financeiro/projecao";
import { somarDiasData } from "@/lib/financeiro/periodo";

const moeda = (v: number) => formatarValor(v, "R$")!;
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Tudo o que a projeção usa: saldo de hoje por caixa, contas previstas até a data e os realizados da janela da média.
async function carregarProjecao(empresaId: string, contas: ContaPlano[], cartoes: boolean, ate: string, caixa?: string | null) {
  const dia = hoje();
  const janela = janelaMedia(dia);
  const [saldos, previstos, realizados, primeiro] = await Promise.all([
    carregarSaldos(empresaId, dia),
    carregarPrevistos(empresaId, ate),
    carregarLancamentos(empresaId, janela.inicio, janela.fim),
    carregarPrimeiroRealizado(empresaId),
  ]);
  const idsFaturas = cartoes ? [...new Set(previstos.map((l) => l.fatura_id).filter((id): id is string => !!id))] : [];
  const faturas = await carregarFaturasPorId(empresaId, idsFaturas);
  return {
    dia,
    saldoHoje: saldos.filter((s) => !caixa || s.conta_caixa_id === caixa).reduce((a, s) => a + (s.saldo ?? 0), 0),
    itens: itensContas(previstos, faturas),
    operacao28: operacaoDaJanela(realizados, contas, primeiro, dia, caixa),
    primeiro,
  };
}

function SemHistorico({ primeiro }: { primeiro: string | null }) {
  return (
    <p className="text-xs text-slate-500">
      Sem estimativa da operação: ela usa a média dos últimos {DIAS_MEDIA} dias realizados
      {primeiro ? ` e aparece a partir de ${formatarData(somarDiasData(primeiro, DIAS_MEDIA))}` : ", e ainda não há lançamentos realizados"}.
    </p>
  );
}

// Card do painel: saldo projetado no fim do mês, com cada parte da conta à vista.
export async function CartaoProjecao({
  empresa,
  contas,
  recursos,
  caixa,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  recursos: { cartoes: boolean };
  caixa?: string | null;
}) {
  const ate = alvoDoMes(hoje());
  const p = await carregarProjecao(empresa.id, contas, recursos.cartoes, ate, caixa);
  const r = resumirProjecao(p.saldoHoje, p.itens, p.dia, ate, p.operacao28, caixa);
  const final = r.projetado ?? r.soContas;

  return (
    <Cartao>
      <CabecalhoCartao titulo={`Saldo projetado em ${formatarData(ate)}`} icone={<TrendingUp />}>
        <Link href="?aba=fluxo" className="flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
          Ver dia a dia
          <ChevronRight className="size-3.5" />
        </Link>
      </CabecalhoCartao>
      <div className="grid gap-6 px-5 py-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div>
          <p className={cx("text-2xl font-semibold tabular-nums", final < 0 ? "text-red-700" : "text-slate-900")}>{moeda(final)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {r.projetado === null ? "Só com as contas lançadas." : `Com a operação estimada pela média de ${DIAS_MEDIA} dias.`} Não muda o saldo
            realizado nem o Resultado.
          </p>
        </div>
        <dl className="space-y-1.5 text-sm">
          <Parte rotulo="Saldo de hoje" valor={r.saldoHoje} />
          <Parte rotulo="(−) Contas a pagar" valor={-r.pagar} href="?aba=apagar" />
          <Parte rotulo="(+) Contas a receber" valor={r.receber} href="?aba=apagar" />
          <Parte rotulo="Saldo só com as contas" valor={r.soContas} forte />
          {r.operacao !== null && (
            <>
              <Parte rotulo={`(±) Operação estimada, ${r.dias} ${r.dias === 1 ? "dia" : "dias"}`} valor={r.operacao} estimado />
              <Parte rotulo="Saldo projetado" valor={r.projetado!} forte />
            </>
          )}
          {r.operacao === null && <SemHistorico primeiro={p.primeiro} />}
        </dl>
      </div>
    </Cartao>
  );
}

function Parte({ rotulo, valor, forte, estimado, href }: { rotulo: string; valor: number; forte?: boolean; estimado?: boolean; href?: string }) {
  const texto = href ? (
    <Link href={href} className="hover:text-marca-700 hover:underline">
      {rotulo}
    </Link>
  ) : (
    rotulo
  );
  return (
    <div className={cx("flex items-baseline justify-between gap-3", forte && "border-t border-slate-100 pt-1.5 font-semibold text-slate-900")}>
      <dt className={cx("flex items-center gap-2", !forte && "text-slate-600")}>
        {texto}
        {estimado && <Etiqueta tom="ambar">estimado</Etiqueta>}
      </dt>
      <dd className={cx("tabular-nums", valor < 0 ? "text-red-700" : "")}>{moeda(valor)}</dd>
    </div>
  );
}

// Aba Fluxo de caixa: saldo dia a dia para os próximos 30, 60 ou 90 dias, em duas linhas, com o dia de menor saldo.
export async function GraficoProjecao({
  empresa,
  contas,
  recursos,
  horizonte,
  consulta,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  recursos: { cartoes: boolean };
  horizonte: Horizonte;
  consulta: Record<string, string>;
}) {
  const dia = hoje();
  const p = await carregarProjecao(empresa.id, contas, recursos.cartoes, somarDiasData(dia, horizonte));
  const pontos = projetarDiario(p.saldoHoje, p.itens, p.dia, horizonte, p.operacao28);
  const soContas = pontos.map((x) => x.soContas);
  const comOperacao = p.operacao28 === null ? null : pontos.map((x) => x.comOperacao!);
  const principal = comOperacao ?? soContas;
  const menor = menorPonto(principal);
  const menorSoContas = menorPonto(soContas);

  return (
    <Cartao>
      <CabecalhoCartao titulo={`Projeção do caixa · próximos ${horizonte} dias`} icone={<TrendingUp />}>
        <span className="inline-flex rounded-lg bg-slate-100 p-0.5">
          {HORIZONTES.map((h) => (
            <Link
              key={h}
              href={`?${new URLSearchParams({ ...consulta, horizonte: String(h) })}`}
              aria-current={h === horizonte ? "true" : undefined}
              className={cx(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                h === horizonte ? "bg-superficie text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {h} dias
            </Link>
          ))}
        </span>
      </CabecalhoCartao>
      <div className="space-y-3 px-5 py-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Resumo rotulo="Saldo de hoje" valor={p.saldoHoje} />
          <Resumo
            rotulo={`Menor saldo${comOperacao ? ", com a operação" : ""}`}
            valor={principal[menor]}
            detalhe={`em ${formatarData(pontos[menor].dia)}`}
          />
          {comOperacao ? (
            <Resumo rotulo="Menor saldo, só com as contas" valor={soContas[menorSoContas]} detalhe={`em ${formatarData(pontos[menorSoContas].dia)}`} />
          ) : (
            <Resumo rotulo={`Saldo em ${formatarData(pontos[horizonte].dia)}`} valor={soContas[horizonte]} />
          )}
        </div>
        <GraficoMensal
          descricao={`Saldo projetado dia a dia nos próximos ${horizonte} dias`}
          rotulos={pontos.map((x) => diaMes(x.dia))}
          series={[
            { nome: "Só com as contas", forma: "linha", cor: 2, valores: soContas },
            ...(comOperacao ? [{ nome: "Com a operação estimada", forma: "linha" as const, cor: 1 as const, valores: comOperacao }] : []),
          ]}
          comZero={false}
          marca={{ indice: menor, rotulo: `menor saldo · ${diaMes(pontos[menor].dia)}` }}
        />
        <p className="text-xs text-slate-500">
          &quot;Só com as contas&quot;: saldo de hoje mais as contas previstas no vencimento, com as vencidas contadas amanhã e as
          faturas de cartão abertas pelo total.
          {comOperacao
            ? ` "Com a operação estimada" soma, a cada dia, a média diária de vendas menos custos e despesas variáveis dos últimos ${DIAS_MEDIA} dias realizados. Contas fixas só entram se estiverem lançadas como previstas.`
            : ""}
        </p>
        {!comOperacao && <SemHistorico primeiro={p.primeiro} />}
      </div>
    </Cartao>
  );
}

function Resumo({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className={cx("font-semibold tabular-nums", valor < 0 ? "text-red-700" : "text-slate-900")}>{moeda(valor)}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}
