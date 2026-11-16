// Estoque e CMV (migração 0018): regras puras, sem banco.
// CMV do mês = compras (lançamentos da linha 5 da DRE) + estoque inicial − estoque final.
// Na DRE, a diferença entra como "Variação de estoque" na linha 5: estoque final − estoque inicial
// (positiva quando o estoque cresceu, o que reduz o custo do mês). Ela só existe com as duas contagens fechadas:
// a do último dia do mês anterior e a do último dia do mês.
import type { Celula } from "@/lib/xlsx";

export type ItemEstoque = {
  id: string;
  empresa_id: string;
  nome: string;
  categoria: string | null;
  unidade: string;
  custo_unitario: number | null;
  fora_do_cmv: boolean;
  ativo: boolean;
};

export type Contagem = {
  id: string;
  empresa_id: string;
  data: string;
  situacao: "rascunho" | "fechada";
  arquivo_nome: string | null;
  fechada_em: string | null;
  criado_em: string;
};

export type LinhaContagem = {
  id: string;
  contagem_id: string;
  item_id: string | null;
  nome_origem: string;
  categoria_origem: string | null;
  unidade_origem: string | null;
  quantidade: number;
  custo_unitario: number | null;
  fora_do_cmv: boolean;
  ordem: number;
};

export type ItemImportado = { nome: string; categoria: string | null; unidade: string; quantidade: number };

// ---------------------------------------------------------------------------
// Leitura de planilhas
// ---------------------------------------------------------------------------

const normalizar = (v: Celula) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Número de célula: número do Excel ou texto no padrão brasileiro ("1.234,5") ou com ponto decimal ("27.5").
export function numeroCelula(v: Celula): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(/^R\$\s*/, "").replace(/\s/g, "").replace(/^\+/, "");
  if (!s) return null;
  const br = /^-?\d{1,3}(\.\d{3})+(,\d+)?$|^-?\d+,\d+$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(br);
  return Number.isFinite(n) ? n : null;
}

// "dd/mm/aaaa" em qualquer lugar do texto → "aaaa-mm-dd".
function dataBR(texto: string) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function acharCabecalho(linhas: Celula[][], exigidas: ((t: string) => boolean)[]) {
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const nomes = (linhas[i] ?? []).map(normalizar);
    const colunas = exigidas.map((f) => nomes.findIndex(f));
    if (colunas.every((c) => c >= 0)) return { linha: i, colunas, nomes };
  }
  return null;
}

// Contagem exportada pelo Omnia (ou qualquer planilha com as colunas Produto e Qtd Contada).
// Categoria e Unidade são opcionais. A data vem de "Data de Término" (ou "Data de Início"), se houver.
export function lerContagem(linhas: Celula[][]): { data: string | null; itens: ItemImportado[]; erros: string[] } | { erro: string } {
  const cab = acharCabecalho(linhas, [(t) => t === "produto" || t === "item" || t === "insumo", (t) => t.startsWith("qtd contada") || t === "quantidade contada" || t === "contado"]);
  if (!cab) return { erro: "Não encontrei as colunas “Produto” e “Qtd Contada” na planilha." };
  const [cNome, cQtd] = cab.colunas;
  const cCategoria = cab.nomes.indexOf("categoria");
  const cUnidade = cab.nomes.findIndex((t) => t === "unidade" || t === "un");

  let data: string | null = null;
  for (const l of linhas.slice(0, cab.linha)) {
    const t = (l ?? []).map((c) => String(c ?? "")).join(" ");
    if (/t[ée]rmino/i.test(t)) data = dataBR(t) ?? data;
    else if (!data && /in[íi]cio/i.test(t)) data = dataBR(t);
  }

  const itens: ItemImportado[] = [];
  const erros: string[] = [];
  const vistos = new Set<string>();
  for (const [i, l] of linhas.slice(cab.linha + 1).entries()) {
    const nome = String(l?.[cNome] ?? "").trim();
    const n = cab.linha + i + 2;
    if (!nome) {
      const qtd = numeroCelula(l?.[cQtd] ?? null);
      if (qtd) erros.push(`Linha ${n}: quantidade ${qtd} sem nome do produto; ficou de fora.`);
      continue;
    }
    const quantidade = numeroCelula(l?.[cQtd] ?? null);
    if (quantidade === null) {
      erros.push(`Linha ${n} (${nome}): quantidade contada vazia ou inválida.`);
      continue;
    }
    if (quantidade < 0) {
      erros.push(`Linha ${n} (${nome}): quantidade negativa.`);
      continue;
    }
    const chave = normalizar(nome);
    if (vistos.has(chave)) {
      erros.push(`Linha ${n} (${nome}): item repetido na planilha; ficou só a primeira linha.`);
      continue;
    }
    vistos.add(chave);
    itens.push({
      nome,
      categoria: cCategoria >= 0 ? String(l?.[cCategoria] ?? "").trim() || null : null,
      unidade: (cUnidade >= 0 ? String(l?.[cUnidade] ?? "").trim() : "") || "un",
      quantidade,
    });
  }
  return { data, itens, erros };
}

