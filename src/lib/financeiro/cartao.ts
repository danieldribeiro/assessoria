// Cartões e faturas (0011): contas que a tela faz sem ir ao banco. As regras valem também no banco
// (fin_referencia_da_compra, fin_pagar_fatura); aqui servem para mostrar e sugerir.
import type { Cartao, Fatura, Lancamento } from "@/lib/financeiro/dominio";
import { somarMeses } from "@/lib/financeiro/periodo";

const doisDigitos = (n: number) => String(n).padStart(2, "0");

// Dia `dia` do mês de `mes` (YYYY-MM ou data); se o mês tem menos dias, o último dia.
export function diaNoMes(mes: string, dia: number) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${doisDigitos(m)}-${doisDigitos(Math.min(dia, ultimo))}`;
}

// Mês de vencimento (YYYY-MM) da fatura em que cai uma compra feita em `data` (YYYY-MM-DD). Compra antes do dia
// de fechamento entra na fatura que fecha naquele mês; no dia do fechamento ou depois, na do mês seguinte. Se o
// vencimento é num dia depois do fechamento, vence no mesmo mês do fechamento; senão, no mês seguinte.
export function referenciaDaCompra(cartao: Pick<Cartao, "dia_fechamento" | "dia_vencimento">, data: string) {
  const mes = data.slice(0, 7);
  const fecha = data < diaNoMes(mes, cartao.dia_fechamento) ? mes : somarMeses(mes, 1);
  return cartao.dia_vencimento > cartao.dia_fechamento ? fecha : somarMeses(fecha, 1);
}

// Total a pagar: saídas menos entradas (estornos), sem as canceladas. Em centavos, para não errar na soma.
export function totalDaFatura(compras: Pick<Lancamento, "direcao" | "valor_total" | "situacao">[]) {
  return (
    compras
      .filter((c) => c.situacao !== "cancelado")
      .reduce((a, c) => a + (c.direcao === "saida" ? 1 : -1) * Math.round(c.valor_total * 100), 0) / 100
  );
}

// Faturas que podem explicar uma saída do extrato: mesma conta de caixa, mesmo valor (o pago, ou o total da
// aberta) e vencimento ou pagamento perto da data do banco. As já conciliadas ficam de fora.
export function candidatosFatura<F extends Fatura & { total: number }>(
  movimento: { conta_caixa_id: string; data: string; valor: number },
  faturas: F[],
  caixaDoCartao: Map<string, string>,
  conciliadas: Set<string>,
  dias = 10,
) {
  if (movimento.valor >= 0) return [];
  const centavos = Math.round(-movimento.valor * 100);
  const distancia = (d: string) => Math.abs(Date.parse(d) - Date.parse(movimento.data)) / 86400000;
  return faturas
    .filter(
      (f) =>
        caixaDoCartao.get(f.cartao_id) === movimento.conta_caixa_id &&
        !conciliadas.has(f.id) &&
        Math.round((f.situacao === "paga" ? f.valor_pago! : f.total) * 100) === centavos,
    )
    .map((f) => ({ fatura: f, dias: distancia(f.data_pagamento ?? f.data_vencimento) }))
    .filter((c) => c.dias <= dias)
    .sort((a, b) => a.dias - b.dias);
}
