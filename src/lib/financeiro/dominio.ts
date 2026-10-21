// Listas e tipos do domínio financeiro. Os valores precisam bater com os `check` da migração 0007.

export const TIPOS_CONTA = [
  { valor: "grupo", rotulo: "Grupo (só soma)" },
  { valor: "analitica", rotulo: "Analítica (recebe lançamento)" },
] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number]["valor"];

export type Natureza = "receita" | "despesa" | "ativo" | "passivo" | "patrimonio_liquido";
export type ComportamentoCaixa = "operacional" | "investimento" | "financiamento" | "transferencia_interna" | "sem_caixa";

export const NOME_NATUREZA: Record<Natureza, string> = {
  receita: "Receita",
  despesa: "Despesa",
  ativo: "Ativo",
  passivo: "Passivo",
  patrimonio_liquido: "Patrimônio líquido",
};

export const NOME_CAIXA: Record<ComportamentoCaixa, string> = {
  operacional: "Operacional",
  investimento: "Investimento",
  financiamento: "Financiamento",
  transferencia_interna: "Transferência interna",
  sem_caixa: "Sem caixa",
};

// Matriz de coerência (docs/axis-financeiro/coerencia-classificacoes.md, seção 1). A classificação fixa a
// natureza e a seção da DRE; o comportamento no caixa só pode ser um dos listados.
export const CLASSIFICACOES = {
  receita_bruta: { rotulo: "Receita bruta", natureza: "receita", dre: 1, caixa: ["operacional"] },
  deducao_comercial: { rotulo: "Dedução comercial", natureza: "despesa", dre: 2, caixa: ["sem_caixa", "operacional"] },
  tributo_sobre_faturamento: { rotulo: "Tributo sobre o faturamento", natureza: "despesa", dre: 3, caixa: ["operacional"] },
  custo_direto_variavel: { rotulo: "Custo direto variável", natureza: "despesa", dre: 5, caixa: ["operacional", "sem_caixa"] },
  despesa_variavel: { rotulo: "Despesa variável", natureza: "despesa", dre: 6, caixa: ["operacional"] },
  despesa_operacional: { rotulo: "Despesa operacional", natureza: "despesa", dre: 8, caixa: ["operacional", "sem_caixa"] },
  receita_financeira: { rotulo: "Receita financeira", natureza: "receita", dre: 10, caixa: ["operacional"] },
  despesa_financeira: { rotulo: "Despesa financeira", natureza: "despesa", dre: 10, caixa: ["operacional", "financiamento"] },
  tributo_sobre_lucro: { rotulo: "Tributo sobre o lucro", natureza: "despesa", dre: 11, caixa: ["operacional"] },
  investimento: { rotulo: "Investimento", natureza: "ativo", dre: null, caixa: ["investimento"] },
  financiamento: { rotulo: "Financiamento", natureza: "passivo", dre: null, caixa: ["financiamento"] },
  socios: { rotulo: "Sócios (aportes e distribuições)", natureza: "patrimonio_liquido", dre: null, caixa: ["financiamento"] },
  transferencia: { rotulo: "Transferência", natureza: "ativo", dre: null, caixa: ["transferencia_interna"] },
} as const satisfies Record<string, { rotulo: string; natureza: Natureza; dre: number | null; caixa: readonly ComportamentoCaixa[] }>;
export type Classificacao = keyof typeof CLASSIFICACOES;

export function ehClassificacao(valor: string | null): valor is Classificacao {
  return !!valor && Object.hasOwn(CLASSIFICACOES, valor);
}

// As 12 linhas fixas da DRE v4 (F3). As calculadas não recebem conta.
export const SECOES_DRE = [
  { numero: 1, nome: "Receita bruta", recebe: true },
  { numero: 2, nome: "(−) Deduções comerciais", recebe: true },
  { numero: 3, nome: "(−) Tributos sobre o faturamento / regime", recebe: true },
  { numero: 4, nome: "Receita líquida", recebe: false },
  { numero: 5, nome: "(−) Custos diretos variáveis", recebe: true },
  { numero: 6, nome: "(−) Despesas variáveis", recebe: true },
  { numero: 7, nome: "Margem de contribuição", recebe: false },
  { numero: 8, nome: "(−) Despesas operacionais", recebe: true },
  { numero: 9, nome: "Resultado operacional gerencial", recebe: false },
  { numero: 10, nome: "(+/−) Resultado financeiro", recebe: true },
  { numero: 11, nome: "(−) Tributos sobre o lucro", recebe: true },
  { numero: 12, nome: "Resultado gerencial do período", recebe: false },
] as const;

