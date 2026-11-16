// Leitor mínimo de planilhas .xlsx (o formato do Excel desde 2007), sem biblioteca: o arquivo é um zip com XML dentro.
// Lê só a primeira aba, como texto e números, o que basta para importar contagens de estoque e listas de custos.
// Roda no navegador e no Node (usa DecompressionStream). Não lê o .xls antigo.

export type Celula = string | number | null;

const decodificador = new TextDecoder("utf-8");

function u16(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number) {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

async function inflar(dados: Uint8Array) {
  const fluxo = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

// Arquivos do zip pelo nome, já descompactados (só os que interessam).
async function lerZip(bytes: Uint8Array, quer: (nome: string) => boolean) {
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error("O arquivo não é uma planilha .xlsx.");
  const total = u16(bytes, fim + 10);
  let p = u32(bytes, fim + 16);
  const arquivos = new Map<string, Uint8Array>();
  for (let n = 0; n < total; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error("A planilha está corrompida.");
    const metodo = u16(bytes, p + 10);
    const tamanho = u32(bytes, p + 20);
    const nomeLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const comentarioLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const nome = decodificador.decode(bytes.subarray(p + 46, p + 46 + nomeLen));
    p += 46 + nomeLen + extraLen + comentarioLen;
    if (!quer(nome)) continue;
    const inicio = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const dados = bytes.subarray(inicio, inicio + tamanho);
    if (metodo === 0) arquivos.set(nome, dados);
    else if (metodo === 8) arquivos.set(nome, await inflar(dados));
    else throw new Error("A planilha usa uma compressão que não é lida aqui.");
  }
  return arquivos;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function texto(xml: string) {
  return xml.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e],
  );
}

// Junta os pedaços <t> de um texto (o Excel quebra texto formatado em vários).
function juntarT(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => texto(m[1] ?? "")).join("");
}

function coluna(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Primeira aba da planilha como linhas de células (vazias = null).
export async function lerPlanilha(bytes: Uint8Array): Promise<Celula[][]> {
  const arquivos = await lerZip(bytes, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(n));
  const livro = arquivos.get("xl/workbook.xml");
  if (!livro) throw new Error("O arquivo não é uma planilha .xlsx.");
  const lerTexto = (b?: Uint8Array) => (b ? decodificador.decode(b) : "");

  // Primeira aba na ordem do livro → arquivo da aba pela relação.
  const primeira = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(lerTexto(livro))?.[1];
  const relacoes = lerTexto(arquivos.get("xl/_rels/workbook.xml.rels"));
  let alvo: string | undefined;
  for (const m of relacoes.matchAll(/<Relationship\b[^>]*>/g)) {
    if (new RegExp(`\\bId="${primeira}"`).test(m[0])) alvo = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
  }
  const caminho = alvo ? "xl/" + alvo.replace(/^\/?xl\//, "").replace(/^\//, "") : "xl/worksheets/sheet1.xml";
  const aba = lerTexto(arquivos.get(caminho) ?? arquivos.get("xl/worksheets/sheet1.xml"));
  if (!aba) throw new Error("A planilha não tem nenhuma aba.");

  const compartilhados = [...lerTexto(arquivos.get("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => juntarT(m[1]));

  const linhas: Celula[][] = [];
  for (const l of aba.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numero = Number(/\br="(\d+)"/.exec(l[1])?.[1] ?? linhas.length + 1) - 1;
    const linha: Celula[] = [];
    for (const c of l[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const tipo = /\bt="(\w+)"/.exec(attrs)?.[1];
      const corpo = c[2] ?? "";
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(corpo)?.[1]; // <v xml:space="preserve"> quando o texto tem espaço nas pontas
      let valor: Celula = null;
      if (tipo === "s") valor = v !== undefined ? (compartilhados[Number(v)] ?? null) : null;
      else if (tipo === "inlineStr") valor = juntarT(corpo);
      else if (tipo === "str" || tipo === "e") valor = v !== undefined ? texto(v) : null;
      else if (tipo === "b") valor = v === "1" ? "VERDADEIRO" : "FALSO";
      else if (v !== undefined && v !== "") valor = Number(v);
      const i = ref ? coluna(ref) : linha.length;
      while (linha.length < i) linha.push(null);
      linha[i] = valor === "" ? null : valor;
    }
    while (linhas.length < numero) linhas.push([]);
    linhas[numero] = linha;
  }
  return linhas;
}
