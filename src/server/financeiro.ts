"use server";

import { CLASSIFICACOES, ehClassificacao, type ComportamentoCaixa } from "@/lib/financeiro/dominio";
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
