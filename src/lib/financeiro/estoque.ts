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
  conteudo?: number | null; // 0021: quanto vale 1 unidade contada (ex.: 1 un = 100 g)
  conteudo_medida?: string | null;
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

// ---------------------------------------------------------------------------
// Etapa 2 (migração 0019): fichas técnicas, vendas do PDV e CMV teórico
// ---------------------------------------------------------------------------

export type Produto = { id: string; empresa_id: string; nome: string; categoria: string | null; ativo: boolean };
export type LinhaFicha = { id: string; produto_id: string; item_id: string; quantidade: number; ordem: number };
export type VendaMes = { id: string; empresa_id: string; mes: string; arquivo_nome: string | null; criado_em: string };
export type LinhaVenda = {
  id: string;
  venda_id: string;
  produto_id: string | null;
  nome_origem: string;
  categoria_origem: string | null;
  quantidade: number;
  valor: number | null;
  ordem: number;
};
export type VendaImportada = { nome: string; categoria: string | null; quantidade: number; valor: number | null };
export type FichaImportada = { produto: string; categoria: string | null; itens: { insumo: string; unidade: string; quantidade: number }[] };

// Relatório de vendas por produto (PDV): colunas Produto e Quantidade; Categoria e Total de venda, se houver.
// Linha sem nome (o total do relatório, por exemplo) fica de fora; o mesmo produto em duas linhas é somado.
export function lerVendas(linhas: Celula[][]): { itens: VendaImportada[]; erros: string[] } | { erro: string } {
  const cab = acharCabecalho(linhas, [
    (t) => /^(produto|item|descricao)\b/.test(t),
    (t) => /^(quant|qtd|qtde)\b/.test(t) || t === "quantidade vendida",
  ]);
  if (!cab) return { erro: "Não encontrei as colunas “Produto” e “Quantidade” no relatório." };
  const [cNome, cQtd] = cab.colunas;
  const cCategoria = cab.nomes.findIndex((t) => t === "categoria" || t === "grupo");
  const cValor = cab.nomes.findIndex((t) => /^(total venda|total vendido|valor total|total|valor|venda total)$/.test(t));
  const porNome = new Map<string, VendaImportada>();
  const erros: string[] = [];
  for (const [i, l] of linhas.slice(cab.linha + 1).entries()) {
    const nome = String(l?.[cNome] ?? "").trim();
    if (!nome) continue;
    const n = cab.linha + i + 2;
    const quantidade = numeroCelula(l?.[cQtd] ?? null);
    if (quantidade === null || quantidade < 0) {
      erros.push(`Linha ${n} (${nome}): quantidade vazia ou inválida.`);
      continue;
    }
    if (quantidade === 0) continue;
    const valor = cValor >= 0 ? numeroCelula(l?.[cValor] ?? null) : null;
    const chave = normalizar(nome);
    const atual = porNome.get(chave);
    if (atual) {
      atual.quantidade += quantidade;
      atual.valor = atual.valor === null && valor === null ? null : (atual.valor ?? 0) + (valor ?? 0);
    } else {
      porNome.set(chave, { nome, categoria: cCategoria >= 0 ? String(l?.[cCategoria] ?? "").trim() || null : null, quantidade, valor });
    }
  }
  return { itens: [...porNome.values()], erros };
}

