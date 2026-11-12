import { describe, expect, it } from "vitest";
import type { ItemConta } from "@/lib/financeiro/apagar";
import type { ContaPlano, Lancamento } from "@/lib/financeiro/dominio";
import { parcelas } from "@/lib/financeiro/painel";
import {
  BLOCOS,
  altasDeDespesa,
  blocosDaEmpresa,
  caixaDoMes,
  categoriaDaConta,
  custosReferencia,
  despesasPorGrupo,
  dozeMeses,
  mesDoRelatorio,
  previstosNoMes,
  principaisGrupos,
  proximos,
  type SaldoAcumulado,
} from "@/lib/financeiro/relatorio-mensal";

function conta(id: string, extra: Partial<ContaPlano>): ContaPlano {
  return { id, codigo: id, nome: id, conta_pai_id: null, tipo: "analitica", dre_secao: null, ...extra } as ContaPlano;
}

// Plano: 3 Despesas (raiz) → 3.1 Pessoal (subgrupo) → salário, FGTS; aluguel direto na raiz; vendas na receita.
const PLANO = [
  conta("receitas", { tipo: "sintetica" as ContaPlano["tipo"] }),
  conta("vendas", { conta_pai_id: "receitas", dre_secao: 1 }),
  conta("despesas", { tipo: "sintetica" as ContaPlano["tipo"] }),
  conta("pessoal", { nome: "Pessoal", conta_pai_id: "despesas", tipo: "sintetica" as ContaPlano["tipo"] }),
  conta("salario", { conta_pai_id: "pessoal", dre_secao: 8 }),
  conta("fgts", { conta_pai_id: "pessoal", dre_secao: 8 }),
  conta("aluguel", { nome: "Aluguel", conta_pai_id: "despesas", dre_secao: 8 }),
  conta("lab", { nome: "Laboratório", conta_pai_id: "despesas", dre_secao: 5 }),
  conta("socios", { conta_pai_id: null, dre_secao: null }),
];

let n = 0;
function lanc(competencia: string, contaId: string, valor: number, extra: Partial<Lancamento> = {}): Lancamento {
  return {
    id: `l${++n}`,
    direcao: contaId === "vendas" ? "entrada" : "saida",
    valor_total: valor,
    conta_caixa_id: "banco",
    data_competencia: competencia,
    data_vencimento: competencia,
    data_liquidacao: competencia,
    situacao: "realizado",
    descricao: contaId,
    documento: null,
    juros_nao_segregados: false,
    rateios: [{ conta_id: contaId, valor }],
    ...extra,
  };
}

const todas = (ls: Lancamento[]) => parcelas(ls, PLANO, "competencia", {}, "2000-01-01", "2100-12-31");

describe("mês do relatório", () => {
  it("padrão é o mês passado; aceita meses anteriores; recusa futuro e lixo", () => {
    expect(mesDoRelatorio(undefined, "2026-11-12")).toBe("2026-10");
    expect(mesDoRelatorio("2026-01", "2026-11-12")).toBe("2026-01");
    expect(mesDoRelatorio("2026-11", "2026-11-12")).toBe("2026-11");
    expect(mesDoRelatorio("2026-12", "2026-11-12")).toBe("2026-10");
    expect(mesDoRelatorio("2026-13", "2026-11-12")).toBe("2026-10");
    expect(mesDoRelatorio("x", "2026-01-05")).toBe("2025-12");
  });

  it("12 meses terminam no mês do relatório, atravessando o ano", () => {
    const m = dozeMeses("2026-02");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-03-01");
    expect(m[11]).toBe("2026-02-01");
  });
});

