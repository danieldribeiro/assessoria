// Leitura de extratos OFX (versão 1, SGML, e versão 2, XML). Regras puras: roda no navegador, para a prévia, e nos testes.
// Valores são lidos como texto e convertidos em centavos sem passar por ponto flutuante.

export type MovimentoOfx = {
  data: string; // AAAA-MM-DD
  centavos: number; // crédito positivo, débito negativo
  tipo_ofx: string | null;
  descricao: string;
  fitid: string | null;
  documento: string | null;
  chave: string; // única por conta de caixa (ver chaveDoMovimento)
  repetidaNoArquivo: boolean;
};

export type ErroOfx = { posicao: number; motivo: string; trecho: string };

export type ExtratoOfx = {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  inicio: string | null;
  fim: string | null;
  saldo: number | null; // centavos
  saldoEm: string | null;
  movimentos: MovimentoOfx[];
  erros: ErroOfx[];
};

export const MAX_MOVIMENTOS = 5000;

// O OFX declara o conjunto de caracteres no cabeçalho; bancos brasileiros costumam usar 1252 (Latin-1).
export function decodificarOfx(bytes: Uint8Array) {
  const cabeca = new TextDecoder("latin1").decode(bytes.slice(0, 600));
  const declarado = /CHARSET:\s*(1252|ISO-?8859-?1|WINDOWS-?1252)/i.test(cabeca) || /encoding="(windows-1252|iso-8859-1)"/i.test(cabeca);
  if (declarado) return new TextDecoder("windows-1252").decode(bytes);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

function campo(bloco: string, tag: string) {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloco);
  const v = m?.[1].trim();
  return v ? decodificarEntidades(v) : null;
}

