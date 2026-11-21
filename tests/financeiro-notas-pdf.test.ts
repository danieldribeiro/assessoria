import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { paginasDoPdf } from "@/lib/financeiro/ler-pdf";
import { chaveValida, lerNotaPdf, numeroBR, type PaginaPdf, type TextoPdf } from "@/lib/financeiro/notas-pdf";
import type { NotaLida } from "@/lib/financeiro/notas";

// PDFs fictícios gerados por tests/notas/gerar-pdfs-ficticios.py (nenhum dado de cliente).
const ler = async (nome: string) => paginasDoPdf(pdfjs as never, new Uint8Array(readFileSync(join(__dirname, "notas", nome))));

function nota(r: ReturnType<typeof lerNotaPdf>): NotaLida {
  if ("erro" in r) throw new Error(r.erro);
  return r;
}

// Página montada à mão: [y, x, texto] (y de cima para baixo), para os casos que não valem um PDF.
const pagina = (itens: [number, number, string][]): PaginaPdf => ({
  largura: 595,
  altura: 842,
  textos: itens.map(([y, x, texto]): TextoPdf => ({ texto, x, y, largura: texto.length * 3.5, altura: 6 })),
});
const CHAVE = "43261111222333000181550010000012341123456782";
const grupos = (c: string) => c.match(/.{4}/g)!.join(" ");

function danfeSintetico(o: { chave?: string; produtos?: string; total?: string; frete?: string; desconto?: string; itens?: [string, string, string][]; dups?: [string, string, string][] } = {}) {
  const linhas: [number, number, string][] = [
    [20, 20, "RECEBEMOS DE FORNECEDOR TESTE LTDA OS PRODUTOS CONSTANTES DA NOTA FISCAL"],
    [90, 280, "DANFE"],
    [150, 350, "CHAVE DE ACESSO"],
    [160, 350, grupos(o.chave ?? CHAVE)],
    [220, 490, "DATA DA EMISSÃO"],
    [229, 490, "14/11/2026"],
    [270, 20, "FATURA/DUPLICATA"],
    [318, 20, "VALOR TOTAL DOS PRODUTOS"],
    [328, 70, o.produtos ?? "100,00"],
    [338, 20, "VALOR DO FRETE"],
    [348, 60, o.frete ?? "0,00"],
    [338, 100, "DESCONTO"],
    [348, 140, o.desconto ?? "0,00"],
    [338, 470, "VALOR TOTAL DA NOTA"],
    [348, 540, o.total ?? "100,00"],
    [380, 20, "DADOS DO PRODUTO/SERVIÇO"],
    [390, 70, "DESCRIÇÃO DO PRODUTO/SERVIÇO QUANT."],
    [390, 230, "NCM/SH"],
    [700, 20, "DADOS ADICIONAIS"],
  ];
  (o.itens ?? [["A1", "PRODUTO UM 2,0000 50,0000 100,00", ""]]).forEach(([cod, resto], k) => {
    const y = 402 + k * 10;
    const [desc, q, u, v] = resto.split(/ (?=[\d,]+ [\d,]+ [\d,]+$)| (?=[\d,]+ [\d,]+$)| (?=[\d,]+$)/);
    linhas.push([y, 20, cod], [y, 70, desc], [y, 230, "21069090"], [y, 265, "000"], [y, 285, "5102"], [y, 310, "UN"], [y, 330, q], [y, 370, u], [y, 410, v]);
  });
  (o.dups ?? []).forEach(([n, venc, valor], k) => linhas.push([288, 20 + k * 150, n], [288, 60 + k * 150, venc], [288, 120 + k * 150, valor]));
  linhas.push([310, 20, "CÁLCULO DO IMPOSTO"]);
  return pagina(linhas);
}

describe("números e chave", () => {
  it("lê número no padrão brasileiro", () => {
    expect(numeroBR("1.234,56")).toBe(1234.56);
    expect(numeroBR("R$ 2.121,99")).toBe(2121.99);
    expect(numeroBR("0,2180")).toBe(0.218);
    expect(numeroBR("17.00")).toBe(17);
    expect(numeroBR("1.000")).toBe(1000);
    expect(numeroBR("12")).toBe(12);
    expect(numeroBR("abc")).toBeNull();
    expect(numeroBR("1,2,3")).toBeNull();
  });

  it("confere o dígito da chave", () => {
    expect(chaveValida(CHAVE)).toBe(true);
    expect(chaveValida(CHAVE.slice(0, 43) + "0")).toBe(false);
    expect(chaveValida("123")).toBe(false);
  });
});

