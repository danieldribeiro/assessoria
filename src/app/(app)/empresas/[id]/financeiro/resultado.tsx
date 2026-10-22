import { Scale } from "lucide-react";
import Link from "next/link";
import { CabecalhoCartao, Cartao, Vazio, cx, classeTabela as t } from "@/components/ui";
import { formatarValor } from "@/lib/datas";
import { carregarLancamentos } from "@/lib/financeiro/consultas";
import type { ContaCaixa, ContaPlano } from "@/lib/financeiro/dominio";
import { SECOES_DESPESA, montarDre, parcelas, variacao, type Filtros } from "@/lib/financeiro/painel";
import { textoPeriodo, type Periodo } from "@/lib/financeiro/periodo";
import { FiltroPeriodo } from "./filtro";
import { FiltroCaixa, filtrosAtivos, linkLancamentos } from "./painel";

const moeda = (v: number) => formatarValor(v, "R$")!;
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
const DESPESA = new Set<number>(SECOES_DESPESA);
const DESTAQUE = new Set([4, 7, 9, 12]);

// DRE gerencial por competência (C6: previstos e realizados), nas 12 linhas fixas da v4.
export async function AbaResultado({
  empresa,
  contas,
  caixas,
  periodo,
  filtros,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  periodo: Periodo;
  filtros: Filtros;
}) {
  const { meses, inicio, fim } = periodo;
  const { inicio: inicioAnterior, fim: fimAnterior } = periodo.anterior;
  const lancamentos = await carregarLancamentos(empresa.id, inicioAnterior, fim, "competencia");
  const filtro = { caixa: filtros.caixa };
  const dre = montarDre(parcelas(lancamentos, contas, "competencia", filtro, inicio, fim), meses);
  const dreAnterior = montarDre(
    parcelas(lancamentos, contas, "competencia", filtro, inicioAnterior, fimAnterior),
    periodo.anterior.meses,
  );
  const totalAnterior = new Map(dreAnterior.linhas.map((l) => [l.numero, l.total]));
  const faturamento = dre.linhas[0].total;
  const despesas = -dre.linhas.filter((l) => DESPESA.has(l.numero)).reduce((a, l) => a + l.total, 0);
  const mostrarMeses = meses.length > 1;
  const link = (conta: string, secao: number) =>
    linkLancamentos(empresa.id, "competencia", periodo.de, periodo.ate, { caixa: filtros.caixa, conta, secoes: [secao] });
  const vazio = dre.linhas.every((l) => l.total === 0 && l.valores.every((v) => v === 0));

  return (
    <div className="space-y-6">
      <FiltroPeriodo
        aba="resultado"
        periodo={periodo}
        ativos={filtrosAtivos({ caixa: filtros.caixa }, contas, caixas, [])}
        filtros={<FiltroCaixa caixas={caixas} valor={filtros.caixa} />}
      />

      <p className="text-xs text-slate-500">
        Resultado por competência: cada lançamento entra no mês da competência, previsto ou realizado, e cancelado não
        entra. Para ver quando o dinheiro entrou e saiu, use o{" "}
        <Link href={`?aba=fluxo&de=${periodo.de}&ate=${periodo.ate}`} className="font-medium text-marca-700 hover:underline">
          fluxo de caixa
        </Link>
        .
      </p>

      <Cartao className="overflow-x-auto">
        <CabecalhoCartao titulo={`Resultado gerencial · ${textoPeriodo(inicio, fim)}`} />
        {vazio ? (
          <Vazio icone={<Scale />}>
            Nenhum lançamento com competência neste período.{" "}
            <Link href="?aba=lancamentos" className="font-medium text-marca-700 hover:underline">
              Cadastre receitas e despesas
            </Link>{" "}
            para montar o resultado.
          </Vazio>
        ) : (
          <table className={t.tabela}>
            <thead className={t.cabeca}>
              <tr>
                <th className={t.th}>Linha</th>
                {mostrarMeses && meses.map((m) => <th key={m} className={`${t.th} text-right`}>{nomeMes(m)}</th>)}
                <th className={`${t.th} text-right`}>Total</th>
                <th className={`${t.th} text-right`}>% </th>
                <th className={`${t.th} whitespace-nowrap text-right`}>{textoPeriodo(inicioAnterior, fimAnterior)}</th>
                <th className={`${t.th} text-right`}>Variação</th>
              </tr>
            </thead>
            <tbody>
              {dre.linhas.map((l) => {
                const ant = totalAnterior.get(l.numero) ?? 0;
                // Linhas que recebem conta comparam o tamanho (despesa que cresce aparece com +); as calculadas, o valor com sinal.
                const v = l.calculada ? variacao(l.total, ant) : variacao(Math.abs(l.total), Math.abs(ant));
                const base = DESPESA.has(l.numero) ? despesas : faturamento;
                const proporcao = (x: number) => (l.numero === 1 || DESPESA.has(l.numero) ? Math.abs(x) : x) / base;
                return [
                  <tr key={l.numero} className={cx("border-b border-slate-100", DESTAQUE.has(l.numero) && "bg-slate-50/70")}>
                    <td className={cx("px-5 py-2", DESTAQUE.has(l.numero) ? "font-semibold text-slate-900" : "font-medium text-slate-800")}>
                      <span className="mr-2 text-xs tabular-nums text-slate-400">{l.numero}</span>
                      {l.nome}
                    </td>
                    {mostrarMeses && l.valores.map((x, i) => <Valor key={i} valor={x} negrito sinalizar={l.calculada} />)}
                    <Valor valor={l.total} negrito sinalizar={l.calculada} />
                    <td className="whitespace-nowrap px-5 py-2 text-right text-xs tabular-nums text-slate-500">
                      {base ? percentual.format(proporcao(l.total)) : "—"}
                    </td>
                    <Valor valor={ant} sinalizar={l.calculada} />
                    <td className="whitespace-nowrap px-5 py-2 text-right text-xs tabular-nums text-slate-500">
                      {v.diferenca === 0 ? "—" : v.percentual === null ? moeda(v.diferenca) : `${v.diferenca > 0 ? "+" : "−"}${percentual.format(Math.abs(v.percentual))}`}
                    </td>
                  </tr>,
                  ...l.contas.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100/70 text-slate-600">
                      <td className="py-1.5 pl-12 pr-5 text-sm">
                        <Link href={link(c.id, l.numero)} className="hover:text-marca-700 hover:underline">
                          <span className="mr-2 text-xs tabular-nums text-slate-400">{c.codigo}</span>
                          {c.nome}
                        </Link>
                      </td>
                      {mostrarMeses && c.valores.map((x, i) => <Valor key={i} valor={x} pequeno />)}
                      <Valor valor={c.total} pequeno />
                      <td className="whitespace-nowrap px-5 py-1.5 text-right text-xs tabular-nums text-slate-400">
                        {base ? percentual.format(proporcao(c.total)) : "—"}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        )}
        {dre.foraDaDre !== 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            {moeda(Math.abs(dre.foraDaDre))} de {dre.foraDaDre < 0 ? "saldo de saídas" : "saldo de entradas"} em investimentos,
            financiamentos e sócios ficaram fora do resultado, como manda a DRE v4.
          </p>
        )}
      </Cartao>
      <p className="text-xs text-slate-500">
        Coluna %: as linhas de despesa (2, 3, 5, 6 e 8) mostram a participação no total das despesas; as demais, a
        proporção do faturamento.
      </p>
    </div>
  );
}

// Nas linhas de dedução o sinal negativo é o normal; o vermelho fica para resultado negativo.
function Valor({ valor, negrito, pequeno, sinalizar }: { valor: number; negrito?: boolean; pequeno?: boolean; sinalizar?: boolean }) {
  return (
    <td
      className={cx(
        "whitespace-nowrap px-5 text-right tabular-nums",
        pequeno ? "py-1.5 text-sm" : "py-2",
        negrito && "font-medium",
        valor === 0 ? "text-slate-400" : sinalizar && valor < 0 ? "text-red-700" : pequeno ? "text-slate-700" : "text-slate-900",
      )}
    >
      {valor === 0 ? "—" : moeda(valor)}
    </td>
  );
}
