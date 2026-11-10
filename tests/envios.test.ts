import { describe, expect, it } from "vitest";
import {
  LISTA_PADRAO,
  arquivosDoItem,
  caminhoDoArquivo,
  competenciaPadrao,
  formatarTamanho,
  lerMes,
  mesesRecentes,
  nomeDoMes,
  prazoDoMes,
  problemaNoArquivo,
  resumo,
  situacaoDoItem,
  somarMeses,
} from "@/lib/envios";

const E = "00000000-0000-0000-0000-0000000000e1";

describe("meses", () => {
  it("o mês fechado é sempre o anterior, inclusive na virada do ano", () => {
    expect(competenciaPadrao("2026-11-10")).toBe("2026-10-01");
    expect(competenciaPadrao("2027-01-03")).toBe("2026-12-01");
  });
  it("prazo é o dia 5 do mês seguinte", () => {
    expect(prazoDoMes("2026-10-01")).toBe("2026-11-05");
    expect(prazoDoMes("2026-12-01")).toBe("2027-01-05");
  });
  it("soma e lista meses", () => {
    expect(somarMeses("2026-01-01", -1)).toBe("2025-12-01");
    expect(somarMeses("2026-11-01", 14)).toBe("2028-01-01");
    expect(mesesRecentes("2026-02-20", 3)).toEqual(["2026-02-01", "2026-01-01", "2025-12-01"]);
  });
  it("lê só meses válidos do endereço", () => {
    expect(lerMes("2026-10")).toBe("2026-10-01");
    expect(lerMes("2026-13")).toBeNull();
    expect(lerMes("2026-10-01")).toBeNull();
    expect(lerMes(undefined)).toBeNull();
  });
  it("nome do mês por extenso", () => {
    expect(nomeDoMes("2026-03-01")).toBe("março de 2026");
  });
});

describe("arquivos", () => {
  it("aceita só os formatos combinados e até 20 MB", () => {
    expect(problemaNoArquivo("extrato.OFX", 1000)).toBeNull();
    expect(problemaNoArquivo("fatura.pdf", 20 * 1024 * 1024)).toBeNull();
    expect(problemaNoArquivo("fatura.pdf", 20 * 1024 * 1024 + 1)).toMatch(/20 MB/);
    expect(problemaNoArquivo("planilha.ods", 10)).toMatch(/Formato/);
    expect(problemaNoArquivo("sem-extensao", 10)).toMatch(/Formato/);
    expect(problemaNoArquivo("vazio.csv", 0)).toMatch(/vazio/);
  });
  it("caminho fica na pasta da clínica, sem acento nem espaço, com extensão minúscula", () => {
    const c = caminhoDoArquivo(E, "Extrato Itaú Out/2026.OFX", "abc");
    expect(c).toBe(`${E}/abc-Extrato-Itau-Out-2026.ofx`);
    expect(c.split("/")).toHaveLength(2);
    expect(caminhoDoArquivo(E, "...pdf", "x")).toBe(`${E}/x.pdf`);
    expect(caminhoDoArquivo(E, "a..b.pdf", "x")).toBe(`${E}/x-a.b.pdf`);
    expect(caminhoDoArquivo(E, "../../outra/a.pdf", "x").startsWith(`${E}/x-`)).toBe(true);
    expect(caminhoDoArquivo(E, "../../outra/a.pdf", "x").split("/")).toHaveLength(2);
  });
  it("tamanho legível", () => {
    expect(formatarTamanho(512)).toBe("512 B");
    expect(formatarTamanho(2048)).toBe("2 KB");
    expect(formatarTamanho(3.5 * 1024 * 1024)).toBe("3,5 MB");
    expect(formatarTamanho(null)).toBe("");
  });
});

describe("situação de cada item", () => {
  const mensal = { id: "m", frequencia: "mensal" as const };
  const unica = { id: "u", frequencia: "unica" as const };
  const out = "2026-10-01";

  it("mensal: recebido só com arquivo daquele mês", () => {
    const arquivos = [{ item_id: "m", competencia: "2026-09-01" }];
    expect(situacaoDoItem(mensal, out, arquivos, [], "2026-11-03")).toBe("pendente");
    expect(situacaoDoItem(mensal, "2026-09-01", arquivos, [], "2026-11-03")).toBe("recebido");
  });
  it("mensal: atrasado depois do dia 5", () => {
    expect(situacaoDoItem(mensal, out, [], [], "2026-11-05")).toBe("pendente");
    expect(situacaoDoItem(mensal, out, [], [], "2026-11-06")).toBe("atrasado");
  });
  it("mensal: dispensa vale só para o mês dispensado e perde para o arquivo", () => {
    const dispensas = [{ item_id: "m", competencia: out }];
    expect(situacaoDoItem(mensal, out, [], dispensas, "2026-11-20")).toBe("dispensado");
    expect(situacaoDoItem(mensal, "2026-09-01", [], dispensas, "2026-11-20")).toBe("atrasado");
    expect(situacaoDoItem(mensal, out, [{ item_id: "m", competencia: out }], dispensas, "2026-11-20")).toBe("recebido");
  });
  it("uma vez: basta um arquivo, em qualquer mês, e nunca fica atrasado", () => {
    expect(situacaoDoItem(unica, out, [], [], "2027-05-01")).toBe("pendente");
    expect(situacaoDoItem(unica, out, [{ item_id: "u", competencia: null }], [], "2027-05-01")).toBe("recebido");
  });
  it("arquivos mostrados no item e resumo", () => {
    const arquivos = [
      { item_id: "m", competencia: out },
      { item_id: "m", competencia: "2026-09-01" },
      { item_id: "u", competencia: null },
    ];
    expect(arquivosDoItem(mensal, out, arquivos)).toHaveLength(1);
    expect(arquivosDoItem(unica, out, arquivos)).toHaveLength(1);
    expect(resumo(["recebido", "dispensado", "pendente", "atrasado"])).toEqual({ total: 4, prontos: 2, faltam: 2 });
  });
});

describe("lista padrão", () => {
  it("segue o kit: itens de início e mensais, nomes únicos e com dica", () => {
    expect(LISTA_PADRAO.filter((i) => i.frequencia === "unica")).toHaveLength(6);
    expect(LISTA_PADRAO.filter((i) => i.frequencia === "mensal")).toHaveLength(7);
    expect(new Set(LISTA_PADRAO.map((i) => i.nome)).size).toBe(LISTA_PADRAO.length);
    expect(LISTA_PADRAO.every((i) => i.dica.length > 0)).toBe(true);
  });
});
