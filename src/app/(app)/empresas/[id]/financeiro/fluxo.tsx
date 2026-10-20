import { ArrowLeftRight, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { CabecalhoCartao, Cartao, Vazio, cx, classeTabela as t } from "@/components/ui";
import { formatarData, formatarPeriodo, formatarValor } from "@/lib/datas";
import { carregarMovimentos, carregarSaldos, carregarTransferencias } from "@/lib/financeiro/consultas";
import { NOME_ATIVIDADE, type ContaCaixa, type ContaPlano } from "@/lib/financeiro/dominio";
import { conferirSaldos, diaAnterior, mesesEntre, montarFluxo, ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import { FiltroPeriodo, classeFiltro } from "./filtro";

const moeda = (v: number) => formatarValor(v, "R$")!;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

export async function AbaFluxo({
  empresa,
  contas,
  caixas,
  periodo,
  base,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  periodo: { de: string; ate: string };
  base: "realizado" | "previsto";
}) {
  const meses = mesesEntre(periodo.de, periodo.ate);
  const inicio = meses[0];
  const fim = ultimoDiaDoMes(meses[meses.length - 1]);
  const [movimentos, saldosAntes, saldosFim, transferencias] = await Promise.all([
    carregarMovimentos(empresa.id, inicio, fim, base),
    carregarSaldos(empresa.id, diaAnterior(inicio)),
    carregarSaldos(empresa.id, fim),
    carregarTransferencias(empresa.id, inicio, fim),
  ]);
  const fluxo = montarFluxo(contas, movimentos, meses);
  const transferidas = transferencias.filter((x) => x.situacao === "realizado");

  const saldoAntes = saldosAntes.reduce((a, s) => a + (s.saldo ?? 0), 0);
  const aberturas = caixas
    .filter((c) => c.data_saldo_inicial >= inicio && c.data_saldo_inicial <= fim)
    .reduce((a, c) => a + c.saldo_inicial, 0);
  const saldoFinal = saldosFim.reduce((a, s) => a + (s.saldo ?? 0), 0);
  const conferencia = conferirSaldos({ saldoAntes, aberturas, variacao: fluxo.total.variacao, saldoFinal });
  const nomeCaixa = new Map(caixas.map((c) => [c.id, c.nome]));
  const mostrarMeses = meses.length > 1;

  return (
    <div className="space-y-6">
      <FiltroPeriodo aba="fluxo" de={periodo.de} ate={periodo.ate}>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Base</span>
          <select name="base" defaultValue={base} className={classeFiltro}>
            <option value="realizado">Realizado (pela data do pagamento)</option>
            <option value="previsto">Previsto (pelo vencimento)</option>
          </select>
        </label>
      </FiltroPeriodo>

      {caixas.length === 0 || contas.length === 0 ? (
        <Cartao>
          <Vazio icone={<ArrowLeftRight />}>
            Para ver o fluxo de caixa, cadastre primeiro{" "}
            {contas.length === 0 && (
              <Link className="font-medium text-marca-700 hover:underline" href={`?aba=plano`}>
                o plano de contas
              </Link>
            )}
            {contas.length === 0 && caixas.length === 0 && " e "}
            {caixas.length === 0 && (
              <Link className="font-medium text-marca-700 hover:underline" href={`?aba=caixas`}>
                as contas de caixa, com o saldo inicial
              </Link>
            )}
            .
          </Vazio>
        </Cartao>
      ) : (
        <>
          {base === "realizado" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Numero rotulo={`Saldo em ${formatarData(diaAnterior(inicio))}`} valor={saldoAntes} />
              <Numero rotulo="Entradas" valor={fluxo.total.entradas} tom="verde" />
              <Numero rotulo="Saídas" valor={-fluxo.total.saidas} tom="vermelho" />
              <Numero rotulo="Resultado do caixa" valor={fluxo.total.variacao} />
              <Numero rotulo={`Saldo em ${formatarData(fim)}`} valor={saldoFinal} destaque />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Numero rotulo="Entradas previstas" valor={fluxo.total.entradas} tom="verde" />
              <Numero rotulo="Saídas previstas" valor={-fluxo.total.saidas} tom="vermelho" />
              <Numero rotulo="Resultado previsto" valor={fluxo.total.variacao} destaque />
            </div>
          )}

          {base === "realizado" && (
            <p
              className={cx(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                conferencia.confere ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
              )}
            >
              {conferencia.confere ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
              <span>
                Conferência: {moeda(saldoAntes)}
                {aberturas !== 0 && ` + ${moeda(aberturas)} de contas abertas no período`} {fluxo.total.variacao < 0 ? "−" : "+"}{" "}
                {moeda(Math.abs(fluxo.total.variacao))} de resultado = {moeda(conferencia.esperado)}
                {conferencia.confere ? ", igual ao saldo final." : `, mas o saldo final é ${moeda(saldoFinal)} (diferença de ${moeda(conferencia.diferenca)}).`}{" "}
                As transferências entre contas não mudam o total.
              </span>
            </p>
          )}

          <Cartao className="overflow-x-auto">
            <CabecalhoCartao titulo={`Fluxo de caixa ${base === "realizado" ? "realizado" : "previsto"} · ${formatarPeriodo(inicio, fim)}`} />
            <table className={t.tabela}>
              <thead className={t.cabeca}>
                <tr>
                  <th className={t.th}>Conta</th>
                  {mostrarMeses && meses.map((m) => <th key={m} className={`${t.th} text-right`}>{nomeMes(m)}</th>)}
                  <th className={`${t.th} text-right`}>Total</th>
                </tr>
              </thead>
              {fluxo.secoes.map((s) => (
                <tbody key={s.atividade} className="border-b border-slate-200">
                  <tr className="bg-slate-50/70">
                    <th colSpan={meses.length + (mostrarMeses ? 2 : 1)} className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {NOME_ATIVIDADE[s.atividade]}
                    </th>
                  </tr>
                  {s.linhas.length === 0 ? (
                    <tr>
                      <td colSpan={meses.length + (mostrarMeses ? 2 : 1)} className="px-5 py-2 text-xs text-slate-400">
                        Nenhuma conta com esta atividade.
                      </td>
                    </tr>
                  ) : (
                    s.linhas.map((l) => (
                      <tr key={l.id} className={t.linha}>
                        <td className="px-5 py-2" style={{ paddingLeft: `${1.25 + l.nivel * 1.25}rem` }}>
                          <span className={cx(l.grupo ? "font-medium text-slate-900" : "text-slate-700", !l.ativa && "text-slate-400")}>
                            <span className="mr-2 text-xs tabular-nums text-slate-400">{l.codigo}</span>
                            {l.nome}
                            {!l.ativa && " (inativa)"}
                          </span>
                        </td>
                        {mostrarMeses && l.valores.map((v, i) => <Valor key={i} valor={v} negrito={l.grupo} />)}
                        <Valor valor={l.total} negrito />
                      </tr>
                    ))
                  )}
                  <tr className="bg-slate-50/40">
                    <td className="px-5 py-2 text-sm font-semibold text-slate-900">Caixa líquido · {NOME_ATIVIDADE[s.atividade].toLowerCase()}</td>
                    {mostrarMeses && s.valores.map((v, i) => <Valor key={i} valor={v} negrito />)}
                    <Valor valor={s.total} negrito />
                  </tr>
                </tbody>
              ))}
              <tfoot>
                <tr className="bg-slate-100/70">
                  <td className="px-5 py-2.5 text-sm font-semibold text-slate-900">Resultado do caixa (sem transferências)</td>
                  {mostrarMeses && fluxo.variacao.map((v, i) => <Valor key={i} valor={v} negrito />)}
                  <Valor valor={fluxo.total.variacao} negrito />
                </tr>
              </tfoot>
            </table>
            {fluxo.foraDasAtividades !== 0 && (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-red-700">
                {moeda(fluxo.foraDasAtividades)} lançados em contas fora das atividades acima. Confira o plano de contas.
              </p>
            )}
          </Cartao>

          {base === "realizado" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Cartao>
                <CabecalhoCartao titulo={`Saldos em ${formatarData(fim)}`} />
                <table className={t.tabela}>
                  <tbody>
                    {saldosFim.map((s) => (
                      <tr key={s.conta_caixa_id} className={t.linha}>
                        <td className={t.td}>
                          <span className={cx("font-medium", s.ativa ? "text-slate-900" : "text-slate-400")}>{s.nome}</span>
                          <span className="block text-xs text-slate-500">
                            Saldo inicial de {moeda(s.saldo_inicial)} em {formatarData(s.data_saldo_inicial)}
                          </span>
                        </td>
                        <td className={`${t.td} text-right tabular-nums`}>
                          {s.saldo === null ? <span className="text-xs text-slate-400">começa depois</span> : moeda(s.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Cartao>
              <Cartao>
                <CabecalhoCartao titulo="Transferências entre contas" contagem={transferidas.length} />
                {transferidas.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-500">Nenhuma transferência no período.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {transferidas.map((x) => (
                      <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="text-slate-900">
                            {nomeCaixa.get(x.conta_origem_id)} → {nomeCaixa.get(x.conta_destino_id)}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {formatarData(x.data)}
                            {x.descricao && ` · ${x.descricao}`}
                          </span>
                        </span>
                        <span className="tabular-nums text-slate-700">{moeda(x.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, tom, destaque }: { rotulo: string; valor: number; tom?: "verde" | "vermelho"; destaque?: boolean }) {
  return (
    <Cartao className={cx("px-4 py-3", destaque && "ring-1 ring-marca-200")}>
      <p className="text-xs font-medium text-slate-500">{rotulo}</p>
      <p
        className={cx(
          "mt-1 text-lg font-semibold tabular-nums",
          tom === "verde" ? "text-emerald-700" : tom === "vermelho" ? "text-red-700" : "text-slate-900",
        )}
      >
        {moeda(valor)}
      </p>
    </Cartao>
  );
}

function Valor({ valor, negrito }: { valor: number; negrito?: boolean }) {
  return (
    <td className={cx("whitespace-nowrap px-5 py-2 text-right tabular-nums", negrito && "font-medium", valor < 0 ? "text-red-700" : valor > 0 ? "text-slate-900" : "text-slate-400")}>
      {valor === 0 ? "—" : moeda(valor)}
    </td>
  );
}
