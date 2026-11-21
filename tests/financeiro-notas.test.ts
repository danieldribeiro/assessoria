import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  centavosXml,
  conferirNota,
  custosDosItens,
  duplicatasOuUnica,
  lerNotaFiscal,
  lerXml,
  notaReferida,
  raizCnpj,
  ratearCentavos,
  type NotaEnviada,
  type NotaLida,
} from "@/lib/financeiro/notas";

const arquivo = (nome: string) => readFileSync(`${__dirname}/notas/${nome}`, "utf8");
const ler = (nome: string) => lerNotaFiscal(arquivo(nome)) as NotaLida;

describe("leitor de XML", () => {
  it("lê elementos, atributos, CDATA, entidades e ignora namespace", () => {
    const x = lerXml(`<?xml version="1.0"?><!-- c --><ns:a x='1 > 2' ns:y="&quot;b&quot;"><b>t &amp; u &#233;</b><c/><d><![CDATA[<e>]]></d></ns:a>`)!;
    expect(x.nome).toBe("a");
    expect(x.atributos).toEqual({ x: "1 > 2", y: '"b"' });
    expect(x.filhos.map((f) => [f.nome, f.texto])).toEqual([["b", "t & u é"], ["c", ""], ["d", "<e>"]]);
  });

  it("recusa XML quebrado", () => {
    expect(lerXml("<a><b></a>")).toBeNull();
    expect(lerXml("<a>")).toBeNull();
    expect(lerNotaFiscal("isto não é xml")).toEqual({ erro: expect.stringContaining("XML") });
  });

  it("converte valores em centavos sem ponto flutuante", () => {
    expect(centavosXml("1736.19")).toBe(173619);
    expect(centavosXml("12")).toBe(1200);
    expect(centavosXml("0.1")).toBe(10);
    expect(centavosXml("32.5000000000")).toBe(3250);
    expect(centavosXml("1.005")).toBe(101);
    expect(centavosXml(null)).toBe(0);
    expect(centavosXml("abc")).toBe(0);
  });
});

describe("NF-e", () => {
  it("lê cabeçalho, itens com impostos que somam no custo, frete e duplicatas", () => {
    const n = ler("nfe-ficticia.xml");
    expect(n).toMatchObject({
      tipo: "produto",
      chave: "43260100000000000191550010000012341000000017",
      numero: "1234",
      serie: "1",
      emissao: "2026-10-14",
      saida: "2026-10-15",
      emitente: { documento: "00000000000191", nome: "Café & Cia Fictícia" },
      valorTotal: 41350,
      frete: 1500,
      informacoes: "Pedido 999 - nota de teste",
      avisos: [],
    });
    // 300 − 10 de desconto + 5 de ST + 2,50 de IPI; 100 + 1 de outras despesas. O frete fica de fora do item.
    expect(n.itens).toEqual([
      { codigo: "CAF-01", descricao: "CAFE EM GRAOS 1KG", unidade: "PCT", quantidade: 5, valor: 29750 },
      { codigo: "COPO-300", descricao: "COPO PAPEL 300ML C/50", unidade: "CX", quantidade: 2, valor: 10100 },
    ]);
    expect(n.duplicatas).toEqual([
      { numero: "001", vencimento: "2026-11-13", valor: 20675 },
      { numero: "002", vencimento: "2026-12-13", valor: 20675 },
    ]);
  });

  it("avisa quando os itens e o frete não fecham com o total", () => {
    const n = ler("nfe-ficticia.xml");
    const torto = arquivo("nfe-ficticia.xml").replace("<vNF>413.50</vNF>", "<vNF>420.00</vNF>");
    expect((lerNotaFiscal(torto) as NotaLida).avisos[0]).toContain("6,50");
    expect(n.avisos).toEqual([]);
  });

  it("recusa NFC-e, resumo e evento", () => {
    expect(lerNotaFiscal(arquivo("nfe-ficticia.xml").replace("<mod>55</mod>", "<mod>65</mod>"))).toEqual({ erro: expect.stringContaining("modelo 65") });
    expect(lerNotaFiscal("<resNFe><chNFe>1</chNFe></resNFe>")).toEqual({ erro: expect.stringContaining("resumo") });
    expect(lerNotaFiscal("<procEventoNFe><evento/></procEventoNFe>")).toEqual({ erro: expect.stringContaining("evento") });
  });
});

