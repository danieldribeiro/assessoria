// Listas e tipos do domínio. Os valores precisam bater com os `check` do banco.

export const CATEGORIAS = ["Financeiro", "Operacional", "Comercial", "Pessoas", "Geral"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const STATUS_DIAGNOSTICO = [
  "Coleta",
  "Em análise",
  "Revisão",
  "Apresentação",
  "Concluído",
] as const;
export type StatusDiagnostico = (typeof STATUS_DIAGNOSTICO)[number];

export const STATUS_SOLICITACAO = ["Pendente", "Solicitado", "Recebido", "Não disponível"] as const;
export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number];

export const STATUS_ACHADO = ["Aberto", "Endereçado no plano", "Resolvido", "Descartado"] as const;
export const STATUS_OPORTUNIDADE = ["Aberta", "Endereçada no plano", "Capturada", "Descartada"] as const;

export const STATUS_ACAO = ["A fazer", "Em andamento", "Concluída", "Cancelada"] as const;
export type StatusAcao = (typeof STATUS_ACAO)[number];

export const PRIORIDADES = ["Alta", "Média", "Baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const UNIDADES = ["R$", "%", "qtd", "dias", "horas"] as const;
export const SEGMENTOS = ["Odontologia"] as const;

export const NOTAS = {
  impacto: ["Baixo", "Médio", "Alto"],
  urgencia: ["Pode esperar", "Próximos meses", "Imediata"],
  esforco: ["Baixo", "Médio", "Alto"],
} as const;

export function calcularPrioridade(impacto: number, urgencia: number, esforco: number): Prioridade {
  const pontos = impacto + urgencia + (4 - esforco);
  if (pontos >= 7) return "Alta";
  if (pontos >= 5) return "Média";
  return "Baixa";
}

export const ORDEM_PRIORIDADE: Record<Prioridade, number> = { Alta: 0, Média: 1, Baixa: 2 };

export function porPrioridade<T extends { prioridade: string }>(a: T, b: T) {
  return (
    (ORDEM_PRIORIDADE[a.prioridade as Prioridade] ?? 9) -
    (ORDEM_PRIORIDADE[b.prioridade as Prioridade] ?? 9)
  );
}

export type Perfil = { id: string; nome: string; email: string };

export type Empresa = {
  id: string;
  nome: string;
  cnpj: string | null;
  segmento: string;
  observacoes: string | null;
};

export type Contato = {
  id: string;
  empresa_id: string;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  email: string | null;
  responsavel: boolean;
};

export type Diagnostico = {
  id: string;
  empresa_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  data_inicio: string;
  data_prevista: string | null;
  status: StatusDiagnostico;
  responsavel_id: string | null;
  pasta_url: string | null;
  situacao_atual: string | null;
  recomendacoes: string | null;
  observacoes: string | null;
};

export type Solicitacao = {
  id: string;
  diagnostico_id: string;
  categoria: Categoria;
  item: string;
  status: StatusSolicitacao;
  data_solicitacao: string | null;
  data_recebimento: string | null;
  link: string | null;
  observacao: string | null;
  ordem: number;
};

export type Indicador = {
  id: string;
  diagnostico_id: string;
  categoria: Categoria;
  nome: string;
  valor: number | null;
  unidade: string | null;
  periodo: string | null;
  referencia: string | null;
  observacao: string | null;
  ordem: number;
};

type Priorizavel = {
  nota_impacto: number;
  nota_urgencia: number;
  nota_esforco: number;
  prioridade_manual: Prioridade | null;
  prioridade: Prioridade;
};

export type Achado = Priorizavel & {
  id: string;
  diagnostico_id: string;
  categoria: Categoria;
  titulo: string;
  descricao: string | null;
  evidencia: string | null;
  causa_provavel: string | null;
  impacto: string | null;
  status: (typeof STATUS_ACHADO)[number];
};

export type Oportunidade = Priorizavel & {
  id: string;
  diagnostico_id: string;
  categoria: Categoria;
  titulo: string;
  descricao: string | null;
  potencial_impacto: string | null;
  esforco_estimado: string | null;
  status: (typeof STATUS_OPORTUNIDADE)[number];
};

export type Acao = {
  id: string;
  diagnostico_id: string;
  acao: string;
  achado_id: string | null;
  oportunidade_id: string | null;
  responsavel: string | null;
  prazo: string | null;
  prioridade: Prioridade;
  status: StatusAcao;
  observacoes: string | null;
};