describe("blocos por empresa", () => {
  it("blocos de clínica só para Odontologia", () => {
    expect(blocosDaEmpresa("Odontologia").some((b) => b.id === "cadeiras")).toBe(true);
    expect(blocosDaEmpresa("Alimentação").some((b) => b.id === "cadeiras")).toBe(false);
    expect(blocosDaEmpresa(null).length).toBe(BLOCOS.length - 4);
  });

  it("blocos fixos estão sempre ligados e futuros desligados", () => {
    for (const b of BLOCOS) {
      if (b.regra === "fixo") expect(b.padrao).toBe(true);
      if (b.regra === "futuro") expect(b.padrao).toBe(false);
    }
  });
});

describe("despesas por grupo", () => {
  const lista = todas([
    lanc("2026-10-05", "salario", 8000),
    lanc("2026-10-05", "fgts", 640),
    lanc("2026-10-05", "aluguel", 3000),
    lanc("2026-10-05", "lab", 4000),
    lanc("2026-10-05", "vendas", 30000),
    lanc("2026-10-05", "socios", 5000),
  ]);

  it("junta contas do mesmo subgrupo; conta direto na raiz fica sozinha; receita e sócios ficam fora", () => {
    expect(despesasPorGrupo(lista, PLANO)).toEqual([
      { id: "pessoal", nome: "Pessoal", centavos: 864000 },
      { id: "lab", nome: "Laboratório", centavos: 400000 },
      { id: "aluguel", nome: "Aluguel", centavos: 300000 },
    ]);
  });

  it("além do máximo, o resto vira Outras e o total bate", () => {
    const g = principaisGrupos(despesasPorGrupo(lista, PLANO), 1);
    expect(g.map((x) => x.nome)).toEqual(["Pessoal", "Outras"]);
    expect(g[1].centavos).toBe(700000);
  });
});

describe("pontos de atenção: despesa que subiu", () => {
  const base = (mes: string, lab: number) => [lanc(`${mes}-10`, "lab", lab), lanc(`${mes}-10`, "aluguel", 3000), lanc(`${mes}-10`, "vendas", 20000)];

  it("acusa grupo 10% acima da média de 3 meses e com mais de R$ 500 de diferença", () => {
    const lista = todas([...base("2026-07", 4000), ...base("2026-08", 4000), ...base("2026-09", 4000), ...base("2026-10", 4600)]);
    const altas = altasDeDespesa(lista, PLANO, "2026-10");
    expect(altas).toHaveLength(1);
    expect(altas[0]).toMatchObject({ nome: "Laboratório", atual: 4600, media: 4000 });
    expect(altas[0].percentual).toBeCloseTo(0.15);
  });

  it("não acusa abaixo de 10% nem diferença menor que R$ 500", () => {
    const pouco = todas([...base("2026-07", 4000), ...base("2026-08", 4000), ...base("2026-09", 4000), ...base("2026-10", 4390)]);
    expect(altasDeDespesa(pouco, PLANO, "2026-10")).toEqual([]);
    // 50% acima, mas só R$ 300 de diferença.
    const miudo = [lanc("2026-07-10", "vendas", 100), lanc("2026-08-10", "vendas", 100), lanc("2026-09-10", "vendas", 100)];
    const lista = todas([...miudo, lanc("2026-07-10", "fgts", 600), lanc("2026-08-10", "fgts", 600), lanc("2026-09-10", "fgts", 600), lanc("2026-10-10", "fgts", 900)]);
    expect(altasDeDespesa(lista, PLANO, "2026-10")).toEqual([]);
  });

  it("sem 3 meses anteriores com dados, não acusa nada", () => {
    const lista = todas([...base("2026-08", 4000), ...base("2026-09", 4000), ...base("2026-10", 9000)]);
    expect(altasDeDespesa(lista, PLANO, "2026-10")).toEqual([]);
  });
});

