// Leitura do DANFE (NF-e) e do DANFSe (NFS-e nacional) em PDF digital, aquele em que dá para selecionar o texto.
// Sem custo e sem serviço de fora: o navegador tira o texto do PDF com a posição de cada pedaço (ler-pdf.ts) e
// esta parte, pura, acha os campos pelo rótulo do quadro e o valor logo abaixo dele. PDF escaneado (só imagem)
// não tem texto: a nota é lançada à mão.
//
// O que vem do PDF é conferido antes de gravar, na mesma tela do XML. A chave de acesso de 44 dígitos traz o CNPJ
// do emitente, o modelo, a série e o número, então o cabeçalho é firme; os itens são lidos linha a linha e a soma
// deles é conferida com o total da nota.

import { ratearCentavos, notaReferida, soDigitos, type Duplicata, type ItemNota, type NotaLida, type ErroNota } from "./notas";

// Um pedaço de texto do PDF. x e y em pontos, a partir do canto de cima à esquerda; y é a linha de base.
export type TextoPdf = { texto: string; x: number; y: number; largura: number; altura: number };
export type PaginaPdf = { largura: number; altura: number; textos: TextoPdf[] };

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

// Sem acento, maiúsculo e com um espaço só: "Data da Emissão" → "DATA DA EMISSAO".
export const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/ ?\/ ?/g, "/")
    .trim();

