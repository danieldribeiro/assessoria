"use server";

import { CLASSIFICACOES, ehClassificacao, type ComportamentoCaixa } from "@/lib/financeiro/dominio";
import { MAX_MOVIMENTOS } from "@/lib/financeiro/ofx";
import { emCentavos, lerRateio } from "@/lib/financeiro/rateio";
import { criarCliente } from "@/lib/supabase/server";
import { atualizarTelas, exigir, marcado, numeros, texto } from "@/server/util";

// Mensagens das regras do banco (migração 0007) que não trazem texto próprio.
const MENSAGENS: Record<string, string> = {
  fin_contas_codigo_unico: "Já existe uma conta com esse código nesta empresa.",
  fin_contas_nome_entre_irmas: "Já existe uma conta com esse nome no mesmo grupo.",
  fin_contas_coerencia: "Essa combinação de classificação, seção da DRE e caixa não é permitida.",
  fin_contas_caixa_nome_unico: "Já existe uma conta de caixa com esse nome.",
  fin_lancamentos_conta_caixa: "A conta de caixa não é desta empresa.",
  fin_rateios_conta: "A conta do rateio não é desta empresa.",
  fin_transferencias_contas_diferentes: "Escolha contas de origem e destino diferentes.",
  fin_contrapartes_nome_unico: "Já existe um fornecedor ou cliente com esse nome.",
  fin_contrapartes_documento_unico: "Já existe um fornecedor ou cliente com esse CPF/CNPJ.",
  fin_contrapartes_documento_valido: "O CPF precisa ter 11 dígitos e o CNPJ, 14.",
  fin_lancamentos_contraparte: "O fornecedor ou cliente não é desta empresa.",
  fin_lancamentos_origem_unica: "Já existe um lançamento criado a partir desta movimentação. Use Relacionar e escolha esse lançamento.",
  fin_movimentos_lancamento_unico: "Esse lançamento já está conciliado com outra movimentação do extrato.",
  fin_movimentos_transferencia_unica: "Essa transferência já está conciliada com outra movimentação desta conta.",
  fin_movimentos_situacao_coerente: "Informe o motivo para ignorar a movimentação.",
  fin_extratos_sha256_valido: "Não foi possível conferir o arquivo. Selecione-o de novo.",
  fin_cartoes_nome_unico: "Já existe um cartão com esse nome.",
  fin_cartoes_dias_validos: "Os dias de fechamento e de vencimento vão de 1 a 31.",
  fin_movimentos_fatura_unica: "Essa fatura já está conciliada com outra movimentação do extrato.",
  fin_faturas_datas: "O fechamento precisa ser antes do vencimento (ou no mesmo dia).",
};

function falhaFinanceira(error: { message: string } | null) {
  if (!error) return undefined;
  console.error(error);
  const regra = Object.keys(MENSAGENS).find((r) => error.message.includes(r));
  return { erro: regra ? MENSAGENS[regra] : error.message };
}