describe("NFS-e", () => {
  it("lê o padrão nacional e acha a NF-e citada no texto", () => {
    const n = ler("nfse-nacional-ficticia.xml");
    expect(n).toMatchObject({
      tipo: "servico",
      numero: "77",
      emissao: "2026-10-14",
      emitente: { documento: "00000000000272", nome: "DISTRIBUIDORA FICTICIA LTDA" },
      valorTotal: 50539,
      itens: [],
      notaReferida: "1234",
    });
    expect(n.chave).toMatch(/^\d+$/);
  });

  it("lê o padrão ABRASF pelo valor líquido", () => {
    const n = ler("nfse-abrasf-ficticia.xml");
    expect(n).toMatchObject({ tipo: "servico", numero: "996", chave: "ABC123", valorTotal: 11820, emissao: "2026-10-20", notaReferida: "4321" });
    expect(n.emitente).toEqual({ documento: "00000000000191", nome: "Prestador Ficticio" });
  });

  it("acha o número da nota em textos comuns", () => {
    expect(notaReferida("Inf. Cont.: NF 35720 PEDIDO 143713")).toBe("35720");
    expect(notaReferida("referente NF-e nº 12")).toBe("12");
    expect(notaReferida("NFe: 0099")).toBe("99");
    expect(notaReferida("sem referência")).toBeNull();
  });

  it("matriz e filial casam pela raiz do CNPJ", () => {
    expect(raizCnpj("00.000.000/0002-72")).toBe(raizCnpj("00000000000191"));
    expect(raizCnpj("12345678901")).toBe("12345678901");
  });
});

describe("rateio", () => {
  it("não perde centavo e dá a sobra às maiores frações", () => {
    expect(ratearCentavos(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(ratearCentavos(1000, [0, 0])).toEqual([500, 500]);
    expect(ratearCentavos(-10, [1, 2])).toEqual([-3, -7]);
    expect(ratearCentavos(5, [])).toEqual([]);
    const partes = ratearCentavos(212199, [173619, 1, 5000, 333]);
    expect(partes.reduce((s, p) => s + p, 0)).toBe(212199);
  });

  it("custo do item = valor + parte do serviço + parte do frete, na proporção do valor", () => {
    const n = ler("nfe-ficticia.xml");
    const c = custosDosItens(n.itens, 50539, n.frete);
    expect(c.reduce((s, i) => s + i.custo, 0)).toBe(29750 + 10100 + 50539 + 1500);
    expect(c.map((i) => i.frete)).toEqual([1120, 380]);
    expect(c[0].servico + c[1].servico).toBe(50539);
  });

  it("sem duplicatas na nota, vira um vencimento único no valor total", () => {
    expect(duplicatasOuUnica({ duplicatas: [], valorTotal: 900 }, "2026-10-30")).toEqual([{ numero: null, vencimento: "2026-10-30", valor: 900 }]);
  });
});

describe("pagamento no cartão", () => {
  const base: NotaEnviada = {
    tipo: "servico", chave: null, numero: "9", serie: null, emissao: "2026-11-14", entrada: "2026-11-15", contraparte_id: null,
    emitente_documento: null, emitente_nome: "Fornecedor", valor_total: 300, valor_frete: 0, nota_produto_id: null, remessa: null,
    origem: "manual", arquivo_nome: null, informacoes: null, observacoes: null, itens: [],
    financeiro: { modo: "cartao", cartao_id: "c1", conta_id: "k1", data_compra: "2026-11-14", parcelas: 3, primeira_fatura: null },
  };
  const com = (f: Partial<Extract<NotaEnviada["financeiro"], { modo: "cartao" }>>) => ({ ...base, financeiro: { ...base.financeiro, ...f } as NotaEnviada["financeiro"] });

  it("aceita a compra no cartão e confere cartão, conta, data, parcelas e fatura", () => {
    expect(conferirNota(base)).toBeNull();
    expect(conferirNota(com({ primeira_fatura: "2026-12" }))).toBeNull();
    expect(conferirNota(com({ cartao_id: "" }))).toMatch(/cartão/);
    expect(conferirNota(com({ conta_id: "" }))).toMatch(/conta do plano/);
    expect(conferirNota(com({ data_compra: "" }))).toMatch(/data da compra/);
    expect(conferirNota(com({ parcelas: 0 }))).toMatch(/Parcelas/);
    expect(conferirNota(com({ parcelas: 301 }))).toMatch(/Parcelas|pequeno/);
    expect(conferirNota({ ...com({ parcelas: 4 }), valor_total: 3 })).toMatch(/pequeno demais/);
    expect(conferirNota(com({ primeira_fatura: "12/2026" }))).toMatch(/fatura/);
  });
});