// Número no padrão brasileiro ("1.234,56", "0,2180", "17.00", "R$ 2.121,99") → número. null se não for número.
export function numeroBR(s: string): number | null {
  const t = s.replace(/R\$/i, "").replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  let v: string;
  if (t.includes(",")) {
    if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null;
    v = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) v = t.replace(/\./g, "");
  else if (/^-?\d+(\.\d+)?$/.test(t)) v = t;
  else return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const centavos = (n: number) => Math.round(n * 100);
const ehValor = (s: string) => /^(R\$\s*)?-?[\d.]*\d,\d{2,4}$/.test(s.trim());
const DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const dataIso = (s: string | null | undefined) => {
  const m = s ? DATA.exec(s) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// Linhas: pedaços com a linha de base perto (até 3 pt) ficam juntos, da esquerda para a direita.
type Linha = { y: number; textos: TextoPdf[]; texto: string };
function linhas(textos: TextoPdf[], tolerancia = 3): Linha[] {
  const ordem = [...textos].sort((a, b) => a.y - b.y || a.x - b.x);
  const saida: Linha[] = [];
  for (const t of ordem) {
    const ultima = saida[saida.length - 1];
    if (ultima && t.y - ultima.y <= tolerancia) ultima.textos.push(t);
    else saida.push({ y: t.y, textos: [t], texto: "" });
  }
  for (const l of saida) {
    l.textos.sort((a, b) => a.x - b.x);
    l.texto = l.textos.map((t) => t.texto.trim()).join(" ");
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Rótulo e valor: no DANFE cada campo é um quadro com o rótulo em cima e o valor embaixo, dentro da mesma coluna.
// ---------------------------------------------------------------------------

type Rotulo = (n: string) => boolean;
const igual =
  (...nomes: string[]): Rotulo =>
  (n) =>
    nomes.some((x) => n === normal(x));
const comeca =
  (...nomes: string[]): Rotulo =>
  (n) =>
    nomes.some((x) => n.startsWith(normal(x)));

function rotulos(p: PaginaPdf, r: Rotulo, depoisDe = -Infinity) {
  return p.textos.filter((t) => t.y > depoisDe && r(normal(t.texto))).sort((a, b) => a.y - b.y || a.x - b.x);
}

// O valor do quadro: o pedaço logo abaixo do rótulo (até 30 pt), na coluna que vai do rótulo até o próximo rótulo
// da mesma linha. `filtro` diz que tipo de valor serve (data, número...).
function abaixo(p: PaginaPdf, rotulo: TextoPdf, filtro: (s: string) => boolean): string | null {
  const vizinhos = p.textos.filter((t) => t !== rotulo && Math.abs(t.y - rotulo.y) <= 2 && t.x > rotulo.x + 1);
  const fim = vizinhos.length ? Math.min(...vizinhos.map((t) => t.x)) : p.largura + 1;
  const ini = rotulo.x - 3;
  const cands = p.textos
    .filter((t) => t.y > rotulo.y + 2 && t.y <= rotulo.y + 30 && t.x >= ini && t.x < fim && filtro(t.texto.trim()))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return cands[0]?.texto.trim() ?? null;
}

function campo(p: PaginaPdf, r: Rotulo, filtro: (s: string) => boolean, depoisDe = -Infinity): string | null {
  for (const rot of rotulos(p, r, depoisDe)) {
    const v = abaixo(p, rot, filtro);
    if (v !== null) return v;
  }
  return null;
}

function valorCampo(p: PaginaPdf, r: Rotulo, depoisDe = -Infinity): number | null {
  const v = campo(p, r, ehValor, depoisDe);
  const n = v === null ? null : numeroBR(v);
  return n === null ? null : centavos(n);
}

// ---------------------------------------------------------------------------
// Chave de acesso
// ---------------------------------------------------------------------------

// Dígito verificador da chave da NF-e (módulo 11, pesos 2 a 9 da direita para a esquerda).
export function chaveValida(chave: string) {
  if (!/^\d{44}$/.test(chave)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}

// A chave no texto: primeiro do jeito que o DANFE imprime (11 grupos de 4 dígitos, ou os 44 juntos); depois,
// qualquer sequência de dígitos com espaços ou pontos, desde que a chave tenha forma de chave (UF, mês, modelo)
// e o dígito verificador confira.
const formaDeChave = (c: string) => chaveValida(c) && Number(c.slice(0, 2)) >= 11 && Number(c.slice(0, 2)) <= 53 && Number(c.slice(4, 6)) >= 1 && Number(c.slice(4, 6)) <= 12 && ["55", "65"].includes(c.slice(20, 22));
function acharChave(texto: string): string | null {
  for (const m of texto.matchAll(/(?<!\d)(\d{4}(?: \d{4}){10}|\d{44})(?!\d)/g)) {
    const c = soDigitos(m[1]);
    if (formaDeChave(c)) return c;
  }
  for (const m of texto.matchAll(/\d[\d .]*\d/g)) {
    const d = soDigitos(m[0]);
    for (let i = 0; i + 44 <= d.length; i++) {
      const c = d.slice(i, i + 44);
      if (formaDeChave(c)) return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export function lerNotaPdf(paginas: PaginaPdf[]): NotaLida | ErroNota {
  const todos = paginas.flatMap((p) => p.textos);
  if (todos.filter((t) => t.texto.trim()).length < 10) {
    return { erro: "Este PDF não tem texto (parece escaneado ou foto). Lance a nota à mão." };
  }
  const corrido = paginas.map((p) => linhas(p.textos).map((l) => l.texto).join("\n")).join("\n");
  const n = normal(corrido);
  const chave = acharChave(corrido);
  if (chave) {
    const modelo = chave.slice(20, 22);
    if (modelo === "65") return { erro: "Este PDF é uma NFC-e (cupom). Só a NF-e (modelo 55) traz os itens de compra." };
    if (modelo === "55") return lerDanfe(paginas, chave);
  }
  if (/DANFS-?E|NFS-E|NOTA FISCAL DE SERVICO|PRESTADOR DE SERVICO|PRESTADOR/.test(n)) return lerDanfse(paginas, corrido);
  if (/DANFE/.test(n)) return { erro: "Não achei a chave de acesso de 44 dígitos neste DANFE. Lance a nota à mão ou use o XML." };
  return { erro: "Não reconheci este PDF como DANFE (NF-e) nem como NFS-e." };
}

// ---------------------------------------------------------------------------
// DANFE (NF-e modelo 55)
// ---------------------------------------------------------------------------

const R = {
  emissao: igual("DATA DE EMISSÃO", "DATA DA EMISSÃO", "DATA EMISSÃO", "EMISSÃO"),
  saida: comeca("DATA SAÍDA", "DATA DA SAÍDA", "DATA DE SAÍDA", "DATA ENT", "DATA DA ENT", "DATA DE ENT"),
  total: igual("VALOR TOTAL DA NOTA", "VALOR TOTAL DA NF-E", "VALOR TOTAL DA NOTA FISCAL", "V. TOTAL DA NOTA", "VLR TOTAL DA NOTA", "TOTAL DA NOTA"),
  produtos: igual("VALOR TOTAL DOS PRODUTOS", "V. TOTAL DOS PRODUTOS", "V. TOTAL PRODUTOS", "VLR TOTAL DOS PRODUTOS", "TOTAL DOS PRODUTOS"),
  frete: igual("VALOR DO FRETE", "V. FRETE", "VLR DO FRETE", "FRETE"),
  seguro: igual("VALOR DO SEGURO", "V. SEGURO", "VLR DO SEGURO", "SEGURO"),
  desconto: igual("DESCONTO", "VALOR DO DESCONTO", "V. DESCONTO", "VLR DO DESCONTO", "DESCONTOS"),
  outras: igual("OUTRAS DESP. ACESSÓRIAS", "OUTRAS DESPESAS ACESSÓRIAS", "OUTRAS DESPESAS", "VALOR DE DESPESAS", "OUTRAS DESP.", "DESPESAS ACESSÓRIAS", "V. OUTRAS DESP."),
  ipi: igual("VALOR DO IPI", "VALOR TOTAL DO IPI", "V. IPI", "VLR DO IPI", "V. TOTAL IPI"),
  st: igual("VALOR ICMS SUBSTITUIÇÃO", "VALOR DO ICMS SUBSTITUIÇÃO", "VALOR DO ICMS ST", "VALOR ICMS ST", "V. ICMS SUBST.", "V. ICMS ST", "VALOR DO ICMS SUBST."),
};

function emitenteDanfe(p: PaginaPdf): string | null {
  for (const t of p.textos) {
    const m = /RECEBE(?:MOS|U)\s+DE\s+(.+?)(?:\s+OS\s+PRODUTOS|\s+A\s+MERCADORIA|$)/i.exec(t.texto.trim());
    if (m && m[1].trim().length > 2) return m[1].trim().replace(/[\s,.-]+$/, "");
  }
  // Sem o nome no canhoto: o quadro do emitente fica à esquerda do título "DANFE", e o nome é o texto de letra maior.
  const titulo = p.textos.find((t) => normal(t.texto) === "DANFE");
  if (titulo) {
    const quadro = p.textos.filter((t) => t.x + t.largura < titulo.x - 4 && t.y > titulo.y - 40 && t.y < titulo.y + 80 && /[A-Za-z]{3}/.test(t.texto) && !/^(IDENTIFICA|DANFE)/.test(normal(t.texto)));
    const maior = Math.max(0, ...quadro.map((t) => t.altura));
    const nome = quadro.filter((t) => t.altura >= maior - 0.5).sort((a, b) => a.y - b.y);
    if (nome.length && nome.length <= 3) return nome.map((t) => t.texto.trim()).join(" ");
  }
  return null;
}

function lerDanfe(paginas: PaginaPdf[], chave: string): NotaLida | ErroNota {
  const p1 = paginas[0];
  const avisos: string[] = [];
  const cnpj = chave.slice(6, 20);
  const serie = String(Number(chave.slice(22, 25)));
  const numero = String(Number(chave.slice(25, 34)));
  const anoMes = `20${chave.slice(2, 4)}-${chave.slice(4, 6)}`;

  // Data de emissão: o quadro do destinatário (o do canhoto, se não houver). Tem de bater com o ano/mês da chave.
  let emissao = dataIso(campo(p1, R.emissao, (s) => DATA.test(s)));
  if (!emissao || !emissao.startsWith(anoMes)) {
    const qualquer = p1.textos.map((t) => dataIso(t.texto)).find((d) => d?.startsWith(anoMes));
    emissao = qualquer ?? emissao;
  }
  const saida = dataIso(campo(p1, R.saida, (s) => DATA.test(s)));

  const valor = (r: Rotulo) => valorCampo(p1, r) ?? 0;
  const total = valorCampo(p1, R.total);
  const frete = valor(R.frete);
  const produtos = valorCampo(p1, R.produtos);
  const extras = valor(R.ipi) + valor(R.st) + valor(R.outras) + valor(R.seguro) - valor(R.desconto);

  const itens = paginas.flatMap(itensDanfe);
  if (itens.length === 0) {
    return { erro: "Li o cabeçalho deste DANFE, mas não consegui ler os itens. Use o XML da nota ou lance à mão." };
  }
  const somaItens = itens.reduce((s, i) => s + i.valor, 0);
  if (produtos !== null && Math.abs(produtos - somaItens) > 1) {
    avisos.push(
      `Os itens lidos somam ${brl(somaItens)}, mas o DANFE diz ${brl(produtos)} em produtos. Algum item pode ter ficado de fora ou com valor errado: confira com o PDF.`,
    );
  }
  const valorTotal = total ?? somaItens + frete + extras;
  // IPI, ICMS ST, seguro, outras despesas e desconto entram no custo do item (como no XML). O DANFE não mostra
  // tudo isso por item, então a diferença que eles explicam vai para os itens na proporção do valor.
  const resto = valorTotal - frete - somaItens;
  if (resto !== 0 && extras !== 0 && Math.abs(resto - extras) <= 1 && (produtos === null || Math.abs(produtos - somaItens) <= 1)) {
    const partes = ratearCentavos(resto, itens.map((i) => i.valor));
    itens.forEach((i, k) => (i.valor += partes[k]));
    avisos.push(`${brl(resto)} de impostos, despesas ou desconto da nota (IPI, ICMS ST, seguro, outras, desconto) foram divididos entre os itens, na proporção do valor.`);
  } else if (Math.abs(resto) > 1) {
    avisos.push(`A soma dos itens com o frete difere do total da nota em ${brl(resto)}. Confira com o PDF antes de gravar.`);
  }
  if (total === null) avisos.push("Não achei o valor total no DANFE: usei a soma dos itens. Confira.");
  avisos.unshift("Nota lida do PDF: confira os itens e os valores com o documento antes de gravar.");

  const duplicatas = duplicatasDanfe(p1, valorTotal, avisos);
  const emitente = emitenteDanfe(p1);
  if (!emitente) avisos.push("Não achei o nome do emitente no PDF. Escolha o fornecedor pelo CNPJ.");
  return {
    tipo: "produto",
    chave,
    numero,
    serie,
    emissao,
    saida,
    emitente: { documento: cnpj, nome: emitente ?? `CNPJ ${cnpj}` },
    valorTotal,
    frete,
    itens,
    duplicatas,
    informacoes: informacoes(p1),
    notaReferida: null,
    avisos,
  };
}

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Itens: o quadro "DADOS DO PRODUTO/SERVIÇO", do cabeçalho da tabela até "DADOS ADICIONAIS" (ou o fim da página).
// Uma linha de item tem código, descrição, NCM (8 dígitos), CST/CSOSN, CFOP, unidade e os números. Quando a descrição
// não cabe, ela continua na linha de baixo, na coluna da descrição; outras linhas ali (informação adicional do
// produto, unidade tributável) não entram.
const LINHA_ITEM = /^(\S+)\s+(.+?)\s+(\d{8}|\d{4}\.\d{2}\.\d{2})\s+(?:\d{1,4}(?:\/\d{1,4})?\s+)?([1-7]\.?\d{3})\s+([A-Za-z][A-Za-z0-9.\/]{0,7})\s+(-?[\d.,]+(?:\s+-?[\d.,]+)*)/;
const FIM_ITENS = /^(DADOS ADICIONAIS|INFORMACOES COMPLEMENTARES|CALCULO DO ISSQN|RESERVADO AO FISCO|DADOS DO ISSQN)/;

function itensDanfe(p: PaginaPdf): ItemNota[] {
  const ls = linhas(p.textos);
  // Começo: o cabeçalho da tabela (a linha com "DESCRIÇÃO"), ou o título do quadro, ou o topo da página.
  const titulo = ls.findIndex((l) => /^DADOS DOS? PRODUTOS?/.test(normal(l.texto)));
  const cab = ls.findIndex((l, i) => i >= titulo && /DESCRI/.test(normal(l.texto)));
  const ini = cab >= 0 ? cab : titulo;
  const descCab = cab >= 0 ? ls[cab].textos.find((t) => /DESCRI/.test(normal(t.texto)))?.x : undefined;
  const itens: ItemNota[] = [];
  let cheia = false; // a descrição da linha anterior foi até a coluna do NCM (então pode continuar embaixo)
  let colNcm = Infinity;
  for (const l of ls.slice(ini + 1)) {
    if (FIM_ITENS.test(normal(l.texto))) break;
    const m = LINHA_ITEM.exec(l.texto);
    if (m) {
      const nums = m[6].split(/\s+/).map(numeroBR);
      const q = nums[0];
      const u = nums[1];
      if (q === null || u === null || q <= 0) continue;
      // O valor do item é o número que fecha com quantidade × unitário (pula a coluna de desconto, se houver).
      const alvo = q * u;
      const v = nums.slice(2, 6).find((x) => x !== null && Math.abs(x - alvo) <= Math.max(0.02, Math.abs(x) * 0.005)) ?? nums[2] ?? alvo;
      itens.push({ codigo: m[1], descricao: m[2].trim(), unidade: m[5].toUpperCase(), quantidade: q, valor: centavos(v) });
      const ncm = l.textos.find((t) => t.texto.trim().startsWith(m[3]) || t.texto.includes(` ${m[3]}`));
      colNcm = ncm ? ncm.x + (ncm.texto.trim().startsWith(m[3]) ? 0 : ncm.largura * (ncm.texto.indexOf(m[3]) / ncm.texto.length)) : colNcm;
      const desc = l.textos.filter((t) => t.x + 1 < colNcm && t !== l.textos[0]);
      const iniDesc = descCab ?? (desc[0]?.x ?? 0);
      const fimDesc = Math.max(0, ...desc.map((t) => t.x + t.largura));
      cheia = Number.isFinite(colNcm) && desc.length > 0 && colNcm - fimDesc < Math.max(10, (colNcm - iniDesc) * 0.2);
    } else if (itens.length && cheia && !l.textos.some((t) => t.x + 1 >= colNcm)) {
      // Só texto na coluna da descrição; com números em outras colunas (unidade tributável) ou com cara de
      // informação adicional ("Lote: 12", "FCI ...%"), não é continuação.
      const resto = l.textos
        .filter((t) => t.x + 1 < colNcm)
        .map((t) => t.texto.trim())
        .join(" ")
        .trim();
      if (resto && resto.length <= 60 && !/^[\d.,\s]+$/.test(resto) && !/[:=%]/.test(resto)) itens[itens.length - 1].descricao += ` ${resto}`;
      cheia = false;
    } else cheia = false;
  }
  return itens;
}

// Fatura/duplicatas: cada "número vencimento valor" no quadro FATURA, até o cálculo do imposto.
function duplicatasDanfe(p: PaginaPdf, total: number, avisos: string[]): Duplicata[] {
  const ls = linhas(p.textos);
  const ini = ls.findIndex((l) => /^(FATURA|DUPLICATA|COBRANCA)/.test(normal(l.texto)) || normal(l.texto) === "DUPLICATAS");
  if (ini < 0) return [];
  const fim = ls.findIndex((l, i) => i > ini && /CALCULO DO IMPOSTO|CALCULO DE IMPOSTO/.test(normal(l.texto)));
  const dups: Duplicata[] = [];
  for (const l of ls.slice(ini + 1, fim < 0 ? ini + 8 : fim)) {
    for (const m of l.texto.matchAll(/(?:(\S+)\s+)?(\d{2}\/\d{2}\/\d{4})\s+(?:R\$\s*)?(\d[\d.]*,\d{2})/g)) {
      const valor = numeroBR(m[3]);
      const venc = dataIso(m[2]);
      if (valor && venc) dups.push({ numero: m[1] && !DATA.test(m[1]) && !ehValor(m[1]) ? m[1] : null, vencimento: venc, valor: centavos(valor) });
    }
  }
  if (!dups.length) return [];
  const soma = dups.reduce((s, d) => s + d.valor, 0);
  if (Math.abs(soma - total) > dups.length) {
    avisos.push(`As parcelas lidas do PDF somam ${brl(soma)} e não fecham com o total. Confira os vencimentos.`);
    return [];
  }
  return dups;
}

function informacoes(p: PaginaPdf): string | null {
  const rot = rotulos(p, comeca("INFORMAÇÕES COMPLEMENTARES", "INFORMACOES COMPLEMENTARES", "INF. COMPLEMENTARES"))[0];
  if (!rot) return null;
  const fisco = rotulos(p, comeca("RESERVADO AO FISCO")).find((t) => Math.abs(t.y - rot.y) < 10);
  const limite = fisco ? fisco.x - 2 : p.largura;
  const texto = linhas(p.textos.filter((t) => t.y > rot.y + 2 && t.y < rot.y + 160 && t.x < limite))
    .map((l) => l.texto)
    .filter((t) => !/^(DATA CIENTIFICA|IMPRESS[AÃ]O:)/i.test(t))
    .join(" ")
    .trim();
  return texto ? texto.slice(0, 2000) : null;
}

// ---------------------------------------------------------------------------
// DANFSe (NFS-e padrão nacional) e, no que der, NFS-e de prefeitura com rótulos parecidos.
// ---------------------------------------------------------------------------

const S = {
  numero: igual("NÚMERO DA NFS-E", "NÚMERO DA NOTA", "NÚMERO DA NOTA FISCAL", "Nº DA NFS-E", "NÚMERO NFS-E", "NÚMERO"),
  emissao: igual("DATA E HORA DA EMISSÃO DA NFS-E", "DATA DE EMISSÃO", "DATA E HORA DE EMISSÃO", "DATA DA EMISSÃO", "EMISSÃO", "COMPETÊNCIA DA NFS-E", "COMPETÊNCIA"),
  liquido: igual("VALOR LÍQUIDO DA NFS-E", "VALOR LÍQUIDO", "VALOR LÍQUIDO DA NOTA"),
  servico: igual("VALOR DA OPERAÇÃO / SERVIÇO", "VALOR DO SERVIÇO", "VALOR DOS SERVIÇOS", "VALOR TOTAL DO SERVIÇO", "VALOR TOTAL DOS SERVIÇOS", "VALOR TOTAL DA NFS-E", "VALOR TOTAL DA NOTA"),
  chave: igual("CHAVE DE ACESSO DA NFS-E", "CHAVE DE ACESSO"),
  verificacao: comeca("CÓDIGO DE VERIFICAÇÃO", "CODIGO DE VERIFICACAO"),
  prestador: comeca("PRESTADOR / FORNECEDOR", "PRESTADOR DE SERVIÇO", "PRESTADOR DO SERVIÇO", "DADOS DO PRESTADOR", "PRESTADOR"),
  tomador: comeca("TOMADOR", "DADOS DO TOMADOR"),
  cnpj: comeca("CNPJ"),
  nome: igual("NOME / NOME EMPRESARIAL", "NOME/RAZÃO SOCIAL", "RAZÃO SOCIAL", "NOME / RAZÃO SOCIAL", "RAZÃO SOCIAL / NOME", "NOME EMPRESARIAL"),
};

const CNPJ_CPF = /^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/;

function lerDanfse(paginas: PaginaPdf[], corrido: string): NotaLida | ErroNota {
  const p = paginas[0];
  const avisos = ["Nota de serviço lida do PDF: confira o valor e o prestador antes de gravar."];
  const prest = rotulos(p, S.prestador)[0];
  const tom = rotulos(p, S.tomador, prest?.y ?? -Infinity)[0];
  const noPrestador = (r: Rotulo, filtro: (s: string) => boolean) => {
    const depois = prest ? prest.y - 3 : -Infinity;
    for (const rot of rotulos(p, r, depois)) {
      if (tom && rot.y >= tom.y - 2) break;
      const v = abaixo(p, rot, filtro);
      if (v) return v;
    }
    return null;
  };
  const doc = noPrestador(S.cnpj, (s) => CNPJ_CPF.test(s)) ?? /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(corrido)?.[1] ?? null;
  const nome = noPrestador(S.nome, (s) => /[A-Za-z]{2}/.test(s) && !CNPJ_CPF.test(s));
  const valor = valorCampo(p, S.liquido) ?? valorCampo(p, S.servico);
  if (!valor) return { erro: "Não achei o valor da nota de serviço neste PDF. Lance à mão." };
  const numero = campo(p, S.numero, (s) => /^\d{1,15}$/.test(s));
  const emissao = dataIso(campo(p, S.emissao, (s) => DATA.test(s)));
  const chaveNac = campo(p, S.chave, (s) => /^\d{50}$/.test(soDigitos(s)) && /^[\d\s]+$/.test(s));
  const verif = campo(p, S.verificacao, (s) => /^[A-Za-z0-9.-]{4,}$/.test(s));
  const documento = soDigitos(doc) || null;
  const info = informacoes(p);
  const descricao = campo(p, igual("DESCRIÇÃO DO SERVIÇO", "DISCRIMINAÇÃO DO SERVIÇO", "DISCRIMINAÇÃO DOS SERVIÇOS"), (s) => s.length > 2);
  const informacoesTexto = [info, descricao].filter(Boolean).join(" · ") || null;
  if (!nome) avisos.push("Não achei o nome do prestador no PDF. Escolha o fornecedor pelo CNPJ.");
  return {
    tipo: "servico",
    chave: chaveNac ? soDigitos(chaveNac) : verif ?? (numero && documento ? `${documento}-${numero}` : null),
    numero: numero ? String(Number(numero)) : null,
    serie: null,
    emissao,
    saida: null,
    emitente: { documento, nome: nome ?? (documento ? `CNPJ ${documento}` : "(prestador)") },
    valorTotal: valor,
    frete: 0,
    itens: [],
    duplicatas: [],
    informacoes: informacoesTexto,
    notaReferida: notaReferida(info) ?? notaReferida(informacoesTexto),
    avisos,
  };
}