describe("caixa do mês", () => {
  const s = (id: string, saldo: number | null, e: number, sa: number, tr = 0, te = 0, extra: Partial<SaldoAcumulado> = {}): SaldoAcumulado => ({
    conta_caixa_id: id,
    nome: id,
    ativa: true,
    saldo_inicial: 1000,
    data_saldo_inicial: "2026-01-01",
    saldo,
    entradas: e,
    saidas: sa,
    transferencias_recebidas: tr,
    transferencias_enviadas: te,
    ...extra,
  });

  it("entradas, saídas e transferências do mês fecham do saldo inicial ao final", () => {
    const antes = [s("bb", 5000, 10000, 6000, 0, 0), s("sicredi", 2000, 1000, 0, 0, 0)];
    const fim = [s("bb", 6500, 14000, 7500, 0, 1000), s("sicredi", 3000.1, 1000.1, 0, 1000, 0)];
    const { linhas, total } = caixaDoMes(antes, fim);
    expect(linhas[0]).toMatchObject({ inicial: 5000, entradas: 4000, saidas: 1500, transferencias: -1000, final: 6500 });
    expect(linhas[1]).toMatchObject({ inicial: 2000, entradas: 0.1, saidas: 0, transferencias: 1000, final: 3000.1 });
    expect(total).toMatchObject({ inicial: 7000, entradas: 4000.1, saidas: 1500, transferencias: 0, final: 9500.1 });
    for (const l of [...linhas, total]) expect(Math.round((l.inicial + l.entradas - l.saidas + l.transferencias) * 100)).toBe(Math.round(l.final * 100));
  });

  it("conta aberta no meio do mês começa pelo saldo inicial; conta que só começa depois fica de fora", () => {
    const antes = [s("nova", null, 0, 0), s("futura", null, 0, 0)];
    const fim = [s("nova", 1500, 700, 200), s("futura", null, 0, 0)];
    const { linhas } = caixaDoMes(antes, fim);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ inicial: 1000, entradas: 700, saidas: 200, final: 1500 });
  });

  it("conta desativada e zerada não aparece", () => {
    const parada = s("velha", 0, 0, 0, 0, 0, { ativa: false, saldo_inicial: 0 });
    expect(caixaDoMes([parada], [parada]).linhas).toEqual([]);
  });
});

describe("próximos 30 dias", () => {
  const item = (vencimento: string, direcao: "entrada" | "saida", valor: number) => ({ vencimento, direcao, valor }) as ItemConta;

  it("separa vencidas, a pagar e a receber até o 30º dia", () => {
    const p = proximos(
      [
        item("2026-11-01", "saida", 100),
        item("2026-11-12", "saida", 200),
        item("2026-12-11", "saida", 300),
        item("2026-12-12", "saida", 999),
        item("2026-11-20", "entrada", 50),
        item("2026-11-01", "entrada", 70),
      ],
      "2026-11-12",
    );
    expect(p).toEqual({ receber: 50, pagar: 500, vencidas: 100, quantasVencidas: 1, ate: "2026-12-11" });
  });
});

describe("previstos que entraram na DRE do mês", () => {
  it("soma só os previstos da competência do mês", () => {
    const lista = todas([
      lanc("2026-10-10", "aluguel", 3000, { situacao: "previsto", data_liquidacao: null }),
      lanc("2026-10-10", "vendas", 800, { situacao: "previsto", data_liquidacao: null }),
      lanc("2026-10-10", "lab", 400),
      lanc("2026-09-10", "aluguel", 3000, { situacao: "previsto", data_liquidacao: null }),
    ]);
    expect(previstosNoMes(lista, "2026-10")).toEqual({ receitas: 800, despesas: 3000 });
  });
});

