// Datas no formato do banco (AAAA-MM-DD), sempre tratadas como datas locais, sem fuso.

function paraData(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function paraIso(data: Date) {
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${m}-${d}`;
}

export function hoje() {
  return paraIso(new Date());
}

export function somarDiasUteis(iso: string, dias: number) {
  const data = paraData(iso);
  let restantes = dias;
  while (restantes > 0) {
    data.setDate(data.getDate() + 1);
    const semana = data.getDay();
    if (semana !== 0 && semana !== 6) restantes--;
  }
  return paraIso(data);
}

// Dias úteis de hoje até a data (negativo se já passou).
export function diasUteisAte(iso: string, de = hoje()) {
  if (iso === de) return 0;
  const inicio = paraData(de);
  const fim = paraData(iso);
  const sentido = fim > inicio ? 1 : -1;
  let dias = 0;
  const cursor = new Date(inicio);
  while (paraIso(cursor) !== iso) {
    cursor.setDate(cursor.getDate() + sentido);
    const semana = cursor.getDay();
    if (semana !== 0 && semana !== 6) dias += sentido;
  }
  return dias;
}

export function formatarData(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatarPeriodo(inicio: string, fim: string) {
  const [ai, mi] = inicio.split("-").map(Number);
  const [af, mf] = fim.split("-").map(Number);
  const a = `${MESES[mi - 1]}/${String(ai).slice(2)}`;
  const b = `${MESES[mf - 1]}/${String(af).slice(2)}`;
  return a === b ? a : `${a} a ${b}`;
}

export function atrasada(prazo: string | null, status: string) {
  return !!prazo && prazo < hoje() && status !== "Concluída" && status !== "Cancelada";
}

const numeroBR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const moedaBR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarValor(valor: number | null, unidade: string | null) {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  if (unidade === "R$") return moedaBR.format(n);
  if (unidade === "%") return `${numeroBR.format(n)}%`;
  return unidade ? `${numeroBR.format(n)} ${unidade}` : numeroBR.format(n);
}