// Fichas em planilha "plana": uma linha por ingrediente, com Produto, Insumo e Quantidade (na unidade do insumo).
// Unidade e Categoria são opcionais. As linhas do mesmo produto formam a ficha dele.
export function lerFichas(linhas: Celula[][]): { fichas: FichaImportada[]; erros: string[] } | { erro: string } {
  const cab = acharCabecalho(linhas, [(t) => t === "produto", (t) => /^(insumo|ingrediente)\b/.test(t), (t) => /^(quantidade|qtd|qtde)\b/.test(t)]);
  if (!cab) return { erro: "Não encontrei as colunas “Produto”, “Insumo” e “Quantidade” na planilha." };
  const [cProduto, cInsumo, cQtd] = cab.colunas;
  const cUnidade = cab.nomes.findIndex((t) => t === "unidade" || t === "un");
  const cCategoria = cab.nomes.findIndex((t) => t === "categoria");
  const porProduto = new Map<string, FichaImportada>();
  const erros: string[] = [];
  for (const [i, l] of linhas.slice(cab.linha + 1).entries()) {
    const produto = String(l?.[cProduto] ?? "").trim();
    const insumo = String(l?.[cInsumo] ?? "").trim();
    if (!produto && !insumo) continue;
    const n = cab.linha + i + 2;
    const quantidade = numeroCelula(l?.[cQtd] ?? null);
    if (!produto || !insumo) {
      erros.push(`Linha ${n}: falta o ${produto ? "insumo" : "produto"}.`);
      continue;
    }
    if (quantidade === null || quantidade <= 0) {
      erros.push(`Linha ${n} (${produto} · ${insumo}): quantidade vazia ou inválida.`);
      continue;
    }
    const chave = normalizar(produto);
    const ficha = porProduto.get(chave) ?? { produto, categoria: cCategoria >= 0 ? String(l?.[cCategoria] ?? "").trim() || null : null, itens: [] };
    ficha.itens.push({ insumo, unidade: (cUnidade >= 0 ? String(l?.[cUnidade] ?? "").trim() : "") || "un", quantidade });
    porProduto.set(chave, ficha);
  }
  return { fichas: [...porProduto.values()], erros };
}

// Custo de uma unidade do produto pela ficha, com os custos atuais dos insumos (em reais).
// Insumo sem custo conta como zero e é avisado em semCusto.
export function custoFicha(ficha: { item_id: string; quantidade: number }[], itens: Map<string, Pick<ItemEstoque, "custo_unitario">>) {
  let custo = 0;
  let semCusto = 0;
  for (const l of ficha) {
    const c = itens.get(l.item_id)?.custo_unitario;
    if (c === null || c === undefined) semCusto++;
    else custo += Number(l.quantidade) * Number(c);
  }
  return { custo, semCusto };
}

export type LinhaCmv = {
  produto_id: string | null;
  nome: string;
  categoria: string | null;
  quantidade: number;
  venda: number | null; // centavos
  custoUnitario: number | null; // reais; null = sem ficha
  cmv: number | null; // centavos
  semCusto: number; // insumos da ficha ainda sem custo
};

