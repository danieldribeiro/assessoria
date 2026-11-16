import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerContagem, lerCustos, numeroCelula, resumoContagem, valorLinha, variacoesEstoque } from "@/lib/financeiro/estoque";
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
