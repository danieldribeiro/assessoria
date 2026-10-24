// "Repetir todo mês": um previsto vira uma série de lançamentos independentes, um por mês, no mesmo dia (ou no
// último dia do mês, quando ele é mais curto: 31/01 → 28/02 → 31/03).
import { ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import { somarMeses } from "@/lib/financeiro/periodo";

export const REPETICOES_PADRAO = 12;
export const REPETICOES_MAXIMO = 60;

// A mesma data n meses depois, sempre calculada a partir da original (o dia 31 não "encolhe" depois de fevereiro).
export function somarMesesData(iso: string, n: number) {
  const fim = ultimoDiaDoMes(somarMeses(iso.slice(0, 7), n));
  return iso.slice(8, 10) > fim.slice(8, 10) ? fim : `${fim.slice(0, 8)}${iso.slice(8, 10)}`;
}

// Vencimento e competência de cada mês da série, a começar pelo informado.
export function datasDaSerie(vencimento: string, competencia: string | null, vezes: number) {
  return Array.from({ length: vezes }, (_, i) => ({
    vencimento: somarMesesData(vencimento, i),
    competencia: competencia ? somarMesesData(competencia, i) : null,
  }));
}