// CMV teórico do mês: em cada produto vendido, quantidade × custo da ficha. Produto sem ficha fica de fora do total
// e aparece em semFicha, com a venda dele, para mostrar quanto da venda está coberto.
export function cmvTeorico(
  vendas: Pick<LinhaVenda, "produto_id" | "nome_origem" | "categoria_origem" | "quantidade" | "valor">[],
  fichas: Map<string, { item_id: string; quantidade: number }[]>,
  itens: Map<string, Pick<ItemEstoque, "custo_unitario">>,
) {
  const linhas: LinhaCmv[] = vendas.map((v) => {
    const ficha = v.produto_id ? fichas.get(v.produto_id) : undefined;
    const venda = v.valor === null ? null : Math.round(Number(v.valor) * 100);
    if (!ficha?.length) return { produto_id: v.produto_id, nome: v.nome_origem, categoria: v.categoria_origem, quantidade: Number(v.quantidade), venda, custoUnitario: null, cmv: null, semCusto: 0 };
    const { custo, semCusto } = custoFicha(ficha, itens);
    return {
      produto_id: v.produto_id,
      nome: v.nome_origem,
      categoria: v.categoria_origem,
      quantidade: Number(v.quantidade),
      venda,
      custoUnitario: custo,
      cmv: Math.round(Number(v.quantidade) * custo * 100),
      semCusto,
    };
  });
  const soma = (f: (l: LinhaCmv) => number | null, filtro: (l: LinhaCmv) => boolean = () => true) =>
    linhas.filter(filtro).reduce((a, l) => a + (f(l) ?? 0), 0);
  const comFicha = (l: LinhaCmv) => l.cmv !== null;
  return {
    linhas,
    venda: soma((l) => l.venda),
    vendaComFicha: soma((l) => l.venda, comFicha),
    cmv: soma((l) => l.cmv, comFicha),
    semFicha: { produtos: linhas.filter((l) => !comFicha(l)).length, venda: soma((l) => l.venda, (l) => !comFicha(l)) },
    comInsumoSemCusto: linhas.filter((l) => l.semCusto > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Medidas na ficha técnica: digitar em g ou ml e gravar na unidade em que o insumo é contado
// ---------------------------------------------------------------------------

const MEDIDAS: Record<string, { tipo: "massa" | "volume"; base: number }> = {
  g: { tipo: "massa", base: 1 },
  kg: { tipo: "massa", base: 1000 },
  ml: { tipo: "volume", base: 1 },
  L: { tipo: "volume", base: 1000 },
};
// 0022: o conteúdo também pode ser em pacotes ou unidades (ex.: 1 cx = 12 pct de Fini; cada bebida leva 1 pct).
const CONTAGENS = ["un", "pct"];
export const MEDIDAS_CONTEUDO = [...Object.keys(MEDIDAS), ...CONTAGENS];

// "Kg", "KG", "kilo" → "kg"; "l", "lt", "litro" → "L"; o resto (un, pct, cx...) não é medida.
export function medidaPadronizada(unidade: string | null | undefined): string | null {
  const u = String(unidade ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (["g", "gr", "grama", "gramas"].includes(u)) return "g";
  if (["kg", "kilo", "quilo", "kgs"].includes(u)) return "kg";
  if (["ml", "mililitro", "mililitros"].includes(u)) return "ml";
  if (["l", "lt", "litro", "litros"].includes(u)) return "L";
  return null;
}

// fator = quantas unidades contadas cabem em 1 da medida escolhida (ex.: insumo em kg, medida g → 0,001).
export type OpcaoMedida = { medida: string; fator: number };

export function opcoesMedida(item: Pick<ItemEstoque, "unidade" | "conteudo" | "conteudo_medida">): OpcaoMedida[] {
  const propria = medidaPadronizada(item.unidade);
  if (propria) {
    const { tipo, base } = MEDIDAS[propria];
    return Object.entries(MEDIDAS)
      .filter(([, m]) => m.tipo === tipo)
      .map(([medida, m]) => ({ medida, fator: m.base / base }));
  }
  const opcoes: OpcaoMedida[] = [{ medida: item.unidade, fator: 1 }];
  const cm = item.conteudo_medida ? MEDIDAS[item.conteudo_medida] : undefined;
  if (cm && item.conteudo && item.conteudo > 0) {
    const total = item.conteudo * cm.base; // 1 unidade contada, em g ou ml
    for (const [medida, m] of Object.entries(MEDIDAS)) if (m.tipo === cm.tipo) opcoes.push({ medida, fator: m.base / total });
  } else if (item.conteudo_medida && CONTAGENS.includes(item.conteudo_medida) && item.conteudo && item.conteudo > 0) {
    // 1 cx = 12 pct → 1 pct vale 1/12 da caixa. Mesma unidade dos dois lados (1 un = 5 un) não faz sentido e fica de fora.
    if (item.conteudo_medida.toLowerCase() !== String(item.unidade).trim().toLowerCase())
      opcoes.push({ medida: item.conteudo_medida, fator: 1 / item.conteudo });
  }
  return opcoes;
}

// Medida mais natural para digitar uma porção: g ou ml quando há; senão a parte (pct, un) quando há; senão a própria unidade contada.
export function medidaInicial(opcoes: OpcaoMedida[]) {
  return opcoes.find((o) => o.medida === "g" || o.medida === "ml") ?? opcoes[1] ?? opcoes[0];
}

// Valor na medida escolhida, sem a sujeira do ponto flutuante (0,02 kg → 20 g, não 20,000000000000004).
export const naMedida = (quantidadeContada: number, fator: number) => Number((quantidadeContada / fator).toFixed(6));
