// Números digitados no padrão brasileiro: vírgula para decimais e ponto só para milhar.
// "1.240" = 1240; "1.234,56" = 1234,56; "47,5" = 47,5. "47.5" é ambíguo e é recusado.

export type LeituraNumero =
  | { estado: "vazio" }
  | { estado: "valido"; valor: number }
  | { estado: "invalido"; texto: string };

// Sinal só com hífen; inteiro sem separador ou com milhar em grupos de três; decimais depois da vírgula.
const NUMERO_BR = /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;

export const FORMATOS_ACEITOS = "Use vírgula para decimais e ponto só para milhar. Ex.: 47,5 · 1.240 · 1.234,56";

export function lerNumeroBR(entrada: string | null | undefined): LeituraNumero {
  const texto = (entrada ?? "").trim();
  if (texto === "") return { estado: "vazio" };
  if (!NUMERO_BR.test(texto)) return { estado: "invalido", texto };
  const valor = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? { estado: "valido", valor } : { estado: "invalido", texto };
}

// Escreve o número no campo do formulário de modo que lerNumeroBR devolva o mesmo valor (sem milhar e sem notação científica).
export function paraCampoBR(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 }).replace(".", ",");
}

export function mensagemNumeroInvalido(rotulo: string, texto: string) {
  return `${rotulo} inválido: “${texto}”. Use só números, com vírgula para decimais e ponto opcional para milhar. Ex.: 47,5 · 1.240 · 1.234,56.`;
}
