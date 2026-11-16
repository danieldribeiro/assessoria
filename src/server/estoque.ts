"use server";

// Estoque e CMV (migração 0018). As planilhas são lidas no navegador (src/lib/xlsx.ts e src/lib/financeiro/estoque.ts);
// aqui chegam só os itens, conferidos de novo antes de gravar.
import { MEDIDAS_CONTEUDO, chaveNome, type FichaImportada, type ItemImportado, type VendaImportada } from "@/lib/financeiro/estoque";
import { lerNumeroBR } from "@/lib/numeros";
import { criarCliente } from "@/lib/supabase/server";
import { atualizarTelas, exigir, marcado, texto } from "@/server/util";

const MAX_ITENS = 2000;

// As regras da 0018 levantam erros já em português; aqui ficam só as de chave única, que vêm em inglês.
const MENSAGENS: Record<string, string> = {
  fin_estoque_contagens_data_unica: "Já existe uma contagem nesta data. Para trocar, apague a que está em rascunho e importe de novo.",
  fin_estoque_itens_nome_unico: "Já existe um insumo com esse nome.",
  fin_estoque_produtos_nome_unico: "Já existe um produto com esse nome.",
  fin_estoque_ficha_itens_insumo_unico: "O mesmo insumo aparece duas vezes na ficha. Junte as quantidades numa linha só.",
  fin_estoque_ficha_itens_item: "Esse insumo é usado em alguma ficha técnica e não pode sair.",
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

type Mudanca = { id: string; custo_unitario: number | null; fora_do_cmv: boolean; conteudo?: number | null; conteudo_medida?: string | null };

async function gravarMudancas(empresaId: string, mudancas: Mudanca[]) {
  const supabase = await criarCliente();
  const resultados = await Promise.all(
    mudancas.map((m) =>
      supabase.from("fin_estoque_itens").update(m.conteudo === undefined ? { custo_unitario: m.custo_unitario, fora_do_cmv: m.fora_do_cmv } : { custo_unitario: m.custo_unitario, fora_do_cmv: m.fora_do_cmv, conteudo: m.conteudo, conteudo_medida: m.conteudo_medida ?? null }).eq("id", m.id).eq("empresa_id", empresaId),
    ),
  );
  return resultados.find((r) => r.error)?.error ?? null;
}

async function itensAtuais(empresaId: string) {
  const supabase = await criarCliente();
  // "*": conteudo e conteudo_medida só existem depois da 0021.
  const { data, error } = await supabase.from("fin_estoque_itens").select("*").eq("empresa_id", empresaId);
  exigir(error);
  return (data ?? []).map((i) => ({
    id: i.id as string,
    nome: i.nome as string,
    fora_do_cmv: i.fora_do_cmv as boolean,
    custo_unitario: i.custo_unitario === null ? null : Number(i.custo_unitario),
    conteudo: "conteudo" in i ? (i.conteudo === null ? null : Number(i.conteudo)) : undefined,
    conteudo_medida: "conteudo_medida" in i ? ((i.conteudo_medida as string | null) ?? null) : undefined,
  }));
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
    const mudanca: Mudanca = { id: item.id, custo_unitario: custo, fora_do_cmv: fora };
    let mudou = custo !== item.custo_unitario || fora !== item.fora_do_cmv;
    // Conteúdo de 1 unidade (0021): vazio apaga; com número, guarda junto com a medida.
    if (item.conteudo !== undefined && dados.has(`conteudo_${item.id}`)) {
      const c = lerNumeroBR(texto(dados, `conteudo_${item.id}`));
      if (c.estado === "invalido") return { erro: `Conteúdo de ${item.nome}: “${c.texto}” não é um número. Ex.: 100 ou 1,5.` };
      const conteudo = c.estado === "valido" ? c.valor : null;
      if (conteudo !== null && conteudo <= 0) return { erro: `Conteúdo de ${item.nome}: precisa ser maior que zero.` };
      const medida = conteudo === null ? null : texto(dados, `medida_${item.id}`);
      if (medida !== null && !MEDIDAS_CONTEUDO.includes(medida)) return { erro: `Conteúdo de ${item.nome}: escolha g, kg, ml, L, un ou pct.` };
      mudanca.conteudo = conteudo;
      mudanca.conteudo_medida = medida;
      if (conteudo !== item.conteudo || medida !== item.conteudo_medida) mudou = true;
    }
    if (mudou) mudancas.push(mudanca);
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

// ---------------------------------------------------------------------------
// Etapa 2 (0019): fichas técnicas e vendas do PDV
// ---------------------------------------------------------------------------

const numeroValido = (v: unknown, minimo: number) => typeof v === "number" && Number.isFinite(v) && v >= minimo;

export async function importarVendas(empresaId: string, d: { mes: string; arquivo: string; itens: VendaImportada[] }) {
  if (!/^\d{4}-\d{2}$/.test(d.mes ?? "")) return { erro: "Escolha o mês das vendas." };
  if (!Array.isArray(d.itens) || d.itens.length === 0) return { erro: "O relatório não tem vendas." };
  if (d.itens.length > MAX_ITENS) return { erro: "Produtos demais no relatório." };
  const itens = [];
  for (const i of d.itens) {
    const nome = curto(i?.nome, 200);
    if (!nome || !numeroValido(i?.quantidade, 0) || (i.valor !== null && !numeroValido(i?.valor, -1e9)))
      return { erro: "Alguma linha veio em formato inválido. Selecione o arquivo de novo." };
    itens.push({ nome, categoria: curto(i.categoria, 100), quantidade: Math.round(i.quantidade * 1000) / 1000, valor: i.valor === null ? null : Math.round(i.valor * 100) / 100 });
  }
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_estoque_importar_vendas", { p_empresa: empresaId, p_mes: `${d.mes}-01`, p_arquivo: curto(d.arquivo, 200), p_itens: itens });
  if (error) return falhaEstoque(error)!;
  atualizarTelas();
  return { mes: d.mes };
}

export async function apagarVendas(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_vendas").delete().eq("id", id);
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

export async function importarFichas(empresaId: string, fichas: FichaImportada[]) {
  if (!Array.isArray(fichas) || fichas.length === 0) return { erro: "A planilha não tem fichas." };
  if (fichas.length > MAX_ITENS) return { erro: "Fichas demais na planilha." };
  const limpas = [];
  for (const f of fichas) {
    const produto = curto(f?.produto, 200);
    if (!produto || !Array.isArray(f.itens) || f.itens.length > 100) return { erro: "Alguma ficha veio em formato inválido. Selecione o arquivo de novo." };
    const itens = [];
    for (const i of f.itens) {
      const insumo = curto(i?.insumo, 200);
      if (!insumo || !numeroValido(i?.quantidade, 1e-9)) return { erro: `Ficha de ${produto}: algum insumo veio sem nome ou sem quantidade.` };
      itens.push({ insumo, unidade: curto(i.unidade, 20) ?? "un", quantidade: Math.round(i.quantidade * 1e6) / 1e6 });
    }
    limpas.push({ produto, categoria: curto(f.categoria, 100), itens });
  }
  const supabase = await criarCliente();
  const { data, error } = await supabase.rpc("fin_estoque_importar_fichas", { p_empresa: empresaId, p_fichas: limpas });
  if (error) return falhaEstoque(error)!;
  atualizarTelas();
  return { resultado: data as { fichas: number; produtos_novos: number; insumos_novos: number } };
}

export async function salvarFicha(produtoId: string, itens: { item_id: string; quantidade: number }[]) {
  if (!Array.isArray(itens) || itens.length > 100) return { erro: "Ficha inválida." };
  const vistos = new Set<string>();
  for (const i of itens) {
    if (typeof i?.item_id !== "string" || !/^[0-9a-f-]{36}$/i.test(i.item_id)) return { erro: "Escolha o insumo de cada linha." };
    if (!numeroValido(i.quantidade, 1e-9)) return { erro: "Informe a quantidade de cada insumo (maior que zero)." };
    if (vistos.has(i.item_id)) return { erro: "O mesmo insumo aparece duas vezes na ficha. Junte as quantidades numa linha só." };
    vistos.add(i.item_id);
  }
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_estoque_salvar_ficha", {
    p_produto: produtoId,
    p_itens: itens.map((i) => ({ item_id: i.item_id, quantidade: Math.round(i.quantidade * 1e6) / 1e6 })),
  });
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

export async function mudarAtivacaoProduto(id: string, ativo: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_produtos").update({ ativo }).eq("id", id);
  exigir(error);
  atualizarTelas();
}
