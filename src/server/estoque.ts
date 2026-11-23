"use server";

// Estoque e CMV (migração 0018). As planilhas são lidas no navegador (src/lib/xlsx.ts e src/lib/financeiro/estoque.ts);
// aqui chegam só os itens, conferidos de novo antes de gravar.
import { MEDIDAS_CONTEUDO, chaveNome, type FichaImportada, type ItemImportado, type VendaImportada } from "@/lib/financeiro/estoque";
import { conferirNota, type NotaEnviada } from "@/lib/financeiro/notas";
import { MOTIVOS_PERDA } from "@/lib/financeiro/perdas";
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
  "row-level security": "Sem permissão para gravar aqui (ou o controle de estoque está desligado nesta empresa).",
  fin_estoque_notas_chave_unica: "Esta nota já foi lançada (mesma chave). Abra a que existe para mudar.",
  fin_estoque_notas_lancamentos_lancamento: "O lançamento escolhido não existe mais.",
  fin_contrapartes_nome_unico: "Já existe um fornecedor com esse nome.",
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
  const { data: contagem, error } = await supabase.rpc("fin_estoque_fechar_contagem", { p_id: id });
  if (error) return falhaEstoque(error);
  // Fechar a contagem recomeça o custo médio dos insumos com nota de compra (0026). Antes da 0026 a função não existe.
  const { data: c } = await supabase.from("fin_estoque_contagens").select("empresa_id").eq("id", contagem ?? id).maybeSingle();
  if (c) {
    const { error: e } = await supabase.rpc("fin_estoque_recalcular_custos", { p_empresa: c.empresa_id });
    if (e && !/fin_estoque_recalcular_custos/.test(e.message)) console.error(e);
  }
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

// Insumo cadastrado à mão (aba Insumos). O nome repetido (sem diferença de maiúsculas) é barrado pelo banco.
export async function criarInsumo(empresaId: string, dados: FormData) {
  const nome = curto(texto(dados, "nome"), 120);
  const unidade = curto(texto(dados, "unidade"), 20);
  if (!nome) return { erro: "Informe o nome do insumo." };
  if (!unidade) return { erro: "Informe a unidade em que o insumo é contado (ex.: kg, un, pct)." };
  const leitura = lerNumeroBR(texto(dados, "custo"));
  if (leitura.estado === "invalido") return { erro: `Custo: “${leitura.texto}” não é um número. Use vírgula para os centavos, ex.: 3,69.` };
  const custo = leitura.estado === "valido" ? leitura.valor : null;
  if (custo !== null && custo < 0) return { erro: "O custo não pode ser negativo." };
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_itens").insert({
    empresa_id: empresaId,
    nome,
    unidade,
    categoria: curto(texto(dados, "categoria"), 60),
    custo_unitario: custo === null ? null : Math.round(custo * 10000) / 10000,
    fora_do_cmv: marcado(dados, "fora_do_cmv"),
  });
  if (error) return falhaEstoque(error);
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

