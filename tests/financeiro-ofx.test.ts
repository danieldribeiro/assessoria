import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  candidatosConciliacao,
  candidatosTransferencia,
  somarDias,
  classificarPrevia,
  decodificarOfx,
  lerDataOfx,
  lerOfx,
  lerValorOfx,
  resumoArquivo,
  type ExtratoOfx,
} from "@/lib/financeiro/ofx";

const arquivo = (nome: string) => new Uint8Array(readFileSync(`${__dirname}/ofx/${nome}`));
const ler = (nome: string) => lerOfx(decodificarOfx(arquivo(nome))) as ExtratoOfx;

describe("valores e datas do OFX", () => {
  it("lê valores com ponto ou vírgula decimal, milhares e sinal, sem ponto flutuante", () => {
    expect(lerValorOfx("-6500.00")).toBe(-650000);
    expect(lerValorOfx("1234,56")).toBe(123456);
    expect(lerValorOfx("1.234.567,89")).toBe(123456789);
    expect(lerValorOfx("1,234.56")).toBe(123456);
    expect(lerValorOfx("-50.5")).toBe(-5050);
    expect(lerValorOfx("+12")).toBe(1200);
    expect(lerValorOfx("0.1")).toBe(10);
    expect(lerValorOfx("-.99")).toBe(-99);
  });

  it("recusa valor ambíguo ou estranho em vez de adivinhar", () => {
    expect(lerValorOfx("1.000")).toBeNull();
    expect(lerValorOfx("12.3456")).toBeNull();
    expect(lerValorOfx("abc")).toBeNull();
    expect(lerValorOfx("")).toBeNull();
    expect(lerValorOfx(null)).toBeNull();
    expect(lerValorOfx("1-2")).toBeNull();
  });

  it("lê a data e recusa data impossível", () => {
    expect(lerDataOfx("20261005120000[-3:BRT]")).toBe("2026-10-05");
    expect(lerDataOfx("20261006")).toBe("2026-10-06");
    expect(lerDataOfx("20261340")).toBeNull();
    expect(lerDataOfx("20260230")).toBeNull();
    expect(lerDataOfx(null)).toBeNull();
  });
});

describe("arquivo OFX 1 (SGML, Windows-1252)", () => {
  const e = ler("sgml-1252.ofx");

  it("lê conta, período e saldo do banco", () => {
    expect(e).toMatchObject({ banco: "0077", agencia: "0001", conta: "12345678", inicio: "2026-10-01", fim: "2026-10-31", saldo: 1523011, saldoEm: "2026-10-31" });
  });

  it("lê as movimentações com acentos, documento e descrição", () => {
    expect(e.movimentos).toHaveLength(4);
    expect(e.movimentos[0]).toMatchObject({
      data: "2026-10-05",
      centavos: -650000,
      tipo_ofx: "DEBIT",
      descricao: "PIX ENVIADO - IMOBILIARIA SAO JOSE",
      fitid: "202610050001",
      documento: "000123",
    });
    expect(e.movimentos[1].descricao).toBe("TED RECEBIDA - CONVÊNIO ODONTOPREV");
    expect(e.movimentos[1].centavos).toBe(123456);
  });

  it("duas tarifas iguais no mesmo dia, sem FITID, são duas movimentações", () => {
    const tarifas = e.movimentos.filter((m) => m.descricao === "TARIFA PACOTE SERVIÇOS");
    expect(tarifas).toHaveLength(2);
    expect(tarifas[0].chave).not.toBe(tarifas[1].chave);
    expect(tarifas.map((t) => t.repetidaNoArquivo)).toEqual([false, false]);
  });

  it("aponta as linhas com erro, sem descartá-las em silêncio", () => {
    expect(e.erros.map((x) => [x.posicao, x.motivo])).toEqual([
      [5, "Data inválida ou ausente"],
      [6, "Valor inválido ou ausente"],
    ]);
  });

  it("ler o mesmo arquivo de novo dá as mesmas chaves", () => {
    expect(ler("sgml-1252.ofx").movimentos.map((m) => m.chave)).toEqual(e.movimentos.map((m) => m.chave));
  });
});

describe("arquivo OFX 2 (XML, UTF-8)", () => {
  const e = ler("xml-utf8.ofx");

  it("lê XML com tags fechadas e entidades", () => {
    expect(e).toMatchObject({ banco: "341", agencia: "1234", conta: "98765-4", saldo: -5050 });
    expect(e.movimentos.map((m) => [m.data, m.centavos, m.descricao])).toEqual([
      ["2026-09-10", -125000, "DENTAL SPEED"],
      ["2026-09-11", -8000, "ENERGIA & LUZ"],
      ["2026-09-12", 123456789, "Recebimento"],
    ]);
  });

  it("FITID repetido em lançamentos diferentes não esconde nenhum deles", () => {
    expect(new Set(e.movimentos.map((m) => m.chave)).size).toBe(3);
  });
});

