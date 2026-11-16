"use server";

// Estoque e CMV (migração 0018). As planilhas são lidas no navegador (src/lib/xlsx.ts e src/lib/financeiro/estoque.ts);
// aqui chegam só os itens, conferidos de novo antes de gravar.
import { chaveNome, type ItemImportado } from "@/lib/financeiro/estoque";
import { lerNumeroBR } from "@/lib/numeros";
import { criarCliente } from "@/lib/supabase/server";
import { atualizarTelas, exigir, marcado, texto } from "@/server/util";

const MAX_ITENS = 2000;

// As regras da 0018 levantam erros já em português; aqui ficam só as de chave única, que vêm em inglês.
const MENSAGENS: Record<string, string> = {
  fin_estoque_contagens_data_unica: "Já existe uma contagem nesta data. Para trocar, apague a que está em rascunho e importe de novo.",
  fin_estoque_itens_nome_unico: "Já existe um insumo com esse nome.",
};

function falhaEstoque(error: { message: string } | null) {
  if (!error) return undefined;
  console.error(error);
  const regra = Object.keys(MENSAGENS).find((r) => error.message.includes(r));
  return { erro: regra ? MENSAGENS[regra] : error.message };
}

const curto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// Opção por empresa: só quem liga vê a área Estoque e a variação de estoque na DRE.
export async function definirEstoqueAtivo(empresaId: string, ligado: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("empresas").update({ estoque_ativo: ligado }).eq("id", empresaId);
  exigir(error);
  atualizarTelas();
}

export async function importarContagem(empresaId: string, d: { data: string; arquivo: string; itens: ItemImportado[] }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data ?? "")) return { erro: "Informe a data da contagem." };
  if (!Array.isArray(d.itens) || d.itens.length === 0) return { erro: "A planilha não tem nenhum item contado." };
  if (d.itens.length > MAX_ITENS) return { erro: "Itens demais na planilha." };
  const itens = [];
  for (const i of d.itens) {
    const nome = curto(i?.nome, 200);
    const quantidade = Number(i?.quantidade);
    if (!nome || !Number.isFinite(quantidade) || quantidade < 0) return { erro: "Algum item veio em formato inválido. Selecione o arquivo de novo." };
    itens.push({ nome, categoria: curto(i.categoria, 100), unidade: curto(i.unidade, 20) ?? "un", quantidade: Math.round(quantidade * 1000) / 1000 });
  }
  const supabase = await criarCliente();
  const { data, error } = await supabase.rpc("fin_estoque_importar_contagem", {
    p_empresa: empresaId,
    p_data: d.data,
    p_arquivo: curto(d.arquivo, 200),
    p_itens: itens,
  });
  if (error) return falhaEstoque(error)!;
  atualizarTelas();
  return { id: data as string };
}

export async function fecharContagem(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_estoque_fechar_contagem", { p_id: id });
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

// Reabrir volta a contagem para rascunho: o custo das linhas passa a vir de novo dos insumos.
export async function reabrirContagem(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_contagens").update({ situacao: "rascunho", fechada_em: null, fechada_por: null }).eq("id", id);
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

export async function apagarContagem(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_contagens").delete().eq("id", id);
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

type Mudanca = { id: string; custo_unitario: number | null; fora_do_cmv: boolean };

async function gravarMudancas(empresaId: string, mudancas: Mudanca[]) {
  const supabase = await criarCliente();
  const resultados = await Promise.all(
    mudancas.map((m) =>
      supabase.from("fin_estoque_itens").update({ custo_unitario: m.custo_unitario, fora_do_cmv: m.fora_do_cmv }).eq("id", m.id).eq("empresa_id", empresaId),
    ),
  );
  return resultados.find((r) => r.error)?.error ?? null;
}

async function itensAtuais(empresaId: string) {
  const supabase = await criarCliente();
  const { data, error } = await supabase.from("fin_estoque_itens").select("id, nome, custo_unitario, fora_do_cmv").eq("empresa_id", empresaId);
  exigir(error);
  return (data ?? []).map((i) => ({ ...i, custo_unitario: i.custo_unitario === null ? null : Number(i.custo_unitario) })) as Mudanca[] &
    { nome: string }[];
}

// Tabela de insumos: campos custo_<id> e fora_<id>. Grava só o que mudou.
export async function salvarCustos(empresaId: string, dados: FormData) {
  const atuais = await itensAtuais(empresaId);
  const mudancas: Mudanca[] = [];
  for (const item of atuais) {
    if (!dados.has(`custo_${item.id}`)) continue;
    const leitura = lerNumeroBR(texto(dados, `custo_${item.id}`));
    if (leitura.estado === "invalido") return { erro: `Custo de ${item.nome}: “${leitura.texto}” não é um número. Use vírgula para os centavos, ex.: 3,69.` };
    const custo = leitura.estado === "valido" ? leitura.valor : null;
    if (custo !== null && custo < 0) return { erro: `Custo de ${item.nome}: não pode ser negativo.` };
    const fora = marcado(dados, `fora_${item.id}`);
    if (custo !== item.custo_unitario || fora !== item.fora_do_cmv) mudancas.push({ id: item.id, custo_unitario: custo, fora_do_cmv: fora });
  }
  if (!mudancas.length) return;
  const erro = await gravarMudancas(empresaId, mudancas);
  if (erro) return falhaEstoque(erro);
  atualizarTelas();
}

// Lista de custos lida de uma planilha: casa pelo nome do insumo (sem diferença de maiúsculas e acentos).
export async function importarCustos(empresaId: string, custos: { nome: string; custo: number }[]) {
  if (!Array.isArray(custos) || custos.length > MAX_ITENS) return { erro: "Planilha de custos inválida." };
  const porNome = new Map<string, number>();
  for (const c of custos) {
    const custo = Number(c?.custo);
    if (typeof c?.nome !== "string" || !Number.isFinite(custo) || custo < 0) return { erro: "Algum custo veio em formato inválido. Selecione o arquivo de novo." };
    porNome.set(chaveNome(c.nome), Math.round(custo * 10000) / 10000);
  }
  const atuais = await itensAtuais(empresaId);
  const mudancas: Mudanca[] = [];
  const usados = new Set<string>();
  for (const item of atuais) {
    const chave = chaveNome(item.nome);
    const custo = porNome.get(chave);
    if (custo === undefined) continue;
    usados.add(chave);
    if (custo !== item.custo_unitario) mudancas.push({ id: item.id, custo_unitario: custo, fora_do_cmv: item.fora_do_cmv });
  }
  const erro = await gravarMudancas(empresaId, mudancas);
  if (erro) return falhaEstoque(erro);
  atualizarTelas();
  return { atualizados: mudancas.length, iguais: usados.size - mudancas.length, semInsumo: custos.filter((c) => !usados.has(chaveNome(c.nome))).map((c) => c.nome) };
}
