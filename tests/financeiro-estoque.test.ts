import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cmvTeorico, custoFicha, lerContagem, lerCustos, lerFichas, lerVendas, medidaInicial, medidaPadronizada, naMedida, numeroCelula, opcoesMedida, resumoContagem, valorLinha, variacoesEstoque } from "@/lib/financeiro/estoque";
import { ID_VARIACAO_ESTOQUE, montarDre, type Parcela } from "@/lib/financeiro/painel";
import type { ContaPlano, Lancamento } from "@/lib/financeiro/dominio";
import { lerPlanilha } from "@/lib/xlsx";

const planilha = (nome: string) => lerPlanilha(new Uint8Array(readFileSync(`${__dirname}/estoque/${nome}`)));

describe("leitor de .xlsx", () => {
  it("lê a primeira aba com textos compartilhados, números e caracteres especiais", async () => {
    const linhas = await planilha("contagem-ficticia.xlsx");
    expect(linhas[0][0]).toBe("Contagem de Estoque - #teste01");
    expect(linhas[5]).toEqual(["Produto", "SKU", "Categoria", "Unidade", "Qtd Esperada", "Qtd Contada", "Diferença", "Observações"]);
    expect(linhas[7][5]).toBe(27.5);
    expect(linhas[8][0]).toBe("Copo & tampa <P>");
  });

  it("recusa o que não é .xlsx", async () => {
    await expect(lerPlanilha(new TextEncoder().encode("Produto;Qtd\nLeite;3"))).rejects.toThrow(/não é uma planilha/);
  });
});

describe("números das planilhas", () => {
  it("aceita número do Excel, padrão brasileiro e ponto decimal", () => {
    expect(numeroCelula(27.5)).toBe(27.5);
    expect(numeroCelula("1.450")).toBe(1450);
    expect(numeroCelula("1.234,56")).toBe(1234.56);
    expect(numeroCelula("99,00")).toBe(99);
    expect(numeroCelula("27.5")).toBe(27.5);
    expect(numeroCelula("R$ 3,69")).toBe(3.69);
    expect(numeroCelula("+12")).toBe(12);
    expect(numeroCelula("abc")).toBeNull();
    expect(numeroCelula("")).toBeNull();
  });
});

describe("contagem no formato do Omnia", () => {
  it("pega a data de término, os itens e avisa as linhas com problema", async () => {
    const r = lerContagem(await planilha("contagem-ficticia.xlsx"));
    if ("erro" in r) throw new Error(r.erro);
    expect(r.data).toBe("2026-10-31");
    expect(r.itens).toEqual([
      { nome: "Leite integral", categoria: "Leite", unidade: "un", quantidade: 324 },
      { nome: "Café em grão", categoria: "Café", unidade: "kg", quantidade: 27.5 },
      { nome: "Copo & tampa <P>", categoria: "Descartáveis", unidade: "un", quantidade: 1450 },
      { nome: "Detergente", categoria: "Limpeza", unidade: "un", quantidade: 3 },
    ]);
    expect(r.erros).toHaveLength(3);
    expect(r.erros[0]).toMatch(/Biscoito sem contagem.*quantidade/);
    expect(r.erros[1]).toMatch(/leite INTEGRAL.*repetido/);
    expect(r.erros[2]).toMatch(/Linha 14: quantidade 2 sem nome do produto/);
  });

  it("explica quando as colunas não existem", () => {
    expect(lerContagem([["Nome", "Valor"], ["Leite", 3]])).toEqual({ erro: expect.stringMatching(/Produto/) });
  });
});

describe("lista de custos", () => {
  it("lê nome e custo, ignora custo vazio e avisa custo inválido", async () => {
    const r = lerCustos(await planilha("custos-ficticios.xlsx"));
    if ("erro" in r) throw new Error(r.erro);
    expect(r.custos).toEqual([
      { nome: "Leite integral", custo: 3.69 },
      { nome: "Café em grão", custo: 99 },
    ]);
    expect(r.erros).toEqual([expect.stringMatching(/Copo.*custo inválido/)]);
  });
});

describe("valor da contagem", () => {
  it("quantidade × custo em centavos; fora do CMV e sem custo não somam", () => {
    expect(valorLinha({ quantidade: 324, custo_unitario: 3.69, fora_do_cmv: false })).toBe(119556);
    expect(valorLinha({ quantidade: 27.5, custo_unitario: 99, fora_do_cmv: false })).toBe(272250);
    expect(valorLinha({ quantidade: 3, custo_unitario: 10, fora_do_cmv: true })).toBe(0);
    const r = resumoContagem([
      { quantidade: 324, custo_unitario: 3.69, fora_do_cmv: false },
      { quantidade: 3, custo_unitario: null, fora_do_cmv: true },
      { quantidade: 2, custo_unitario: null, fora_do_cmv: false },
      { quantidade: 0, custo_unitario: null, fora_do_cmv: false },
    ]);
    expect(r).toEqual({ centavos: 119556, semCusto: 1, fora: 1, itens: 4 });
  });
});