describe("custos x referência da assessoria", () => {
  // Plano no formato do modelo de Odontologia: aluguel e marketing dentro de "Demais despesas operacionais".
  const P = [
    conta("receitas", { tipo: "sintetica" as ContaPlano["tipo"], nome: "Receitas" }),
    conta("vendas", { conta_pai_id: "receitas", dre_secao: 1, nome: "Clínica geral" }),
    conta("das", { dre_secao: 3, nome: "DAS — Simples Nacional" }),
    conta("custos", { tipo: "sintetica" as ContaPlano["tipo"], nome: "Custos diretos variáveis" }),
    conta("mat", { conta_pai_id: "custos", dre_secao: 5, nome: "Materiais odontológicos (CMV/CSV)" }),
    conta("lab", { conta_pai_id: "custos", dre_secao: 5, nome: "Laboratório protético" }),
    conta("ops", { tipo: "sintetica" as ContaPlano["tipo"], nome: "Despesas operacionais" }),
    conta("pes", { conta_pai_id: "ops", tipo: "sintetica" as ContaPlano["tipo"], nome: "Pessoal" }),
    conta("sal", { conta_pai_id: "pes", dre_secao: 8, nome: "Salários e ordenados da equipe" }),
    conta("prof", { conta_pai_id: "pes", dre_secao: 8, nome: "Remuneração fixa de profissionais" }),
    conta("pro", { conta_pai_id: "ops", dre_secao: 8, nome: "Pró-labore dos sócios" }),
    conta("dem", { conta_pai_id: "ops", tipo: "sintetica" as ContaPlano["tipo"], nome: "Demais despesas operacionais" }),
    conta("alu", { conta_pai_id: "dem", dre_secao: 8, nome: "Aluguel e condomínio" }),
    conta("mkt", { conta_pai_id: "dem", dre_secao: 8, nome: "Marketing e publicidade" }),
    conta("soft", { conta_pai_id: "dem", dre_secao: 8, nome: "Sistemas e softwares" }),
  ];
  const mapa = new Map(P.map((c) => [c.id, c]));
  const por = (id: string) => categoriaDaConta(mapa.get(id)!, mapa);

  it("classifica pelo nome da conta e, se não achar, pelos grupos acima", () => {
    expect(por("sal")).toBe("equipe");
    expect(por("prof")).toBe("equipe");
    expect(por("alu")).toBe("ocupacao");
    expect(por("mkt")).toBe("marketing");
    expect(por("mat")).toBe("materiais");
    expect(por("lab")).toBe("laboratorio");
    expect(por("soft")).toBeNull();
    expect(por("pro")).toBeNull();
  });

  it("calcula % da receita bruta e marca acima do teto; pró-labore e tributos ficam fora do total", () => {
    const fat = 100000;
    const lista = parcelas(
      [
        lanc("2026-10-05", "vendas", fat),
        lanc("2026-10-05", "das", 6000),
        lanc("2026-10-05", "sal", 28000), // 28,0%: no teto, dentro
        lanc("2026-10-05", "alu", 9000), // 9%: acima de 7%
        lanc("2026-10-05", "mat", 4000), // 4%: abaixo
        lanc("2026-10-05", "lab", 8000),
        lanc("2026-10-05", "soft", 1000),
        lanc("2026-10-05", "pro", 15000),
      ].map((l) => ({ ...l, direcao: l.rateios[0].conta_id === "vendas" ? ("entrada" as const) : ("saida" as const) })),
      P,
      "competencia",
      {},
      "2026-10-01",
      "2026-10-31",
    );
    const { linhas, total } = custosReferencia(lista, P, fat);
    const s = Object.fromEntries(linhas.map((l) => [l.id, [l.percentual, l.situacao]]));
    expect(s.equipe).toEqual([0.28, "dentro"]);
    expect(s.ocupacao).toEqual([0.09, "acima"]);
    expect(s.materiais).toEqual([0.04, "abaixo"]);
    expect(s.laboratorio).toEqual([0.08, "dentro"]);
    expect(s.marketing).toEqual([0, "abaixo"]);
    // 28 + 9 + 4 + 8 + 1 = 50%: sem DAS e sem pró-labore.
    expect(total.valor).toBe(50000);
    expect(total.situacao).toBe("abaixo");
  });

  it("sem faturamento não há percentual", () => {
    const { total } = custosReferencia([], P, 0);
    expect(total.situacao).toBe("sem_faturamento");
  });
});