// Fechar o CMV do mês (0023): grava o custo de cada ficha agora; mudar custo de insumo depois não mexe mais no mês.
export async function fecharCmvMes(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_estoque_fechar_vendas", { p_id: id });
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

// Reabrir: apaga os custos gravados e o mês volta a usar o custo atual dos insumos.
export async function reabrirCmvMes(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_estoque_reabrir_vendas", { p_id: id });
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

// Complementos do mês (0025): adicionais cobrados à parte que o relatório do PDV não traz. Troca a lista inteira do mês.
export async function salvarComplementos(vendaId: string, itens: { nome: string; quantidade: number; valor: number | null }[]) {
  if (!Array.isArray(itens) || itens.length > 200) return { erro: "Complementos inválidos." };
  const limpos = [];
  const vistos = new Set<string>();
  for (const i of itens) {
    const nome = curto(i?.nome, 200);
    if (!nome) return { erro: "Informe o nome de cada complemento." };
    if (!numeroValido(i.quantidade, 0)) return { erro: `Quantidade de ${nome} inválida.` };
    if (i.valor !== null && !numeroValido(i.valor, 0)) return { erro: `Total de ${nome} inválido.` };
    if (vistos.has(chaveNome(nome))) return { erro: `${nome} aparece duas vezes. Junte numa linha só.` };
    vistos.add(chaveNome(nome));
    limpos.push({ nome, quantidade: Math.round(i.quantidade * 1000) / 1000, valor: i.valor === null ? null : Math.round(i.valor * 100) / 100 });
  }
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_estoque_salvar_complementos", { p_venda: vendaId, p_itens: limpos });
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

// preco: preço de venda de tabela (0024); undefined = não mexe (antes da migração o campo nem aparece), null = apaga.
export async function salvarFicha(produtoId: string, itens: { item_id: string; quantidade: number }[], preco?: number | null) {
  if (!Array.isArray(itens) || itens.length > 100) return { erro: "Ficha inválida." };
  if (preco !== undefined && preco !== null && !(Number.isFinite(preco) && preco >= 0 && preco < 1e9)) return { erro: "Preço de venda inválido." };
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
  if (preco !== undefined) {
    const r = await supabase.from("fin_estoque_produtos").update({ preco_venda: preco === null ? null : Math.round(preco * 100) / 100 }).eq("id", produtoId);
    if (r.error) return falhaEstoque(r.error);
  }
  atualizarTelas();
}

export async function mudarAtivacaoProduto(id: string, ativo: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_produtos").update({ ativo }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

// Notas de compra (0026). O XML é lido no navegador (src/lib/financeiro/notas.ts); aqui chega a nota conferida.
export async function salvarNota(empresaId: string, id: string | null, nota: NotaEnviada) {
  const motivo = conferirNota(nota);
  if (motivo) return { erro: motivo };
  if (nota.itens.length > MAX_ITENS) return { erro: "Itens demais na nota." };
  const r = (c: number) => Math.round(c) / 100;
  const f = nota.financeiro;
  const p = {
    tipo: nota.tipo,
    chave: curto(nota.chave, 100),
    numero: curto(nota.numero, 30),
    serie: curto(nota.serie, 10),
    emissao: nota.emissao || null,
    entrada: nota.entrada,
    contraparte_id: nota.contraparte_id || null,
    emitente_documento: curto(nota.emitente_documento, 20),
    emitente_nome: curto(nota.emitente_nome, 200),
    valor_total: r(nota.valor_total),
    valor_frete: nota.tipo === "produto" ? r(nota.valor_frete) : 0,
    nota_produto_id: nota.tipo === "servico" ? nota.nota_produto_id || null : null,
    remessa: nota.tipo === "produto" ? curto(nota.remessa, 60) : null,
    origem: nota.origem === "xml" ? "xml" : "manual",
    arquivo_nome: curto(nota.arquivo_nome, 200),
    informacoes: curto(nota.informacoes, 2000),
    observacoes: curto(nota.observacoes, 1000),
    itens: nota.itens.map((i) => ({
      codigo: curto(i.codigo, 60),
      descricao: curto(i.descricao, 300),
      unidade: curto(i.unidade, 20),
      quantidade: Math.round(i.quantidade * 10000) / 10000,
      valor: r(i.valor),
      item_id: i.criar_insumo ? null : i.item_id || null,
      fator: Math.round(i.fator * 10000) / 10000,
      criar_insumo: i.criar_insumo ? { nome: curto(i.criar_insumo.nome, 200), unidade: curto(i.criar_insumo.unidade, 20) ?? "un" } : null,
    })),
    financeiro:
      f.modo === "criar"
        ? { ...f, duplicatas: f.duplicatas.map((d) => ({ numero: curto(d.numero, 20), vencimento: d.vencimento, valor: r(d.valor) })) }
        : f.modo === "ligar"
          ? { modo: "ligar", lancamentos: f.lancamentos.slice(0, 50) }
          : // No cartão, a nota grava primeiro sem pagamento; a compra no cartão vem logo depois.
            { modo: f.modo === "cartao" ? "nenhum" : f.modo },
  };
  const supabase = await criarCliente();
  const { data, error } = await supabase.rpc("fin_estoque_salvar_nota", { p_empresa: empresaId, p_id: id, p_nota: p });
  if (error) return falhaEstoque(error)!;
  const notaId = data as string;
  if (f.modo === "cartao") {
    const falha = await comprarNoCartao(supabase, empresaId, notaId, nota, f);
    if (falha) {
      // Nota nova: desfaz, para não ficar uma nota sem o pagamento que a pessoa pediu.
      if (!id) await supabase.rpc("fin_estoque_apagar_nota", { p_id: notaId });
      atualizarTelas();
      return { erro: id ? `A nota foi salva, mas a compra no cartão não: ${falha}` : falha };
    }
  }
  atualizarTelas();
  return { id: notaId };
}

// A nota paga no cartão vira uma compra no cartão (fin_lancar_no_cartao, a mesma da aba Cartões), com o
// fornecedor e a conta da nota e competência na entrada, e as parcelas ficam ligadas à nota.
async function comprarNoCartao(
  supabase: Awaited<ReturnType<typeof criarCliente>>,
  empresaId: string,
  notaId: string,
  nota: NotaEnviada,
  f: Extract<NotaEnviada["financeiro"], { modo: "cartao" }>,
): Promise<string | null> {
  const { data: gravada, error: e1 } = await supabase.from("fin_estoque_notas").select("contraparte_id, emitente_nome").eq("id", notaId).single();
  if (e1 || !gravada) return "Não consegui ler a nota gravada.";
  const { data: fornecedor } = gravada.contraparte_id
    ? await supabase.from("fin_contrapartes").select("nome").eq("id", gravada.contraparte_id).maybeSingle()
    : { data: null };
  const documento = `${nota.tipo === "servico" ? "NFS" : "NF"}${nota.numero ? ` ${curto(nota.numero, 30)}` : ""}`;
  const valor = Math.round(nota.valor_total) / 100;
  const { data: compra, error: e2 } = await supabase.rpc("fin_lancar_no_cartao", {
    p_cartao: f.cartao_id,
    p_direcao: "saida",
    p_valor_total: valor,
    p_data_compra: f.data_compra,
    p_parcelas: f.parcelas,
    p_primeira_fatura: f.primeira_fatura ? `${f.primeira_fatura}-01` : null,
    p_descricao: `${documento} · ${fornecedor?.nome ?? gravada.emitente_nome}`.slice(0, 200),
    p_documento: documento,
    p_rateios: [{ conta_id: f.conta_id, valor }],
    p_contraparte: gravada.contraparte_id,
    p_observacoes: null,
    p_competencia: nota.entrada,
  });
  if (e2) return falhaEstoque(e2)!.erro;
  const { data: parcelas, error: e3 } = await supabase.from("fin_lancamentos").select("id").eq("compra_id", compra as string);
  const ligar = (parcelas ?? []).map((l) => ({ empresa_id: empresaId, nota_id: notaId, lancamento_id: l.id }));
  const { error: e4 } = e3 || !ligar.length ? { error: e3 ?? { message: "Compra no cartão sem parcelas." } } : await supabase.from("fin_estoque_notas_lancamentos").insert(ligar);
  if (e4) {
    await supabase.from("fin_lancamentos").update({ situacao: "cancelado", cancelado_em: new Date().toISOString() }).eq("compra_id", compra as string);
    return falhaEstoque(e4)!.erro;
  }
  return null;
}

export async function apagarNota(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_estoque_apagar_nota", { p_id: id });
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

// Perdas de estoque (0027). O custo do insumo é gravado pelo banco na hora de anotar.
export async function lancarPerda(empresaId: string, dados: FormData) {
  const data = texto(dados, "data");
  const item = texto(dados, "item_id");
  const motivo = texto(dados, "motivo");
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da perda." };
  if (!item) return { erro: "Escolha o insumo." };
  if (!MOTIVOS_PERDA.some((m) => m.valor === motivo)) return { erro: "Escolha o motivo." };
  const q = lerNumeroBR(texto(dados, "quantidade"));
  if (q.estado !== "valido" || q.valor <= 0) return { erro: "Informe a quantidade perdida (use vírgula para decimais)." };
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_perdas").insert({
    empresa_id: empresaId,
    data,
    item_id: item,
    quantidade: Math.round(q.valor * 1000) / 1000,
    motivo,
    observacao: curto(texto(dados, "observacao"), 300),
  });
  if (error) return falhaEstoque(error);
  atualizarTelas();
}

export async function apagarPerda(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_estoque_perdas").delete().eq("id", id);
  if (error) return falhaEstoque(error);
  atualizarTelas();
}