describe("variação de estoque por mês", () => {
  const contagens = [
    { data: "2026-10-31", situacao: "fechada" as const, centavos: 2795000 },
    { data: "2026-11-30", situacao: "fechada" as const, centavos: 2945000 },
    { data: "2026-12-31", situacao: "rascunho" as const, centavos: 1000000 },
  ];

  it("usa a contagem do último dia do mês anterior e a do último dia do mês", () => {
    const [nov] = variacoesEstoque(contagens, ["2026-11-01"], "2026-11-01", "2026-11-30");
    expect(nov).toEqual({ mes: "2026-11-01", centavos: 150000, inicial: 2795000, final: 2945000 });
  });

  it("sem uma das contagens fechadas, não há variação (rascunho não conta)", () => {
    const [out, dez] = variacoesEstoque(contagens, ["2026-10-01", "2026-12-01"], "2026-10-01", "2026-12-31");
    expect(out).toEqual({ mes: "2026-10-01", centavos: null, motivo: "sem_contagem", faltam: ["2026-09-30"] });
    expect(dez).toEqual({ mes: "2026-12-01", centavos: null, motivo: "sem_contagem", faltam: ["2026-12-31"] });
  });

  it("mês cortado pelo período fica sem variação", () => {
    const [nov] = variacoesEstoque(contagens, ["2026-11-01"], "2026-11-01", "2026-11-15");
    expect(nov).toMatchObject({ centavos: null, motivo: "mes_incompleto" });
  });
});

describe("DRE com variação de estoque", () => {
  const conta = (id: string, codigo: string, secao: number): ContaPlano =>
    ({ id, empresa_id: "e", conta_pai_id: null, codigo, nome: id, tipo: "analitica", dre_secao: secao }) as unknown as ContaPlano;
  const vendas = conta("vendas", "1.01", 1);
  const insumos = conta("insumos", "2.02", 5);
  const p = (c: ContaPlano, mes: string, centavos: number): Parcela => ({ lancamento: {} as Lancamento, conta: c, data: mes, mes, centavos });
  const lista = [p(vendas, "2026-10-01", 5000000), p(insumos, "2026-10-01", -2400000), p(vendas, "2026-11-01", 5200000), p(insumos, "2026-11-01", -2140000)];

  it("linha 5 vira compras + variação e as linhas calculadas acompanham", () => {
    const dre = montarDre(lista, ["2026-10-01", "2026-11-01"], [], [null, 150000]);
    const l5 = dre.linhas[4];
    expect(l5.valores).toEqual([-24000, -19900]);
    expect(l5.contas.map((c) => c.id)).toEqual(["insumos", ID_VARIACAO_ESTOQUE]);
    expect(l5.contas[1].valores).toEqual([0, 1500]);
    expect(dre.linhas[6].valores).toEqual([26000, 32100]); // margem de contribuição
  });

  it("sem nenhuma variação, a DRE fica igual à de sempre", () => {
    const sem = montarDre(lista, ["2026-10-01", "2026-11-01"]);
    expect(montarDre(lista, ["2026-10-01", "2026-11-01"], [], [null, null])).toEqual(sem);
    expect(sem.linhas[4].contas.map((c) => c.id)).toEqual(["insumos"]);
  });
});

describe("leitor de .xls antigo (Excel 97–2003)", () => {
  it("lê o relatório do PDV: textos, números e acentos", async () => {
    const linhas = await planilha("vendas-ficticias.xls");
    expect(linhas[0][1]).toBe("Produto");
    expect(linhas[1]).toEqual(["14", "ÁGUA COM GÁS 500ML", "BEBIDAS GELADAS", "52", "UN", 0, 6, 0, 312, 312, 100, -12.5]);
    expect(linhas[3][1]).toBe("COOKIE & CIA <P>");
  });

  it("lê textos que atravessam a quebra da tabela de textos (CONTINUE), em 1 e 2 bytes", async () => {
    const linhas = await planilha("muitos-textos.xls");
    expect(linhas).toHaveLength(801);
    expect(linhas[1]).toEqual(["Produto 0000 café €uro ", 0]);
    expect(linhas[800]).toEqual([`Produto 0799 café ${"x".repeat(799 % 40)}`, 799]);
    const esperado = (i: number) => `Produto ${String(i).padStart(4, "0")} café${i % 7 === 0 ? " €uro" : ""} ${"x".repeat(i % 40)}`;
    expect(linhas.slice(1).every((l, i) => l[0] === esperado(i) && l[1] === i)).toBe(true);
  });
});

