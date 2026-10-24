// Projeção do caixa: saldo de hoje mais as contas previstas (a pagar e a receber) e, separada, uma estimativa da
// operação pela média dos últimos 28 dias realizados (opção B da proposta, decidida em 24/10/2026).
import type { ItemConta } from "@/lib/financeiro/apagar";
import type { ContaPlano, Lancamento } from "@/lib/financeiro/dominio";
import { ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import { diasEntre, somarDiasData, somarMeses } from "@/lib/financeiro/periodo";

// 28 dias: quatro semanas inteiras, então a mistura de dias úteis e fins de semana se mantém.
export const DIAS_MEDIA = 28;
// Receita bruta (1) menos deduções comerciais (2), custos diretos variáveis (5) e despesas variáveis (6). Fixos,
// tributos, resultado financeiro, retiradas e investimentos ficam de fora: só entram como contas previstas.
export const SECOES_OPERACAO = [1, 2, 5, 6] as const;
export const HORIZONTES = [30, 60, 90] as const;
export type Horizonte = (typeof HORIZONTES)[number];

// Janela da média: os 28 dias antes de hoje (hoje ainda está acontecendo).
export function janelaMedia(hoje: string) {
  return { inicio: somarDiasData(hoje, -DIAS_MEDIA), fim: somarDiasData(hoje, -1) };
}

// Operação dos últimos 28 dias, em centavos, ou null se a empresa tem menos de 28 dias de lançamentos realizados.
// Só realizados, pela data em que o dinheiro entrou ou saiu: um previsto nunca entra na média.
export function operacaoDaJanela(
  lancamentos: Lancamento[],
  contas: ContaPlano[],
  primeiroRealizado: string | null,
  hoje: string,
  caixa?: string | null,
) {
  const { inicio, fim } = janelaMedia(hoje);
  if (!primeiroRealizado || primeiroRealizado > inicio) return null;
  const secao = new Map(contas.map((c) => [c.id, c.dre_secao ?? 0]));
  let total = 0;
  for (const l of lancamentos) {
    if (l.situacao !== "realizado" || !l.data_liquidacao || l.data_liquidacao < inicio || l.data_liquidacao > fim) continue;
    if (caixa && l.conta_caixa_id !== caixa) continue;
    for (const r of l.rateios) {
      if (!(SECOES_OPERACAO as readonly number[]).includes(secao.get(r.conta_id) ?? 0)) continue;
      total += (l.direcao === "entrada" ? 1 : -1) * Math.round(r.valor * 100);
    }
  }
  return total;
}

// Estimativa da operação para os dias depois de hoje, em reais.
export function estimativa(operacao28: number, dias: number) {
  return Math.round((operacao28 * dias) / DIAS_MEDIA) / 100;
}

// Dia em que uma conta pesa no caixa: na data de vencimento, ou amanhã se já venceu (continua devida).
export function diaEfetivo(vencimento: string, hoje: string) {
  return vencimento < hoje ? somarDiasData(hoje, 1) : vencimento;
}

// Data do card do painel: fim do mês atual; no último dia do mês, fim do mês seguinte.
export function alvoDoMes(hoje: string) {
  const fim = ultimoDiaDoMes(hoje.slice(0, 7));
  return fim === hoje ? ultimoDiaDoMes(somarMeses(hoje.slice(0, 7), 1)) : fim;
}

const doCaixa = (itens: ItemConta[], caixa?: string | null) => (caixa ? itens.filter((i) => i.caixa === caixa) : itens);

export type ResumoProjecao = {
  ate: string;
  saldoHoje: number;
  pagar: number;
  receber: number;
  soContas: number;
  dias: number;
  operacao: number | null;
  projetado: number | null;
};

// Card do painel: saldo de hoje − a pagar + a receber até a data (vencidas incluídas) ± estimativa da operação.
export function resumirProjecao(
  saldoHoje: number,
  itens: ItemConta[],
  hoje: string,
  ate: string,
  operacao28: number | null,
  caixa?: string | null,
): ResumoProjecao {
  let pagar = 0;
  let receber = 0;
  for (const i of doCaixa(itens, caixa)) {
    if (i.vencimento > ate) continue;
    if (i.direcao === "saida") pagar += Math.round(i.valor * 100);
    else receber += Math.round(i.valor * 100);
  }
  const soContas = (Math.round(saldoHoje * 100) - pagar + receber) / 100;
  const dias = Math.max(0, diasEntre(hoje, ate) - 1);
  const operacao = operacao28 === null ? null : estimativa(operacao28, dias);
  return {
    ate,
    saldoHoje,
    pagar: pagar / 100,
    receber: receber / 100,
    soContas,
    dias,
    operacao,
    projetado: operacao === null ? null : Math.round((soContas + operacao) * 100) / 100,
  };
}

export type PontoProjecao = { dia: string; soContas: number; comOperacao: number | null };

// Saldo dia a dia, de hoje até hoje + dias. O ponto de hoje já inclui o que vence hoje.
export function projetarDiario(
  saldoHoje: number,
  itens: ItemConta[],
  hoje: string,
  dias: number,
  operacao28: number | null,
  caixa?: string | null,
): PontoProjecao[] {
  const porDia = new Map<string, number>();
  for (const i of doCaixa(itens, caixa)) {
    const d = diaEfetivo(i.vencimento, hoje);
    porDia.set(d, (porDia.get(d) ?? 0) + (i.direcao === "saida" ? -1 : 1) * Math.round(i.valor * 100));
  }
  const pontos: PontoProjecao[] = [];
  let acumulado = Math.round(saldoHoje * 100);
  for (let n = 0; n <= dias; n++) {
    const dia = somarDiasData(hoje, n);
    acumulado += porDia.get(dia) ?? 0;
    const soContas = acumulado / 100;
    pontos.push({
      dia,
      soContas,
      comOperacao: operacao28 === null ? null : Math.round((soContas + estimativa(operacao28, n)) * 100) / 100,
    });
  }
  return pontos;
}

// Dia de menor saldo (o primeiro, se houver empate).
export function menorPonto(valores: number[]) {
  let indice = 0;
  for (let i = 1; i < valores.length; i++) if (valores[i] < valores[indice]) indice = i;
  return indice;
}
