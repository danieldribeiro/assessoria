import { mesesEntre, ultimoDiaDoMes } from "./fluxo";

// Período das telas do financeiro. No endereço, `de` e `ate` são meses ("2026-10") ou dias ("2026-10-05").
// Um intervalo de dias que fecha meses inteiros (01/10 a 31/10) volta à forma de mês.

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type Periodo = {
  de: string;
  ate: string;
  inicio: string;
  fim: string;
  // Primeiro dia de cada mês tocado pelo período, para as colunas mensais.
  meses: string[];
  emMeses: boolean;
  anterior: { inicio: string; fim: string; meses: string[] };
};

// "2026-10" + n meses → "2026-11".
export function somarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function somarDiasData(iso: string, n: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diasEntre(inicio: string, fim: string) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000) + 1;
}

const diaValido = (v: string) => DIA.test(v) && somarDiasData(v, 0) === v;

// Primeiro e último dia de um valor do endereço, ou null se não for mês nem dia válido.
function limites(v: string | undefined): [string, string] | null {
  if (!v) return null;
  if (MES.test(v)) return [`${v}-01`, ultimoDiaDoMes(v)];
  if (diaValido(v)) return [v, v];
  return null;
}

export function montarPeriodo(inicio: string, fim: string): Periodo {
  const emMeses = inicio.endsWith("-01") && fim === ultimoDiaDoMes(fim);
  let anterior: { inicio: string; fim: string };
  if (emMeses) {
    const n = mesesEntre(inicio, fim).length;
    anterior = { inicio: `${somarMeses(inicio.slice(0, 7), -n)}-01`, fim: somarDiasData(inicio, -1) };
  } else {
    const n = diasEntre(inicio, fim);
    anterior = { inicio: somarDiasData(inicio, -n), fim: somarDiasData(inicio, -1) };
  }
  return {
    de: emMeses ? inicio.slice(0, 7) : inicio,
    ate: emMeses ? fim.slice(0, 7) : fim,
    inicio,
    fim,
    meses: mesesEntre(inicio, fim),
    emMeses,
    anterior: { ...anterior, meses: mesesEntre(anterior.inicio, anterior.fim) },
  };
}

// Lê `de` e `ate` do endereço. Sem nada válido, fica o mês de hoje; só `de`, vale só ele; fora de ordem, inverte.
export function lerPeriodo(de: string | undefined, ate: string | undefined, hoje: string): Periodo {
  const a = limites(de) ?? limites(ate) ?? limites(hoje.slice(0, 7))!;
  const b = limites(ate) ?? a;
  return montarPeriodo(a[0] < b[0] ? a[0] : b[0], a[1] > b[1] ? a[1] : b[1]);
}

// Período seguinte (sentido 1) ou anterior (-1), do mesmo tamanho: em meses, se for de meses inteiros; senão, em dias.
export function deslocar(p: Periodo, sentido: 1 | -1) {
  if (p.emMeses) {
    const n = p.meses.length * sentido;
    return { de: somarMeses(p.de, n), ate: somarMeses(p.ate, n) };
  }
  const n = diasEntre(p.inicio, p.fim) * sentido;
  const q = montarPeriodo(somarDiasData(p.inicio, n), somarDiasData(p.fim, n));
  return { de: q.de, ate: q.ate };
}

const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

// Nome do seletor: "Outubro 2026", "Junho a Outubro 2026", "01/10/26 – 05/10/26".
export function nomePeriodo(p: Periodo) {
  if (!p.emMeses) return p.inicio === p.fim ? diaCurto(p.inicio) : `${diaCurto(p.inicio)} – ${diaCurto(p.fim)}`;
  const nome = (mes: string, comAno: boolean) => `${NOMES[Number(mes.slice(5, 7)) - 1]}${comAno ? ` ${mes.slice(0, 4)}` : ""}`;
  if (p.de === p.ate) return nome(p.de, true);
  return `${nome(p.de, p.de.slice(0, 4) !== p.ate.slice(0, 4))} a ${nome(p.ate, true)}`;
}

// Texto curto para títulos: "out/26", "jun/26 a out/26", "01/10/26 a 05/10/26".
export function textoPeriodo(inicio: string, fim: string) {
  const emMeses = inicio.endsWith("-01") && fim === ultimoDiaDoMes(fim);
  if (!emMeses) return inicio === fim ? diaCurto(inicio) : `${diaCurto(inicio)} a ${diaCurto(fim)}`;
  const mes = (iso: string) => `${CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
  return mes(inicio) === mes(fim) ? mes(inicio) : `${mes(inicio)} a ${mes(fim)}`;
}