describe("vendas do PDV", () => {
  it("soma o mesmo produto, ignora o total e as quantidades zero", async () => {
    const r = lerVendas(await planilha("vendas-ficticias.xls"));
    if ("erro" in r) throw new Error(r.erro);
    expect(r.itens).toEqual([
      { nome: "ÁGUA COM GÁS 500ML", categoria: "BEBIDAS GELADAS", quantidade: 52, valor: 312 },
      { nome: "LATTE P", categoria: "BEBIDAS QUENTES", quantidade: 100, valor: 1050 },
      { nome: "COOKIE & CIA <P>", categoria: "DOCES", quantidade: 7, valor: 126 },
    ]);
    expect(r.erros).toEqual([]);
  });

  it("explica quando as colunas não existem", () => {
    expect(lerVendas([["Nome", "Valor"]])).toEqual({ erro: expect.stringMatching(/Quantidade/) });
  });
});

describe("fichas técnicas", () => {
  it("agrupa por produto (sem diferença de maiúsculas) e avisa linhas incompletas", async () => {
    const r = lerFichas(await planilha("fichas-ficticias.xlsx"));
    if ("erro" in r) throw new Error(r.erro);
    expect(r.fichas).toEqual([
      {
        produto: "LATTE P",
        categoria: "BEBIDAS QUENTES",
        itens: [
          { insumo: "Leite integral", unidade: "un", quantidade: 0.2 },
          { insumo: "Café em grão", unidade: "kg", quantidade: 0.018 },
          { insumo: "Copo P", unidade: "un", quantidade: 1 },
        ],
      },
      { produto: "COOKIE & CIA <P>", categoria: "DOCES", itens: [{ insumo: "Cookie", unidade: "un", quantidade: 1 }] },
    ]);
    expect(r.erros).toEqual([expect.stringMatching(/Linha 6 .*Embalagem.*quantidade/), expect.stringMatching(/Linha 7: falta o produto/)]);
  });

  it("custo da ficha e CMV teórico: produto sem ficha fica de fora e é mostrado à parte", () => {
    const itens = new Map([
      ["leite", { custo_unitario: 3.69 }],
      ["cafe", { custo_unitario: 99 }],
      ["copo", { custo_unitario: null }],
    ]);
    expect(custoFicha([{ item_id: "leite", quantidade: 0.2 }, { item_id: "cafe", quantidade: 0.018 }, { item_id: "copo", quantidade: 1 }], itens)).toEqual({
      custo: 0.2 * 3.69 + 0.018 * 99,
      semCusto: 1,
    });
    const fichas = new Map([["latte", [{ item_id: "leite", quantidade: 0.2 }, { item_id: "cafe", quantidade: 0.018 }]]]);
    const r = cmvTeorico(
      [
        { produto_id: "latte", nome_origem: "LATTE P", categoria_origem: null, quantidade: 100, valor: 1050 },
        { produto_id: "agua", nome_origem: "ÁGUA", categoria_origem: null, quantidade: 52, valor: 312 },
      ],
      fichas,
      itens,
    );
    expect(r.cmv).toBe(Math.round(100 * (0.2 * 3.69 + 0.018 * 99) * 100)); // 25.200 centavos
    expect(r.venda).toBe(136200);
    expect(r.vendaComFicha).toBe(105000);
    expect(r.semFicha).toEqual({ produtos: 1, venda: 31200 });
    expect(r.linhas[1]).toMatchObject({ custoUnitario: null, cmv: null });
  });
});

describe("medidas da ficha técnica", () => {
  it("insumo em kg aceita g e kg", () => {
    const op = opcoesMedida({ unidade: "Kg", conteudo: null, conteudo_medida: null });
    expect(op.map((o) => o.medida)).toEqual(["g", "kg"]);
    expect(medidaInicial(op)).toEqual({ medida: "g", fator: 0.001 });
    expect(100 * medidaInicial(op).fator * 100).toBeCloseTo(10); // 100 g a R$ 100,00/kg = R$ 10,00
    expect(naMedida(0.02, 0.001)).toBe(20);
  });
  it("insumo por unidade só converte com o conteúdo informado", () => {
    expect(opcoesMedida({ unidade: "un", conteudo: null, conteudo_medida: null })).toEqual([{ medida: "un", fator: 1 }]);
    const op = opcoesMedida({ unidade: "un", conteudo: 100, conteudo_medida: "g" });
    expect(op.map((o) => o.medida)).toEqual(["un", "g", "kg"]);
    const g = op.find((o) => o.medida === "g")!;
    expect(5 * g.fator).toBeCloseTo(0.05); // 5 g de um pacote de 100 g
    const leite = opcoesMedida({ unidade: "un", conteudo: 1, conteudo_medida: "L" });
    expect(medidaInicial(leite).medida).toBe("ml");
    expect(270 * medidaInicial(leite).fator).toBeCloseTo(0.27);
  });
  it("reconhece litros escritos de vários jeitos", () => {
    expect(medidaPadronizada("lt")).toBe("L");
    expect(medidaPadronizada("Litros")).toBe("L");
    expect(medidaPadronizada("pct")).toBeNull();
  });
});