describe("arquivo que não é OFX", () => {
  it("devolve um erro claro", () => {
    expect(lerOfx("data;valor\n2026-10-01;10")).toEqual({ erro: "O arquivo não parece um extrato OFX (não tem a marca <OFX>)." });
  });

  it("STMTTRN sem fechamento", () => {
    const e = lerOfx("<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20261001<TRNAMT>-5<FITID>1<STMTTRN><DTPOSTED>20261002<TRNAMT>7<FITID>2</BANKTRANLIST></OFX>") as ExtratoOfx;
    expect(e.movimentos.map((m) => m.centavos)).toEqual([-500, 700]);
  });
});

describe("prévia da importação", () => {
  const e = ler("sgml-1252.ofx");

  it("separa novas, já importadas e parecidas", () => {
    const [aluguel, ted, tarifa1] = e.movimentos;
    const previa = classificarPrevia(e.movimentos, [
      { chave: aluguel.chave, data: aluguel.data, valor: aluguel.centavos / 100, descricao: aluguel.descricao },
      // Mesma TED gravada antes com outro identificador: o banco mudou o FITID.
      { chave: "fitid:OUTRO", data: ted.data, valor: ted.centavos / 100, descricao: ted.descricao.toLowerCase() },
    ]);
    expect(previa.map((p) => p.estado)).toEqual(["existente", "parecida", "nova", "nova"]);
    expect(tarifa1.chave).toMatch(/^sem-id:/);
  });

  it("reimportar o arquivo inteiro: tudo já importado", () => {
    const existentes = e.movimentos.map((m) => ({ chave: m.chave, data: m.data, valor: m.centavos / 100, descricao: m.descricao }));
    expect(classificarPrevia(e.movimentos, existentes).every((p) => p.estado === "existente")).toBe(true);
  });

  it("resumo SHA-256 do arquivo", async () => {
    expect(await resumoArquivo(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("candidatos à conciliação", () => {
  const base = { conta_caixa_id: "banco", situacao: "realizado", data_vencimento: null };
  const lancs = [
    { ...base, id: "a", direcao: "saida" as const, valor_total: 6500, data_liquidacao: "2026-10-04" },
    { ...base, id: "b", direcao: "saida" as const, valor_total: 6500, data_liquidacao: "2026-10-05" },
    { ...base, id: "c", direcao: "entrada" as const, valor_total: 6500, data_liquidacao: "2026-10-05" },
    { ...base, id: "d", direcao: "saida" as const, valor_total: 6500.01, data_liquidacao: "2026-10-05" },
    { ...base, id: "e", direcao: "saida" as const, valor_total: 6500, data_liquidacao: "2026-10-05", conta_caixa_id: "outro" },
    { ...base, id: "f", direcao: "saida" as const, valor_total: 6500, data_liquidacao: "2026-11-30" },
    { ...base, id: "g", direcao: "saida" as const, valor_total: 6500, data_liquidacao: "2026-10-05", situacao: "cancelado" },
    { ...base, id: "h", direcao: "saida" as const, valor_total: 6500, data_liquidacao: "2026-10-05" },
    { ...base, id: "i", direcao: "saida" as const, valor_total: 6500, data_liquidacao: null, data_vencimento: "2026-10-06", situacao: "previsto" },
  ];
  it("mesma conta, sentido e valor, não conciliado, não cancelado, data próxima primeiro", () => {
    const c = candidatosConciliacao({ conta_caixa_id: "banco", data: "2026-10-05", valor: -6500 }, lancs, new Set(["h"]));
    expect(c.map((x) => x.lancamento.id)).toEqual(["b", "a", "i"]);
  });
});

describe("transferências candidatas", () => {
  const base = { situacao: "realizado", valor: 1000, data: "2026-10-05" };
  const ts = [
    { ...base, id: "sai", conta_origem_id: "banco", conta_destino_id: "caixa" },
    { ...base, id: "entra", conta_origem_id: "caixa", conta_destino_id: "banco" },
    { ...base, id: "cancelada", conta_origem_id: "banco", conta_destino_id: "caixa", situacao: "cancelado" },
    { ...base, id: "outro-valor", conta_origem_id: "banco", conta_destino_id: "caixa", valor: 999.99 },
    { ...base, id: "ja", conta_origem_id: "banco", conta_destino_id: "caixa" },
  ];
  it("saída do banco só casa com transferência que sai do banco", () => {
    expect(candidatosTransferencia({ conta_caixa_id: "banco", data: "2026-10-06", valor: -1000 }, ts, new Set(["ja"])).map((c) => c.transferencia.id)).toEqual(["sai"]);
    expect(candidatosTransferencia({ conta_caixa_id: "banco", data: "2026-10-06", valor: 1000 }, ts, new Set()).map((c) => c.transferencia.id)).toEqual(["entra"]);
  });
  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-12-28", 10)).toBe("2027-01-07");
    expect(somarDias("2026-03-05", -10)).toBe("2026-02-23");
  });
});