export function nomeSecaoDre(numero: number | null) {
  return SECOES_DRE.find((s) => s.numero === numero)?.nome ?? null;
}

// Atividades do fluxo de caixa. Transferências internas ficam à parte; "sem caixa" não entra no fluxo.
export const ATIVIDADES = ["operacional", "investimento", "financiamento"] as const;
export type Atividade = (typeof ATIVIDADES)[number];
export const NOME_ATIVIDADE: Record<Atividade, string> = {
  operacional: "Atividades operacionais",
  investimento: "Atividades de investimento",
  financiamento: "Atividades de financiamento",
};

export const TIPOS_CAIXA = [
  { valor: "banco", rotulo: "Conta bancária" },
  { valor: "caixa", rotulo: "Caixa (dinheiro)" },
  { valor: "aplicacao", rotulo: "Aplicação" },
] as const;

export type Direcao = "entrada" | "saida";
export type SituacaoLancamento = "previsto" | "realizado" | "cancelado";

export type ContaPlano = {
  id: string;
  empresa_id: string;
  conta_pai_id: string | null;
  codigo: string;
  nome: string;
  descricao: string | null;
  tipo: TipoConta;
  natureza: Natureza | null;
  classificacao: Classificacao | null;
  comportamento_caixa: ComportamentoCaixa | null;
  dre_secao: number | null;
  custo_cmv: boolean;
  ordem: number;
  ativa: boolean;
};

export type ContaCaixa = {
  id: string;
  empresa_id: string;
  nome: string;
  tipo: "banco" | "caixa" | "aplicacao";
  saldo_inicial: number;
  data_saldo_inicial: string;
  ativa: boolean;
  ordem: number;
};

export type Lancamento = {
  id: string;
  direcao: Direcao;
  valor_total: number;
  conta_caixa_id: string;
  data_competencia: string;
  data_vencimento: string | null;
  data_liquidacao: string | null;
  situacao: SituacaoLancamento;
  descricao: string;
  documento: string | null;
  juros_nao_segregados: boolean;
  // 0009: fornecedor ou cliente e observações. Ficam vazios até a migration ser aplicada.
  contraparte_id?: string | null;
  observacoes?: string | null;
  rateios: { conta_id: string; valor: number }[];
};

export const TIPOS_CONTRAPARTE = [
  { valor: "fornecedor", rotulo: "Fornecedor" },
  { valor: "cliente", rotulo: "Cliente" },
  { valor: "ambos", rotulo: "Fornecedor e cliente" },
] as const;
export type TipoContraparte = (typeof TIPOS_CONTRAPARTE)[number]["valor"];

export type Contraparte = {
  id: string;
  empresa_id: string;
  nome: string;
  tipo: TipoContraparte;
  documento: string | null;
  ativa: boolean;
};

// CPF (11 dígitos) ou CNPJ (14), formatado para leitura.
export function formatarDocumento(documento: string | null) {
  if (!documento) return null;
  if (documento.length === 11) return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (documento.length === 14) return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return documento;
}

// Extratos importados (0010).
export type SituacaoMovimento = "pendente" | "conciliado" | "ignorado";
export type Movimento = {
  id: string;
  extrato_id: string;
  conta_caixa_id: string;
  data: string;
  valor: number;
  tipo_ofx: string | null;
  descricao: string;
  fitid: string | null;
  documento: string | null;
  situacao: SituacaoMovimento;
  lancamento_id: string | null;
  transferencia_id: string | null;
  motivo: string | null;
};
export type Extrato = {
  id: string;
  conta_caixa_id: string;
  arquivo_nome: string;
  arquivo_sha256: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  saldo_banco: number | null;
  saldo_banco_em: string | null;
  lidas: number;
  novas: number;
  duplicadas: number;
  com_erro: number;
  importado_em: string;
};

export type Transferencia = {
  id: string;
  conta_origem_id: string;
  conta_destino_id: string;
  valor: number;
  data: string;
  situacao: "realizado" | "cancelado";
  descricao: string | null;
};

export type Saldo = {
  conta_caixa_id: string;
  nome: string;
  ativa: boolean;
  saldo_inicial: number;
  data_saldo_inicial: string;
  saldo: number | null;
};

// Uma conta analítica pode receber lançamento de caixa se estiver ativa e movimentar caixa.
export function recebeLancamento(c: ContaPlano) {
  return c.tipo === "analitica" && c.ativa && ATIVIDADES.includes(c.comportamento_caixa as Atividade);
}

// Ordena códigos como "1.2" antes de "1.10".
export function compararCodigo(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { numeric: true });
}
