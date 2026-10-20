// Máscara de valores em reais nos campos: os dígitos entram pela direita, como em caixa eletrônico.
// "150000" vira "1.500,00". O texto mascarado é lido de novo por lerNumeroBR no servidor.
import { lerNumeroBR } from "@/lib/numeros";

const MAX_DIGITOS = 13; // até 99.999.999.999,99, dentro do numeric(14, 2) do banco

export function formatarCentavos(centavos: number) {
  const sinal = centavos < 0 ? "-" : "";
  return sinal + (Math.abs(centavos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Texto digitado → texto mascarado. `anterior` distingue apagar de digitar: apagar o último centavo esvazia o campo.
// Com negativo permitido, cada "-" digitado troca o sinal.
export function mascararMoeda(texto: string, anterior = "", negativo = false) {
  const digitos = texto.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITOS);
  const menos = negativo && (texto.match(/-/g)?.length ?? 0) % 2 === 1;
  if (!digitos) {
    const apagou = texto.replace(/\D/g, "").length < anterior.replace(/\D/g, "").length;
    if (apagou || !/\d/.test(texto)) return menos ? "-" : "";
    return "0,00";
  }
  const centavos = Number(digitos);
  return formatarCentavos(menos ? -centavos : centavos);
}

// Valor colado ("R$ 1.234,56", "1234,5", "-80") → texto mascarado; null se não der para ler.
export function colarMoeda(texto: string, negativo = false) {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  const leitura = lerNumeroBR(limpo);
  if (leitura.estado !== "valido") return null;
  const centavos = Math.round(leitura.valor * 100);
  if (centavos < 0 && !negativo) return null;
  if (String(Math.abs(centavos)).length > MAX_DIGITOS) return null;
  return formatarCentavos(centavos);
}

// Valor guardado (número) → texto inicial do campo.
export function moedaParaCampo(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = Number(valor);
  return Number.isFinite(n) ? formatarCentavos(Math.round(n * 100)) : "";
}
