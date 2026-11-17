// Perdas de estoque (migração 0027): vencidos, quebras, preparo errado, cortesias. Valorizadas pelo custo do insumo
// gravado quando a perda foi anotada. Regras puras, para a tela e os testes. Valores em centavos.

export const MOTIVOS_PERDA = [
  { valor: "vencido", rotulo: "Vencido" },
  { valor: "quebra", rotulo: "Quebra ou dano" },
  { valor: "preparo", rotulo: "Preparo errado" },
  { valor: "cortesia", rotulo: "Cortesia" },
  { valor: "outro", rotulo: "Outro" },
] as const;
export type MotivoPerda = (typeof MOTIVOS_PERDA)[number]["valor"];
export const rotuloMotivo = (m: string) => MOTIVOS_PERDA.find((x) => x.valor === m)?.rotulo ?? m;

export type Perda = {
  id: string;
  data: string;
  item_id: string;
  quantidade: number;
  motivo: MotivoPerda;
  custo_unitario: number | null;
  observacao: string | null;
};

export const valorPerda = (p: Pick<Perda, "quantidade" | "custo_unitario">) =>
  p.custo_unitario === null ? 0 : Math.round(p.quantidade * p.custo_unitario * 100);

// Total, total por motivo (na ordem da lista) e quantas perdas ficaram sem valor (insumo sem custo).
export function resumoPerdas(perdas: Pick<Perda, "quantidade" | "custo_unitario" | "motivo">[]) {
  const porMotivo = new Map<string, number>();
  let total = 0;
  let semCusto = 0;
  for (const p of perdas) {
    const v = valorPerda(p);
    total += v;
    if (p.custo_unitario === null) semCusto++;
    porMotivo.set(p.motivo, (porMotivo.get(p.motivo) ?? 0) + v);
  }
  return {
    total,
    semCusto,
    porMotivo: MOTIVOS_PERDA.filter((m) => porMotivo.has(m.valor)).map((m) => ({ motivo: m.valor, rotulo: m.rotulo, valor: porMotivo.get(m.valor)! })),
  };
}