describe("DANFE em PDF", () => {
  it("lê o DANFE fictício: cabeçalho, itens, frete, duplicatas e o IPI dividido entre os itens", async () => {
    const n = nota(lerNotaPdf(await ler("danfe-ficticio.pdf")));
    expect(n).toMatchObject({
      tipo: "produto",
      chave: CHAVE,
      numero: "1234",
      serie: "1",
      emissao: "2026-11-14",
      saida: "2026-11-15",
      emitente: { documento: "11222333000181", nome: "DISTRIBUIDORA FICTICIA DE ALIMENTOS LTDA" },
      valorTotal: 58240,
      frete: 2500,
    });
    // Descrição que quebrou de linha continua; a linha de lote embaixo do leite não entra.
    expect(n.itens).toEqual([
      { codigo: "CAF-01", descricao: "CAFE TORRADO EM GRAOS ESPECIAL 1KG PACOTE TIPO EXPORTACAO", unidade: "PCT", quantidade: 4, valor: 35960 + 657 },
      { codigo: "LEI-02", descricao: "LEITE INTEGRAL 1L", unidade: "CX", quantidade: 12, valor: 18780 + 343 },
    ]);
    expect(n.itens.reduce((s, i) => s + i.valor, 0) + n.frete).toBe(n.valorTotal);
    expect(n.duplicatas).toEqual([
      { numero: "001", vencimento: "2026-12-14", valor: 30000 },
      { numero: "002", vencimento: "2027-01-13", valor: 28240 },
    ]);
    expect(n.avisos.join(" ")).toMatch(/divididos entre os itens/);
    expect(n.informacoes).toMatch(/Pedido 9876/);
  });

  it("divide o desconto da nota entre os itens", () => {
    const n = nota(lerNotaPdf([danfeSintetico({ desconto: "10,00", total: "90,00" })]));
    expect(n.itens[0].valor).toBe(9000);
    expect(n.valorTotal).toBe(9000);
  });

  it("avisa quando a soma dos itens não fecha com os produtos ou com o total", () => {
    const n = nota(lerNotaPdf([danfeSintetico({ produtos: "150,00", total: "150,00" })]));
    expect(n.itens[0].valor).toBe(10000);
    expect(n.avisos.join(" ")).toMatch(/Algum item pode ter ficado de fora/);
    expect(n.avisos.join(" ")).toMatch(/difere do total da nota/);
  });

  it("descarta parcelas que não fecham com o total", () => {
    const n = nota(lerNotaPdf([danfeSintetico({ dups: [["001", "14/12/2026", "60,00"]] })]));
    expect(n.duplicatas).toEqual([]);
    expect(n.avisos.join(" ")).toMatch(/parcelas lidas/);
  });

  it("recusa NFC-e, DANFE sem chave e PDF sem texto", () => {
    const nfce = "43261111222333000181650010000012341123456780";
    const dvOk = [...Array(10).keys()].map((d) => nfce.slice(0, 43) + d).find(chaveValida)!;
    expect(lerNotaPdf([danfeSintetico({ chave: dvOk })])).toEqual({ erro: expect.stringMatching(/NFC-e/) });
    expect(lerNotaPdf([danfeSintetico({ chave: CHAVE.slice(0, 43) + "0" })])).toEqual({ erro: expect.stringMatching(/chave de acesso/) });
    expect(lerNotaPdf([pagina([[10, 10, "DANFE"]])])).toEqual({ erro: expect.stringMatching(/escaneado/) });
  });
});

describe("DANFSe em PDF", () => {
  it("lê a NFS-e fictícia: prestador, valor líquido e a NF citada", async () => {
    const n = nota(lerNotaPdf(await ler("danfse-ficticio.pdf")));
    expect(n).toMatchObject({
      tipo: "servico",
      chave: "43000001122233300018100000000000077726110000000001",
      numero: "777",
      emissao: "2026-11-14",
      emitente: { documento: "11222333000181", nome: "SERVICOS FICTICIOS DE LOGISTICA LTDA" },
      valorTotal: 14550,
      itens: [],
      notaReferida: "1234",
    });
    expect(n.informacoes).toMatch(/SERVICO DE ENTREGA/);
  });
});
