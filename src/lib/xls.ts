// Leitor mínimo do .xls antigo (Excel 97–2003, formato BIFF8 dentro de um arquivo "Compound File"), sem biblioteca.
// Muitos sistemas de PDV ainda exportam relatórios assim. Lê só a primeira aba, como texto e números.
import type { Celula } from "@/lib/xlsx";

export const ASSINATURA_XLS = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function ehXls(b: Uint8Array) {
  return b.length >= 512 && ASSINATURA_XLS.every((x, i) => b[i] === x);
}

const FIM_DA_CADEIA = 0xfffffffe;
const LIVRE = 0xffffffff;

// ---------------------------------------------------------------------------
// Compound File: acha o fluxo "Workbook" (ou "Book")
// ---------------------------------------------------------------------------

function lerFluxoWorkbook(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (i: number) => dv.getUint16(i, true);
  const u32 = (i: number) => dv.getUint32(i, true);
  const tamSetor = 1 << u16(0x1e);
  const tamMini = 1 << u16(0x20);
  const corteMini = u32(0x38);
  const inicioSetor = (n: number) => (n + 1) * tamSetor; // o cabeçalho ocupa o primeiro setor

  // Setores da tabela de alocação (FAT): 109 no cabeçalho e o resto em setores DIFAT encadeados.
  const setoresFat: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== LIVRE && s !== FIM_DA_CADEIA) setoresFat.push(s);
  }
  let difat = u32(0x44);
  for (let guarda = 0; difat !== FIM_DA_CADEIA && difat !== LIVRE && guarda < 10000; guarda++) {
    const ini = inicioSetor(difat);
    const porSetor = tamSetor / 4 - 1;
    for (let i = 0; i < porSetor; i++) {
      const s = u32(ini + i * 4);
      if (s !== LIVRE && s !== FIM_DA_CADEIA) setoresFat.push(s);
    }
    difat = u32(ini + porSetor * 4);
  }
  const fat: number[] = [];
  for (const s of setoresFat) {
    const ini = inicioSetor(s);
    for (let i = 0; i < tamSetor / 4; i++) fat.push(u32(ini + i * 4));
  }
  const cadeia = (primeiro: number, tabela: number[]) => {
    const lista: number[] = [];
    for (let s = primeiro; s !== FIM_DA_CADEIA && s !== LIVRE && s < tabela.length && lista.length <= tabela.length; s = tabela[s]) lista.push(s);
    return lista;
  };
  const lerCadeia = (primeiro: number, tamanho: number) => {
    const saida = new Uint8Array(tamanho);
    let p = 0;
    for (const s of cadeia(primeiro, fat)) {
      const ini = inicioSetor(s);
      const n = Math.min(tamSetor, tamanho - p, b.length - ini);
      if (n <= 0) break;
      saida.set(b.subarray(ini, ini + n), p);
      p += n;
    }
    return saida;
  };

  // Diretório: entradas de 128 bytes.
  const dir = lerCadeia(u32(0x30), cadeia(u32(0x30), fat).length * tamSetor);
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  type Entrada = { nome: string; tipo: number; inicio: number; tamanho: number };
  const entradas: Entrada[] = [];
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const len = ddv.getUint16(i + 64, true);
    const nome = new TextDecoder("utf-16le").decode(dir.subarray(i, i + Math.max(0, len - 2)));
    entradas.push({ nome, tipo: dir[i + 66], inicio: ddv.getUint32(i + 116, true), tamanho: ddv.getUint32(i + 120, true) });
  }
  const raiz = entradas.find((e) => e.tipo === 5);
  const livro = entradas.find((e) => e.tipo === 2 && (e.nome === "Workbook" || e.nome === "Book"));
  if (!livro || !raiz) throw new Error("O arquivo .xls não tem uma planilha que dê para ler.");
  if (livro.tamanho >= corteMini) return lerCadeia(livro.inicio, livro.tamanho);

  // Fluxo pequeno: fica no "mini stream" da raiz, com a tabela miniFAT.
  const miniFat: number[] = [];
  const bytesMiniFat = lerCadeia(u32(0x3c), u32(0x40) * tamSetor);
  for (let i = 0; i + 4 <= bytesMiniFat.length; i += 4) miniFat.push(new DataView(bytesMiniFat.buffer, bytesMiniFat.byteOffset).getUint32(i, true));
  const mini = lerCadeia(raiz.inicio, raiz.tamanho);
  const saida = new Uint8Array(livro.tamanho);
  let p = 0;
  for (const s of cadeia(livro.inicio, miniFat)) {
    const n = Math.min(tamMini, livro.tamanho - p);
    saida.set(mini.subarray(s * tamMini, s * tamMini + n), p);
    p += n;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// BIFF8
// ---------------------------------------------------------------------------

type Registro = { tipo: number; dados: Uint8Array; pos: number };

function registros(w: Uint8Array, inicio: number) {
  const lista: Registro[] = [];
  const dv = new DataView(w.buffer, w.byteOffset, w.byteLength);
  for (let p = inicio; p + 4 <= w.length; ) {
    const tipo = dv.getUint16(p, true);
    const len = dv.getUint16(p + 2, true);
    lista.push({ tipo, dados: w.subarray(p + 4, p + 4 + len), pos: p });
    p += 4 + len;
    if (tipo === 0x000a) break; // EOF
  }
  return lista;
}

const latin1 = new TextDecoder("windows-1252");
const utf16 = new TextDecoder("utf-16le");

// Leitor que atravessa os registros CONTINUE: ao cruzar a fronteira no meio dos caracteres de um texto,
// o próximo pedaço começa com um byte que diz se os caracteres seguintes são de 1 ou 2 bytes.
class Leitor {
  private i = 0;
  private p = 0;
  constructor(private partes: Uint8Array[]) {}
  private garantir() {
    while (this.i < this.partes.length && this.p >= this.partes[this.i].length) {
      this.i++;
      this.p = 0;
    }
  }
  byte() {
    this.garantir();
    const parte = this.partes[this.i];
    if (!parte) throw new Error("A planilha .xls está incompleta.");
    return parte[this.p++];
  }
  u16() {
    return this.byte() | (this.byte() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  pular(n: number) {
    for (let k = 0; k < n; k++) this.byte();
  }
  caracteres(qtd: number, largos: boolean) {
    let texto = "";
    let falta = qtd;
    while (falta > 0) {
      this.garantir();
      const parte = this.partes[this.i];
      if (!parte) break;
      const largura = largos ? 2 : 1;
      const cabe = Math.min(falta, Math.floor((parte.length - this.p) / largura));
      const pedaco = parte.subarray(this.p, this.p + cabe * largura);
      texto += largos ? utf16.decode(pedaco) : latin1.decode(pedaco);
      this.p += cabe * largura;
      falta -= cabe;
      if (falta > 0) {
        this.i++;
        this.p = 0;
        largos = (this.byte() & 1) === 1; // byte de opções no começo do CONTINUE
      }
    }
    return texto;
  }
  // XLUnicodeRichExtendedString (tabela SST)
  textoSst() {
    const qtd = this.u16();
    const opcoes = this.byte();
    const execucoes = opcoes & 0x08 ? this.u16() : 0;
    const extra = opcoes & 0x04 ? this.u32() : 0;
    const texto = this.caracteres(qtd, (opcoes & 1) === 1);
    this.pular(execucoes * 4 + extra);
    return texto;
  }
}

function textoSimples(d: Uint8Array, p: number) {
  const qtd = d[p] | (d[p + 1] << 8);
  const largos = (d[p + 2] & 1) === 1;
  const ini = p + 3;
  return largos ? utf16.decode(d.subarray(ini, ini + qtd * 2)) : latin1.decode(d.subarray(ini, ini + qtd));
}

function numeroRk(rk: number) {
  let v: number;
  if (rk & 0x02) v = rk >> 2;
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, rk & 0xfffffffc, true);
    v = buf.getFloat64(0, true);
  }
  return rk & 0x01 ? v / 100 : v;
}

// Primeira aba da planilha .xls como linhas de células (vazias = null).
export function lerXls(bytes: Uint8Array): Celula[][] {
  const w = lerFluxoWorkbook(bytes);
  const globais = registros(w, 0);
  if (globais[0]?.tipo !== 0x0809) throw new Error("O arquivo .xls não é uma planilha do Excel.");
  if (globais.some((r) => r.tipo === 0x002f)) throw new Error("A planilha .xls está protegida por senha.");

  const sst: string[] = [];
  const iSst = globais.findIndex((r) => r.tipo === 0x00fc);
  if (iSst >= 0) {
    const partes = [globais[iSst].dados.subarray(8)];
    for (let k = iSst + 1; globais[k]?.tipo === 0x003c; k++) partes.push(globais[k].dados);
    const total = new DataView(globais[iSst].dados.buffer, globais[iSst].dados.byteOffset).getUint32(4, true);
    const leitor = new Leitor(partes);
    for (let k = 0; k < total; k++) sst.push(leitor.textoSst());
  }

  const aba = globais.find((r) => r.tipo === 0x0085 && r.dados[5] === 0);
  if (!aba) throw new Error("A planilha .xls não tem nenhuma aba.");
  const inicioAba = new DataView(aba.dados.buffer, aba.dados.byteOffset).getUint32(0, true);

  const linhas: Celula[][] = [];
  const por = (linha: number, col: number, v: Celula) => {
    while (linhas.length <= linha) linhas.push([]);
    const l = linhas[linha];
    while (l.length < col) l.push(null);
    l[col] = v === "" ? null : v;
  };
  const regs = registros(w, inicioAba);
  for (let k = 0; k < regs.length; k++) {
    const { tipo, dados: d } = regs[k];
    if (d.length < 6 && tipo !== 0x000a) continue;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const linha = d.length >= 4 ? dv.getUint16(0, true) : 0;
    const col = d.length >= 4 ? dv.getUint16(2, true) : 0;
    switch (tipo) {
      case 0x00fd: // LABELSST
        por(linha, col, sst[dv.getUint32(6, true)] ?? null);
        break;
      case 0x0204: // LABEL
        por(linha, col, textoSimples(d, 6));
        break;
      case 0x0203: // NUMBER
        por(linha, col, dv.getFloat64(6, true));
        break;
      case 0x027e: // RK
        por(linha, col, numeroRk(dv.getUint32(6, true)));
        break;
      case 0x00bd: {
        // MULRK
        const n = (d.length - 6) / 6;
        for (let j = 0; j < n; j++) por(linha, col + j, numeroRk(dv.getUint32(4 + j * 6 + 2, true)));
        break;
      }
      case 0x0205: // BOOLERR
        if (d[7] === 0) por(linha, col, d[6] ? "VERDADEIRO" : "FALSO");
        break;
      case 0x0006: {
        // FORMULA: resultado em cache
        if (dv.getUint16(12, true) !== 0xffff) por(linha, col, dv.getFloat64(6, true));
        else if (d[6] === 0 && regs[k + 1]?.tipo === 0x0207) por(linha, col, textoSimples(regs[k + 1].dados, 0));
        else if (d[6] === 1) por(linha, col, d[8] ? "VERDADEIRO" : "FALSO");
        break;
      }
    }
  }
  return linhas;
}