function data(dados: FormData, campo: string) {
  const valor = texto(dados, campo);
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

// ---------------------------------------------------------------------------
// Plano de contas
// ---------------------------------------------------------------------------

export async function salvarConta(empresaId: string, id: string | null, dados: FormData) {
  const codigo = texto(dados, "codigo");
  const nome = texto(dados, "nome");
  const tipo = texto(dados, "tipo");
  if (!codigo) return { erro: "Informe o código da conta." };
  if (!nome) return { erro: "Informe o nome da conta." };
  if (tipo !== "grupo" && tipo !== "analitica") return { erro: "Escolha se a conta é grupo ou analítica." };

  const comum = {
    conta_pai_id: texto(dados, "conta_pai_id"),
    codigo,
    nome,
    descricao: texto(dados, "descricao"),
    tipo,
    ordem: Number(texto(dados, "ordem") ?? 0) || 0,
  };

  let classificacao;
  if (tipo === "grupo") {
    const secao = Number(texto(dados, "dre_secao"));
    classificacao = { natureza: null, classificacao: null, comportamento_caixa: null, custo_cmv: false, dre_secao: secao || null };
  } else {
    const c = texto(dados, "classificacao");
    if (!ehClassificacao(c)) return { erro: "Escolha a classificação da conta." };
    const regra = CLASSIFICACOES[c];
    const caixa = texto(dados, "comportamento_caixa") as ComportamentoCaixa | null;
    if (!caixa || !(regra.caixa as readonly string[]).includes(caixa)) {
      return { erro: `Para ${regra.rotulo.toLowerCase()}, o caixa precisa ser: ${regra.caixa.join(" ou ")}.` };
    }
    classificacao = {
      natureza: regra.natureza,
      classificacao: c,
      comportamento_caixa: caixa,
      dre_secao: regra.dre,
      custo_cmv: c === "custo_direto_variavel" && marcado(dados, "custo_cmv"),
    };
  }

  const registro = { ...comum, ...classificacao };
  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("fin_contas").update(registro).eq("id", id).eq("empresa_id", empresaId)
    : await supabase.from("fin_contas").insert({ empresa_id: empresaId, ...registro });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function mudarAtivacaoConta(id: string, ativa: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_contas").update({ ativa }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

// ---------------------------------------------------------------------------
// Contas de caixa
// ---------------------------------------------------------------------------

export async function salvarContaCaixa(empresaId: string, id: string | null, dados: FormData) {
  const nome = texto(dados, "nome");
  const tipo = texto(dados, "tipo");
  const dataInicial = data(dados, "data_saldo_inicial");
  if (!nome) return { erro: "Informe o nome da conta de caixa." };
  if (tipo !== "banco" && tipo !== "caixa" && tipo !== "aplicacao") return { erro: "Escolha o tipo da conta de caixa." };
  if (!dataInicial) return { erro: "Informe a data do saldo inicial." };
  const lidos = numeros(dados, { saldo_inicial: "Saldo inicial" });
  if ("erro" in lidos) return { erro: lidos.erro };
  const saldo = lidos.valores.saldo_inicial;
  if (saldo === null) return { erro: "Informe o saldo inicial (pode ser 0)." };
  if (emCentavos(saldo) === null) return { erro: "O saldo inicial tem no máximo duas casas decimais." };

  const registro = { nome, tipo, saldo_inicial: saldo, data_saldo_inicial: dataInicial, ordem: Number(texto(dados, "ordem") ?? 0) || 0 };
  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("fin_contas_caixa").update(registro).eq("id", id).eq("empresa_id", empresaId)
    : await supabase.from("fin_contas_caixa").insert({ empresa_id: empresaId, ...registro });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function mudarAtivacaoCaixa(id: string, ativa: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_contas_caixa").update({ ativa }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------

// Lê o formulário de lançamento (novo ou edição) e devolve os parâmetros das funções do banco.
function lerLancamento(dados: FormData) {
  const direcao = texto(dados, "direcao");
  const situacao = texto(dados, "situacao");
  const contaCaixa = texto(dados, "conta_caixa_id");
  const dataMovimento = data(dados, "data");
  const descricao = texto(dados, "descricao");
  if (direcao !== "entrada" && direcao !== "saida") return { erro: "Escolha entrada ou saída." };
  if (situacao !== "realizado" && situacao !== "previsto") return { erro: "Escolha realizado ou previsto." };
  if (!contaCaixa) return { erro: "Escolha a conta de caixa." };
  if (!dataMovimento) return { erro: situacao === "realizado" ? "Informe a data do pagamento ou recebimento." : "Informe o vencimento." };
  if (!descricao) return { erro: "Informe a descrição." };

  const lidos = numeros(dados, { valor_total: "Valor total" });
  if ("erro" in lidos) return { erro: lidos.erro };
  const total = lidos.valores.valor_total;
  if (total === null) return { erro: "Informe o valor total." };
  const totalCentavos = emCentavos(total);
  if (totalCentavos === null) return { erro: "O valor total tem no máximo duas casas decimais." };
  if (totalCentavos <= 0) return { erro: "O valor total precisa ser maior que zero." };

  const rateio = lerRateio(dados, totalCentavos);
  if ("erro" in rateio) return { erro: rateio.erro };

  return {
    parametros: {
      ...camposNovos(dados),
      p_direcao: direcao,
      p_valor_total: totalCentavos / 100,
      p_conta_caixa: contaCaixa,
      p_situacao: situacao,
      p_competencia: data(dados, "data_competencia") ?? dataMovimento,
      p_vencimento: situacao === "previsto" ? dataMovimento : null,
      p_liquidacao: situacao === "realizado" ? dataMovimento : null,
      p_descricao: descricao,
      p_documento: texto(dados, "documento"),
      p_juros_nao_segregados: marcado(dados, "juros_nao_segregados"),
      p_rateios: rateio.linhas,
    },
  };
}

// Fornecedor ou cliente e observações (0009). Só vão para o banco quando o formulário tem os campos, ou seja,
// quando a migration já foi aplicada.
function camposNovos(dados: FormData) {
  if (!dados.has("contraparte_id")) return {};
  return { p_contraparte: texto(dados, "contraparte_id"), p_observacoes: texto(dados, "observacoes") };
}

export async function lancar(empresaId: string, dados: FormData) {
  const lido = lerLancamento(dados);
  if ("erro" in lido) return { erro: lido.erro };
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_lancar", { p_empresa: empresaId, ...lido.parametros });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

// Edição completa (migração 0008): corrige qualquer campo e o rateio; o banco guarda o antes e o depois.
export async function editarLancamento(id: string, dados: FormData) {
  const lido = lerLancamento(dados);
  if ("erro" in lido) return { erro: lido.erro };
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_editar_lancamento", { p_id: id, ...lido.parametros });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function liquidarLancamento(id: string, dados: FormData) {
  const quando = data(dados, "data_liquidacao");
  if (!quando) return { erro: "Informe a data do pagamento ou recebimento." };
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("fin_lancamentos")
    .update({ situacao: "realizado", data_liquidacao: quando })
    .eq("id", id)
    .eq("situacao", "previsto");
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function cancelarLancamento(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("fin_lancamentos")
    .update({ situacao: "cancelado", cancelado_em: new Date().toISOString() })
    .eq("id", id)
    .neq("situacao", "cancelado");
  exigir(error);
  atualizarTelas();
}

// ---------------------------------------------------------------------------
// Transferências
// ---------------------------------------------------------------------------

export async function transferir(empresaId: string, dados: FormData) {
  const origem = texto(dados, "conta_origem_id");
  const destino = texto(dados, "conta_destino_id");
  const quando = data(dados, "data");
  if (!origem || !destino) return { erro: "Escolha as contas de origem e de destino." };
  if (origem === destino) return { erro: "Escolha contas de origem e destino diferentes." };
  if (!quando) return { erro: "Informe a data da transferência." };
  const lidos = numeros(dados, { valor: "Valor" });
  if ("erro" in lidos) return { erro: lidos.erro };
  const valor = lidos.valores.valor;
  if (valor === null) return { erro: "Informe o valor." };
  const c = emCentavos(valor);
  if (c === null) return { erro: "O valor tem no máximo duas casas decimais." };
  if (c <= 0) return { erro: "O valor precisa ser maior que zero." };

  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_transferencias").insert({
    empresa_id: empresaId,
    conta_origem_id: origem,
    conta_destino_id: destino,
    valor: c / 100,
    data: quando,
    descricao: texto(dados, "descricao"),
  });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function cancelarTransferencia(id: string) {
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("fin_transferencias")
    .update({ situacao: "cancelado", cancelado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("situacao", "realizado");
  exigir(error);
  atualizarTelas();
}

// ---------------------------------------------------------------------------
// Fornecedores e clientes (0009)
// ---------------------------------------------------------------------------

export async function salvarContraparte(empresaId: string, id: string | null, dados: FormData) {
  const nome = texto(dados, "nome");
  const tipo = texto(dados, "tipo");
  const documento = (texto(dados, "documento") ?? "").replace(/\D/g, "") || null;
  if (!nome) return { erro: "Informe o nome." };
  if (tipo !== "fornecedor" && tipo !== "cliente" && tipo !== "ambos") return { erro: "Escolha se é fornecedor, cliente ou os dois." };
  if (documento && documento.length !== 11 && documento.length !== 14) return { erro: "O CPF precisa ter 11 dígitos e o CNPJ, 14." };
  const registro = { nome, tipo, documento };
  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("fin_contrapartes").update(registro).eq("id", id).eq("empresa_id", empresaId)
    : await supabase.from("fin_contrapartes").insert({ empresa_id: empresaId, ...registro });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function mudarAtivacaoContraparte(id: string, ativa: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_contrapartes").update({ ativa }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

// ---------------------------------------------------------------------------
// Extratos OFX e conciliação (0010). O arquivo é lido no navegador (src/lib/financeiro/ofx.ts); aqui chegam só
// as movimentações, conferidas de novo antes de gravar.
// ---------------------------------------------------------------------------

export type MovimentoEnviado = {
  data: string;
  centavos: number;
  tipo_ofx: string | null;
  descricao: string;
  fitid: string | null;
  documento: string | null;
  chave: string;
};

export type DadosExtrato = {
  arquivoNome: string;
  sha256: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  inicio: string | null;
  fim: string | null;
  saldo: number | null; // centavos
  saldoEm: string | null;
  lidas: number;
  comErro: number;
  movimentos: MovimentoEnviado[];
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const curto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

function conferirMovimento(m: MovimentoEnviado) {
  return (
    typeof m === "object" &&
    DATA.test(m.data) &&
    Number.isInteger(m.centavos) &&
    m.centavos !== 0 &&
    Math.abs(m.centavos) < 1e14 &&
    typeof m.descricao === "string" &&
    m.descricao.trim() !== "" &&
    typeof m.chave === "string" &&
    m.chave.length > 0 &&
    m.chave.length <= 400
  );
}

// Prévia: o que já existe nesta conta de caixa (mesma chave ou mesma data, valor e descrição), se o arquivo já
// foi importado antes e se a conta do arquivo é diferente da usada nas importações anteriores.
export async function conferirExtrato(empresaId: string, caixa: string, sha256: string, contaArquivo: string | null, inicio: string, fim: string) {
  if (!DATA.test(inicio) || !DATA.test(fim)) return { erro: "Período do arquivo inválido." };
  const supabase = await criarCliente();
  const [{ data: existentes, error: e1 }, { data: mesmoArquivo, error: e2 }, { data: anteriores, error: e3 }] = await Promise.all([
    supabase
      .from("fin_extrato_movimentos")
      .select("chave, data, valor, descricao")
      .eq("empresa_id", empresaId)
      .eq("conta_caixa_id", caixa)
      .gte("data", inicio)
      .lte("data", fim),
    supabase
      .from("fin_extratos")
      .select("importado_em")
      .eq("empresa_id", empresaId)
      .eq("conta_caixa_id", caixa)
      .eq("arquivo_sha256", sha256.toLowerCase())
      .order("importado_em")
      .limit(1),
    supabase
      .from("fin_extratos")
      .select("conta")
      .eq("empresa_id", empresaId)
      .eq("conta_caixa_id", caixa)
      .not("conta", "is", null)
      .order("importado_em", { ascending: false })
      .limit(1),
  ]);
  const erro = e1 ?? e2 ?? e3;
  if (erro) return falhaFinanceira(erro)!;
  const contaAnterior = anteriores?.[0]?.conta ?? null;
  return {
    existentes: (existentes ?? []).map((m) => ({ ...m, valor: Number(m.valor) })) as { chave: string; data: string; valor: number; descricao: string }[],
    jaImportadoEm: mesmoArquivo?.[0]?.importado_em ?? null,
    contaDiferente: contaArquivo && contaAnterior && contaAnterior !== contaArquivo ? contaAnterior : null,
  };
}

export async function importarExtrato(empresaId: string, caixa: string, d: DadosExtrato) {
  if (!Array.isArray(d.movimentos) || d.movimentos.length > MAX_MOVIMENTOS) return { erro: "Arquivo com movimentações demais." };
  if (!d.movimentos.every(conferirMovimento)) return { erro: "Alguma movimentação veio em formato inválido. Selecione o arquivo de novo." };
  if (!/^[0-9a-f]{64}$/i.test(d.sha256)) return { erro: "Não foi possível conferir o arquivo. Selecione-o de novo." };
  const supabase = await criarCliente();
  const { data, error } = await supabase.rpc("fin_importar_extrato", {
    p_empresa: empresaId,
    p_conta_caixa: caixa,
    p_arquivo_nome: curto(d.arquivoNome, 200) ?? "extrato.ofx",
    p_arquivo_sha256: d.sha256.toLowerCase(),
    p_banco: curto(d.banco, 50),
    p_agencia: curto(d.agencia, 50),
    p_conta: curto(d.conta, 50),
    p_periodo_inicio: d.inicio && DATA.test(d.inicio) ? d.inicio : null,
    p_periodo_fim: d.fim && DATA.test(d.fim) ? d.fim : null,
    p_saldo_banco: Number.isInteger(d.saldo) ? d.saldo! / 100 : null,
    p_saldo_banco_em: d.saldoEm && DATA.test(d.saldoEm) ? d.saldoEm : null,
    p_lidas: Math.max(0, Math.trunc(d.lidas) || 0),
    p_com_erro: Math.max(0, Math.trunc(d.comErro) || 0),
    p_movimentos: d.movimentos.map((m) => ({
      data: m.data,
      valor: m.centavos / 100,
      tipo_ofx: curto(m.tipo_ofx, 20),
      descricao: m.descricao.trim().slice(0, 500),
      fitid: curto(m.fitid, 255),
      documento: curto(m.documento, 100),
      chave: m.chave,
    })),
  });
  if (error) return falhaFinanceira(error)!;
  atualizarTelas();
  const r = data as { extrato_id: string; novas: number; duplicadas: number };
  return { resultado: r };
}

export async function conciliar(movimentoId: string, lancamentoId: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_conciliar", { p_movimento: movimentoId, p_lancamento: lancamentoId });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function conciliarComFormulario(movimentoId: string, dados: FormData) {
  const escolha = texto(dados, "vinculo");
  if (!escolha) return { erro: "Escolha o lançamento ou a transferência." };
  const [tipo, id] = escolha.split(":");
  if (tipo === "lancamento") return conciliar(movimentoId, id);
  if (tipo === "fatura") return conciliarFatura(movimentoId, id);
  if (tipo !== "transferencia") return { erro: "Escolha o lançamento ou a transferência." };
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("fin_extrato_movimentos")
    .update({ situacao: "conciliado", transferencia_id: id })
    .eq("id", movimentoId)
    .eq("situacao", "pendente");
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function lancarDoExtrato(movimentoId: string, dados: FormData) {
  const lidos = numeros(dados, { valor_total: "Valor" });
  if ("erro" in lidos) return { erro: lidos.erro };
  const total = lidos.valores.valor_total === null ? null : emCentavos(lidos.valores.valor_total);
  if (!total || total <= 0) return { erro: "Valor da movimentação inválido." };
  const rateio = lerRateio(dados, total);
  if ("erro" in rateio) return { erro: rateio.erro };
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_lancar_do_extrato", {
    p_movimento: movimentoId,
    p_competencia: data(dados, "data_competencia"),
    p_descricao: texto(dados, "descricao"),
    p_documento: texto(dados, "documento"),
    p_juros_nao_segregados: marcado(dados, "juros_nao_segregados"),
    p_rateios: rateio.linhas,
    p_contraparte: texto(dados, "contraparte_id"),
    p_observacoes: texto(dados, "observacoes"),
  });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function ignorarMovimento(movimentoId: string, dados: FormData) {
  const motivo = texto(dados, "motivo");
  if (!motivo) return { erro: "Informe o motivo para ignorar a movimentação." };
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("fin_extrato_movimentos")
    .update({ situacao: "ignorado", motivo: motivo.slice(0, 300) })
    .eq("id", movimentoId)
    .eq("situacao", "pendente");
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

// Volta a movimentação para pendente. O lançamento continua existindo (se foi criado pelo extrato, cancele-o à parte).
// `comFatura`: a migration 0011 já está aplicada (a coluna fatura_id existe). Desfazer a conciliação com uma
// fatura não desfaz o pagamento dela; isso é feito na aba Cartões.
export async function desfazerConciliacao(movimentoId: string, comFatura = false) {
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("fin_extrato_movimentos")
    .update({ situacao: "pendente", lancamento_id: null, transferencia_id: null, motivo: null, ...(comFatura ? { fatura_id: null } : {}) })
    .eq("id", movimentoId)
    .neq("situacao", "pendente");
  exigir(error);
  atualizarTelas();
}

// ---------------------------------------------------------------------------
// Cartões e faturas (0011). Cada compra é um lançamento dentro de uma fatura; pagar a fatura realiza todas as
// compras na data do pagamento.
// ---------------------------------------------------------------------------

function dia(dados: FormData, campo: string) {
  const n = Number(texto(dados, campo));
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export async function salvarCartao(empresaId: string, id: string | null, dados: FormData) {
  const nome = texto(dados, "nome");
  const caixa = texto(dados, "conta_caixa_id");
  const fechamento = dia(dados, "dia_fechamento");
  const vencimento = dia(dados, "dia_vencimento");
  if (!nome) return { erro: "Informe o nome do cartão." };
  if (!caixa) return { erro: "Escolha a conta de caixa que paga a fatura." };
  if (!fechamento || !vencimento) return { erro: "Informe os dias de fechamento e de vencimento (de 1 a 31)." };
  const registro = { nome, conta_caixa_id: caixa, dia_fechamento: fechamento, dia_vencimento: vencimento };
  const supabase = await criarCliente();
  const { error } = id
    ? await supabase.from("fin_cartoes").update(registro).eq("id", id).eq("empresa_id", empresaId)
    : await supabase.from("fin_cartoes").insert({ empresa_id: empresaId, ...registro });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function mudarAtivacaoCartao(id: string, ativo: boolean) {
  const supabase = await criarCliente();
  const { error } = await supabase.from("fin_cartoes").update({ ativo }).eq("id", id);
  exigir(error);
  atualizarTelas();
}

// Compra (ou estorno) no cartão. Parcelada, vira uma parcela por fatura; todas com a competência da compra.
export async function lancarNoCartao(dados: FormData) {
  const cartao = texto(dados, "cartao_id");
  const direcao = texto(dados, "direcao") ?? "saida";
  const quando = data(dados, "data_compra");
  const descricao = texto(dados, "descricao");
  const parcelas = Number(texto(dados, "parcelas") ?? 1);
  const primeira = texto(dados, "primeira_fatura");
  if (!cartao) return { erro: "Escolha o cartão." };
  if (direcao !== "entrada" && direcao !== "saida") return { erro: "Escolha compra ou estorno." };
  if (!quando) return { erro: "Informe a data da compra." };
  if (!descricao) return { erro: "Informe a descrição." };
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 48) return { erro: "Parcelas: de 1 a 48." };
  if (primeira && !/^\d{4}-\d{2}$/.test(primeira)) return { erro: "Escolha a fatura da primeira parcela." };

  const lidos = numeros(dados, { valor_total: "Valor" });
  if ("erro" in lidos) return { erro: lidos.erro };
  const total = lidos.valores.valor_total;
  if (total === null) return { erro: "Informe o valor." };
  const totalCentavos = emCentavos(total);
  if (totalCentavos === null) return { erro: "O valor tem no máximo duas casas decimais." };
  if (totalCentavos <= 0) return { erro: "O valor precisa ser maior que zero." };
  if (totalCentavos < parcelas) return { erro: "O valor é pequeno demais para tantas parcelas." };
  const rateio = lerRateio(dados, totalCentavos);
  if ("erro" in rateio) return { erro: rateio.erro };

  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_lancar_no_cartao", {
    p_cartao: cartao,
    p_direcao: direcao,
    p_valor_total: totalCentavos / 100,
    p_data_compra: quando,
    p_parcelas: parcelas,
    p_primeira_fatura: primeira ? `${primeira}-01` : null,
    p_descricao: descricao,
    p_documento: texto(dados, "documento"),
    p_rateios: rateio.linhas,
    p_contraparte: texto(dados, "contraparte_id"),
    p_observacoes: texto(dados, "observacoes"),
  });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function pagarFatura(faturaId: string, dados: FormData) {
  const quando = data(dados, "data_pagamento");
  if (!quando) return { erro: "Informe a data do pagamento." };
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_pagar_fatura", { p_fatura: faturaId, p_data: quando });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function desfazerPagamentoFatura(faturaId: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_desfazer_pagamento_fatura", { p_fatura: faturaId });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function ajustarFatura(faturaId: string, dados: FormData) {
  const fechamento = data(dados, "data_fechamento");
  const vencimento = data(dados, "data_vencimento");
  if (!fechamento || !vencimento) return { erro: "Informe o fechamento e o vencimento." };
  if (fechamento > vencimento) return { erro: "O fechamento precisa ser antes do vencimento (ou no mesmo dia)." };
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_ajustar_fatura", { p_fatura: faturaId, p_fechamento: fechamento, p_vencimento: vencimento });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

// Cancela todas as parcelas da compra que estão em faturas abertas. As de faturas pagas ficam (o banco recusa).
export async function cancelarCompra(compraId: string) {
  const supabase = await criarCliente();
  const { error } = await supabase
    .from("fin_lancamentos")
    .update({ situacao: "cancelado", cancelado_em: new Date().toISOString() })
    .eq("compra_id", compraId)
    .eq("situacao", "previsto");
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}

export async function conciliarFatura(movimentoId: string, faturaId: string) {
  const supabase = await criarCliente();
  const { error } = await supabase.rpc("fin_conciliar_fatura", { p_movimento: movimentoId, p_fatura: faturaId });
  if (error) return falhaFinanceira(error);
  atualizarTelas();
}