// Lista de custos: uma coluna com o nome (Item, Produto ou Insumo, mesmo com complemento, ex.: "Item (Omnia)")
// e uma coluna de custo (a primeira cujo título começa com "Custo").
export function lerCustos(linhas: Celula[][]): { custos: { nome: string; custo: number }[]; erros: string[] } | { erro: string } {
  const cab = acharCabecalho(linhas, [(t) => /^(item|produto|insumo)\b/.test(t), (t) => t.startsWith("custo")]);
  if (!cab) return { erro: "Não encontrei as colunas do nome (Item, Produto ou Insumo) e do custo na planilha." };
  const [cNome, cCusto] = cab.colunas;
  const custos: { nome: string; custo: number }[] = [];
  const erros: string[] = [];
  for (const [i, l] of linhas.slice(cab.linha + 1).entries()) {
    const nome = String(l?.[cNome] ?? "").trim();
    if (!nome) continue;
    const bruto = l?.[cCusto] ?? null;
    if (bruto === null || String(bruto).trim() === "") continue; // sem custo na planilha: fica como está
    const custo = numeroCelula(bruto);
    if (custo === null || custo < 0) {
      erros.push(`Linha ${cab.linha + i + 2} (${nome}): custo inválido.`);
      continue;
    }
    custos.push({ nome, custo });
  }
  return { custos, erros };
}

export const chaveNome = (nome: string) => normalizar(nome);

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

// Valor de uma linha em centavos: quantidade × custo. Linha fora do CMV ou sem custo vale 0.
export function valorLinha(l: { quantidade: number; custo_unitario: number | null; fora_do_cmv: boolean }) {
  if (l.fora_do_cmv || l.custo_unitario === null) return 0;
  return Math.round(Number(l.quantidade) * Number(l.custo_unitario) * 100);
}

// Numa contagem em rascunho, o custo e o "fora do CMV" ainda vêm do insumo; na fechada, da própria linha.
export function linhaComCusto(l: LinhaContagem, situacao: Contagem["situacao"], itens: Map<string, ItemEstoque>) {
  if (situacao === "fechada" || !l.item_id) return l;
  const item = itens.get(l.item_id);
  return item ? { ...l, custo_unitario: item.custo_unitario, fora_do_cmv: item.fora_do_cmv } : l;
}

export function resumoContagem(linhas: { quantidade: number; custo_unitario: number | null; fora_do_cmv: boolean }[]) {
  let centavos = 0;
  let semCusto = 0;
  let fora = 0;
  for (const l of linhas) {
    if (l.fora_do_cmv) fora++;
    else if (l.custo_unitario === null && Number(l.quantidade) > 0) semCusto++;
    centavos += valorLinha(l);
  }
  return { centavos, semCusto, fora, itens: linhas.length };
}

const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
export const diaAnterior = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);

export type VariacaoMes =
  | { mes: string; centavos: number; inicial: number; final: number }
  | { mes: string; centavos: null; motivo: "sem_contagem" | "mes_incompleto"; faltam: string[] };

// Variação de estoque de cada mês do período (AAAA-MM-01), pelas contagens fechadas.
// Só vale para mês inteiro dentro do período: num recorte de dias, o estoque do meio do mês não é conhecido.
export function variacoesEstoque(
  contagens: { data: string; situacao: Contagem["situacao"]; centavos: number }[],
  meses: string[],
  inicio: string,
  fim: string,
): VariacaoMes[] {
  const fechadas = new Map(contagens.filter((c) => c.situacao === "fechada").map((c) => [c.data, c.centavos]));
  return meses.map((mes) => {
    const ultimo = ultimoDia(mes);
    const anterior = diaAnterior(mes);
    if (mes < inicio || ultimo > fim) return { mes, centavos: null, motivo: "mes_incompleto", faltam: [] };
    const inicial = fechadas.get(anterior);
    const final = fechadas.get(ultimo);
    if (inicial === undefined || final === undefined) {
      return { mes, centavos: null, motivo: "sem_contagem", faltam: [inicial === undefined && anterior, final === undefined && ultimo].filter(Boolean) as string[] };
    }
    return { mes, centavos: final - inicial, inicial, final };
  });
}
