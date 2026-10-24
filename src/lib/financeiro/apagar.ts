// Contas a pagar e a receber: os lançamentos previstos, agrupados por quando vencem. Compras no cartão entram pela
// fatura (uma linha por fatura aberta, com o total e o vencimento dela), nunca compra por compra.
import { totalDaFatura } from "@/lib/financeiro/cartao";
import type { Direcao, Fatura, Lancamento } from "@/lib/financeiro/dominio";
import { ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import { diasEntre, somarDiasData, somarMeses } from "@/lib/financeiro/periodo";

// Quantos meses depois do atual a tela mostra.
export const MESES_A_FRENTE = 6;

export type ItemConta =
  | { tipo: "lancamento"; id: string; vencimento: string; direcao: Direcao; valor: number; lancamento: Lancamento }
  | { tipo: "fatura"; id: string; vencimento: string; direcao: Direcao; valor: number; fatura: Fatura; compras: Lancamento[] };

export type ChaveGrupo = "vencidas" | "semana" | "mes" | `mes:${string}`;

export type GrupoConta = { chave: ChaveGrupo; itens: ItemConta[]; pagar: number; receber: number };

// Último dia que a tela mostra: fim do mês atual mais MESES_A_FRENTE meses.
export function limiteContas(hoje: string, meses = MESES_A_FRENTE) {
  return ultimoDiaDoMes(somarMeses(hoje.slice(0, 7), meses));
}

// Dias de atraso de um vencimento (0 se ainda não venceu).
export function diasDeAtraso(vencimento: string, hoje: string) {
  return vencimento < hoje ? diasEntre(vencimento, hoje) - 1 : 0;
}

// Grupo de um vencimento: vencidas (antes de hoje), próximos 7 dias (hoje e os 6 seguintes), até o fim do mês,
// depois um grupo por mês. O que passa do limite fica de fora (null).
export function grupoDoVencimento(vencimento: string, hoje: string, meses = MESES_A_FRENTE): ChaveGrupo | null {
  if (vencimento < hoje) return "vencidas";
  if (vencimento <= somarDiasData(hoje, 6)) return "semana";
  if (vencimento <= ultimoDiaDoMes(hoje.slice(0, 7))) return "mes";
  if (vencimento <= limiteContas(hoje, meses)) return `mes:${vencimento.slice(0, 7)}`;
  return null;
}

export function agruparContas(previstos: Lancamento[], faturas: Fatura[], hoje: string, meses = MESES_A_FRENTE): GrupoConta[] {
  const abertas = new Map(faturas.filter((f) => f.situacao === "aberta").map((f) => [f.id, f]));
  const itens: ItemConta[] = [];
  const porFatura = new Map<string, Lancamento[]>();
  for (const l of previstos) {
    if (l.situacao !== "previsto" || !l.data_vencimento) continue;
    const f = l.fatura_id ? abertas.get(l.fatura_id) : undefined;
    if (f) {
      const g = porFatura.get(f.id);
      if (g) g.push(l);
      else porFatura.set(f.id, [l]);
    } else {
      itens.push({ tipo: "lancamento", id: l.id, vencimento: l.data_vencimento, direcao: l.direcao, valor: l.valor_total, lancamento: l });
    }
  }
  for (const [id, compras] of porFatura) {
    const f = abertas.get(id)!;
    const total = totalDaFatura(compras);
    if (total === 0) continue;
    itens.push({
      tipo: "fatura",
      id,
      vencimento: f.data_vencimento,
      direcao: total > 0 ? "saida" : "entrada",
      valor: Math.abs(total),
      fatura: f,
      compras,
    });
  }

  const grupos = new Map<ChaveGrupo, GrupoConta>();
  for (const item of itens) {
    const chave = grupoDoVencimento(item.vencimento, hoje, meses);
    if (!chave) continue;
    let g = grupos.get(chave);
    if (!g) {
      g = { chave, itens: [], pagar: 0, receber: 0 };
      grupos.set(chave, g);
    }
    g.itens.push(item);
  }
  // Somas em centavos; itens do mais antigo para o mais novo, saídas antes das entradas no mesmo dia.
  const ordem = (c: ChaveGrupo) => (c === "vencidas" ? "0" : c === "semana" ? "1" : c === "mes" ? "2" : `3${c}`);
  return [...grupos.values()]
    .sort((a, b) => ordem(a.chave).localeCompare(ordem(b.chave)))
    .map((g) => {
      const centavos = (d: Direcao) => g.itens.filter((i) => i.direcao === d).reduce((a, i) => a + Math.round(i.valor * 100), 0);
      return {
        ...g,
        itens: g.itens.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || (a.direcao === b.direcao ? 0 : a.direcao === "saida" ? -1 : 1)),
        pagar: centavos("saida") / 100,
        receber: centavos("entrada") / 100,
      };
    });
}
