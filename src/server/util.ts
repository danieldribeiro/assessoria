import "server-only";
import { revalidatePath } from "next/cache";
import { CAMPOS_CADASTRO } from "@/lib/dominio";
import type { criarCliente } from "@/lib/supabase/server";

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

// Campo "Responsável" dos itens: vazio = segue o responsável da área.
export function responsavel(dados: FormData) {
  return { responsavel_id: texto(dados, "responsavel_id") };
}

// Razão social, CNPJ, inscrições e endereço: mesmos campos na assessoria e nas empresas.
export function cadastro(dados: FormData) {
  return Object.fromEntries(CAMPOS_CADASTRO.map((c) => [c, texto(dados, c)])) as Record<
    (typeof CAMPOS_CADASTRO)[number],
    string | null
  >;
}

type Supabase = Awaited<ReturnType<typeof criarCliente>>;

// Campo de imagem dos formulários: "<campo>" traz o arquivo já reduzido no navegador e
// "<campo>_remover" pede para tirar a imagem. Devolve a nova URL, null para remover ou
// undefined quando nada mudou.
export async function imagemEnviada(supabase: Supabase, dados: FormData, campo: string, pasta: string) {
  if (dados.get(`${campo}_remover`) === "1") return null;
  const arquivo = dados.get(campo);
  if (!(arquivo instanceof File) || arquivo.size === 0) return undefined;
  if (arquivo.size > 2 * 1024 * 1024) throw new Error("A imagem passou de 2 MB.");
  const extensao = arquivo.type === "image/png" ? "png" : arquivo.type === "image/jpeg" ? "jpg" : "webp";
  const caminho = `${pasta}/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage.from("imagens").upload(caminho, arquivo, { contentType: arquivo.type });
  if (error) throw new Error("Não foi possível enviar a imagem. " + error.message);
  return supabase.storage.from("imagens").getPublicUrl(caminho).data.publicUrl;
}
