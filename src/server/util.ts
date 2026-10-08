import "server-only";
import { revalidatePath } from "next/cache";

export function texto(dados: FormData, campo: string) {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

export function numero(dados: FormData, campo: string) {
  const valor = texto(dados, campo);
  if (valor === null) return null;
  // Aceita "1.234,56" e "1234.56".
  const normalizado = valor.includes(",") ? valor.replace(/\./g, "").replace(",", ".") : valor;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function nota(dados: FormData, campo: string) {
  const n = Number(dados.get(campo));
  return n === 1 || n === 2 || n === 3 ? n : 2;
}

export function marcado(dados: FormData, campo: string) {
  return dados.get(campo) === "on";
}

// Tudo é pequeno e interno: depois de qualquer gravação, atualiza todas as telas.
export function atualizarTelas() {
  revalidatePath("/", "layout");
}

export function falha(error: { message: string } | null) {
  if (!error) return undefined;
  console.error(error);
  return { erro: "Não foi possível salvar. " + error.message };
}

export function exigir(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