function decodificarEntidades(v: string) {
  return v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// "20261005120000[-3:BRT]" → "2026-10-05". Data impossível → null.
export function lerDataOfx(v: string | null) {
  const m = v ? /^(\d{4})(\d{2})(\d{2})/.exec(v) : null;
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, mes - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d || a < 1990 || a > 2100) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// "-1000.5", "-1.000,50", "1,000.50", "+12" → centavos. Mais de duas casas decimais ou texto estranho → null.
export function lerValorOfx(v: string | null) {
  if (!v) return null;
  let t = v.replace(/\s/g, "");
  const m = /^([+-]?)([\d.,]+)$/.exec(t);
  if (!m) return null;
  const sinal = m[1] === "-" ? -1 : 1;
  t = m[2];
  const ultimo = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  let inteiro = t;
  let decimal = "";
  // O último separador é decimal quando tem 1 ou 2 dígitos depois dele. Com 3 dígitos depois e mais separadores
  // ("1.234.567"), são milhares. Um separador só com 3 dígitos ("1.000") é ambíguo: vira erro na prévia.
  if (ultimo >= 0) {
    const depois = t.slice(ultimo + 1);
    const separadores = (t.match(/[.,]/g) ?? []).length;
    if (depois.length <= 2) {
      inteiro = t.slice(0, ultimo);
      decimal = depois;
    } else if (separadores === 1 || depois.length > 3) {
      return null;
    }
  }
  inteiro = inteiro.replace(/[.,]/g, "");
  if (!/^\d*$/.test(inteiro) || !/^\d{0,2}$/.test(decimal) || (inteiro === "" && decimal === "")) return null;
  return sinal * (Number(inteiro || "0") * 100 + Number(decimal.padEnd(2, "0")));
}

const normalizar = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

// Chave de duplicidade. Com FITID: o identificador do banco, mais data e valor (alguns bancos repetem o FITID em
// lançamentos diferentes). Sem FITID: data, valor, descrição e a posição entre as iguais no arquivo.
export function chaveDoMovimento(m: { data: string; centavos: number; descricao: string; fitid: string | null }, ordem: number) {
  return m.fitid ? `fitid:${m.fitid}|${m.data}|${m.centavos}` : `sem-id:${m.data}|${m.centavos}|${normalizar(m.descricao)}|${ordem}`;
}

export function lerOfx(texto: string): ExtratoOfx | { erro: string } {
  const inicio = texto.search(/<OFX>/i);
  if (inicio < 0) return { erro: "O arquivo não parece um extrato OFX (não tem a marca <OFX>)." };
  const corpo = texto.slice(inicio);

  let blocos = [...corpo.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map((m) => m[1]);
  // Alguns bancos não fecham <STMTTRN>: cada bloco vai até o próximo <STMTTRN> ou até o fim da lista.
  if (blocos.length === 0 && /<STMTTRN>/i.test(corpo)) {
    blocos = corpo
      .split(/<STMTTRN>/i)
      .slice(1)
      .map((b) => b.split(/<\/BANKTRANLIST>/i)[0]);
  }
  if (blocos.length > MAX_MOVIMENTOS) return { erro: `O arquivo tem ${blocos.length} movimentações; o limite por importação é ${MAX_MOVIMENTOS}.` };

  const conta = /<(BANKACCTFROM|CCACCTFROM)>([\s\S]*?)(<\/\1>|<BANKTRANLIST>)/i.exec(corpo)?.[2] ?? corpo;
  const lista = /<BANKTRANLIST>([\s\S]*?)<STMTTRN>/i.exec(corpo)?.[1] ?? "";
  const saldo = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i.exec(corpo)?.[1] ?? "";

  const movimentos: MovimentoOfx[] = [];
  const erros: ErroOfx[] = [];
  const vistas = new Map<string, number>();
  const chaves = new Set<string>();
  blocos.forEach((b, i) => {
    const posicao = i + 1;
    const trecho = b.replace(/\s+/g, " ").trim().slice(0, 140);
    const data = lerDataOfx(campo(b, "DTPOSTED"));
    const centavos = lerValorOfx(campo(b, "TRNAMT"));
    if (!data) return erros.push({ posicao, motivo: "Data inválida ou ausente", trecho });
    if (centavos === null) return erros.push({ posicao, motivo: "Valor inválido ou ausente", trecho });
    if (centavos === 0) return erros.push({ posicao, motivo: "Valor zero", trecho });
    const nome = campo(b, "NAME");
    const memo = campo(b, "MEMO");
    const tipo = campo(b, "TRNTYPE");
    const partes = [nome, memo].filter((x): x is string => !!x);
    const descricao =
      (partes.length === 2 && normalizar(partes[0]) === normalizar(partes[1]) ? partes[0] : partes.join(" - ")).replace(/\s+/g, " ").trim() ||
      tipo ||
      "Movimentação sem descrição";
    const fitid = campo(b, "FITID");
    const base = { data, centavos, descricao: descricao.slice(0, 500), fitid: fitid?.slice(0, 255) ?? null };
    const assinatura = `${data}|${centavos}|${normalizar(base.descricao)}`;
    const ordem = (vistas.get(assinatura) ?? 0) + 1;
    vistas.set(assinatura, ordem);
    const chave = chaveDoMovimento(base, ordem);
    movimentos.push({
      ...base,
      tipo_ofx: tipo,
      documento: (campo(b, "CHECKNUM") ?? campo(b, "REFNUM"))?.slice(0, 100) ?? null,
      chave,
      repetidaNoArquivo: chaves.has(chave),
    });
    chaves.add(chave);
  });

  const saldoValor = lerValorOfx(campo(saldo, "BALAMT"));
  return {
    banco: campo(conta, "BANKID"),
    agencia: campo(conta, "BRANCHID"),
    conta: campo(conta, "ACCTID"),
    inicio: lerDataOfx(campo(lista, "DTSTART")),
    fim: lerDataOfx(campo(lista, "DTEND")),
    saldo: saldoValor,
    saldoEm: lerDataOfx(campo(saldo, "DTASOF")),
    movimentos,
    erros,
  };
}

// Resumo do arquivo para conferir se é o mesmo (SHA-256 em hexadecimal).
export async function resumoArquivo(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Prévia: separa o que é novo, o que já foi importado (mesma chave) e o que parece repetido com outra chave
// (mesma data, valor e descrição de uma movimentação já gravada; o banco pode ter mudado o identificador).
export type EstadoPrevia = "nova" | "existente" | "parecida" | "repetida";

export function classificarPrevia(
  movimentos: MovimentoOfx[],
  existentes: { chave: string; data: string; valor: number; descricao: string }[],
) {
  const chaves = new Set(existentes.map((e) => e.chave));
  const assinaturas = new Set(existentes.map((e) => `${e.data}|${Math.round(e.valor * 100)}|${normalizar(e.descricao)}`));
  return movimentos.map((m) => {
    let estado: EstadoPrevia = "nova";
    if (chaves.has(m.chave)) estado = "existente";
    else if (m.repetidaNoArquivo) estado = "repetida";
    else if (assinaturas.has(`${m.data}|${m.centavos}|${normalizar(m.descricao)}`)) estado = "parecida";
    return { ...m, estado };
  });
}

// Lançamentos candidatos a uma movimentação: mesma conta de caixa, mesmo sentido, mesmo valor, ainda sem
// conciliação, não cancelados; os de data mais próxima primeiro (até `dias` de distância).
export function candidatosConciliacao<
  L extends { id: string; conta_caixa_id: string; direcao: "entrada" | "saida"; valor_total: number; situacao: string; data_liquidacao: string | null; data_vencimento: string | null },
>(movimento: { conta_caixa_id: string; data: string; valor: number }, lancamentos: L[], conciliados: Set<string>, dias = 10) {
  const direcao = movimento.valor > 0 ? "entrada" : "saida";
  const centavos = Math.round(Math.abs(movimento.valor) * 100);
  const distancia = (d: string | null) => (d ? Math.abs(Date.parse(d) - Date.parse(movimento.data)) / 86400000 : Infinity);
  return lancamentos
    .filter(
      (l) =>
        l.conta_caixa_id === movimento.conta_caixa_id &&
        l.direcao === direcao &&
        Math.round(l.valor_total * 100) === centavos &&
        l.situacao !== "cancelado" &&
        !conciliados.has(l.id),
    )
    .map((l) => ({ lancamento: l, dias: distancia(l.data_liquidacao ?? l.data_vencimento) }))
    .filter((c) => c.dias <= dias)
    .sort((a, b) => a.dias - b.dias);
}

// Transferências candidatas: realizadas, envolvendo a conta de caixa do lado certo (saída do banco = conta de
// origem; entrada = destino), mesmo valor, ainda não conciliadas nesta conta, de data mais próxima primeiro.
export function candidatosTransferencia<
  T extends { id: string; conta_origem_id: string; conta_destino_id: string; valor: number; data: string; situacao: string },
>(movimento: { conta_caixa_id: string; data: string; valor: number }, transferencias: T[], conciliadas: Set<string>, dias = 10) {
  const centavos = Math.round(Math.abs(movimento.valor) * 100);
  const lado = movimento.valor > 0 ? "conta_destino_id" : "conta_origem_id";
  return transferencias
    .filter((t) => t.situacao === "realizado" && t[lado] === movimento.conta_caixa_id && Math.round(t.valor * 100) === centavos && !conciliadas.has(t.id))
    .map((t) => ({ transferencia: t, dias: Math.abs(Date.parse(t.data) - Date.parse(movimento.data)) / 86400000 }))
    .filter((c) => c.dias <= dias)
    .sort((a, b) => a.dias - b.dias);
}

export function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
