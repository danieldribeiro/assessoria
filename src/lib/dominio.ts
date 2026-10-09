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

export type Papel = "equipe" | "cliente";

export type Perfil = {
  id: string;
  nome: string;
  email: string;
  papel?: Papel;
  cargo?: string | null;
  telefone?: string | null;
  foto_url?: string | null;
};

export const REGIMES_TRIBUTARIOS = ["Simples Nacional", "MEI", "Lucro Presumido", "Lucro Real"] as const;
export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

// Campos de cadastro usados na nota fiscal, iguais para a assessoria e para as empresas.
export const CAMPOS_CADASTRO = [
  "razao_social",
  "cnpj",
  "inscricao_municipal",
  "inscricao_estadual",
  "email",
  "telefone",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "codigo_municipio",
] as const;
export type Cadastro = Record<(typeof CAMPOS_CADASTRO)[number], string | null> & { logo_url: string | null };

export type Assessoria = Cadastro & {
  nome_fantasia: string | null;
  regime_tributario: string | null;
  site: string | null;
};

export function enderecoEmLinhas(c: Partial<Cadastro>) {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(", ");
  const linha1 = [rua, c.complemento].filter(Boolean).join(" · ");
  const cidade = [c.cidade, c.uf].filter(Boolean).join("/");
  const linha2 = [c.bairro, cidade, c.cep && `CEP ${c.cep}`].filter(Boolean).join(" · ");
  return [linha1, linha2].filter(Boolean);
}

// Quem cuida de cada área no diagnóstico: { Financeiro: perfilId, ... }.
export type ResponsaveisArea = Partial<Record<Categoria, string>>;

// O item segue o responsável da sua área, a menos que tenha um próprio.
export function responsavelDoItem(
  item: { responsavel_id: string | null; categoria: string },
  areas: ResponsaveisArea | null | undefined,
) {
  return item.responsavel_id ?? areas?.[item.categoria as Categoria] ?? null;
}

export type Empresa = Cadastro & {
  id: string;
  nome: string;
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
  responsaveis_area: ResponsaveisArea;
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
  publicado_em: string | null; // na central da clínica desde
  recado: string | null; // recado da equipe que abre a central
};

export type Solicitacao = {
  id: string;
  diagnostico_id: string;
  categoria: Categoria;
  responsavel_id: string | null;
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
  responsavel_id: string | null;
  nome: string;
  valor: number | null;
  unidade: string | null;
  periodo: string | null;
  referencia: string | null;
  ref_min: number | null;
  ref_max: number | null;
  tolerancia: number | null;
  significado: string | null;
  cor_manual: Cor | null;
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
  responsavel_id: string | null;
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
  responsavel_id: string | null;
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

// Semáforo da central: cada indicador com faixa vira bom, atenção ou ruim.
export const CORES = ["bom", "atencao", "ruim"] as const;
export type Cor = (typeof CORES)[number];
export const NOME_COR: Record<Cor, string> = { bom: "Está bom", atencao: "Atenção", ruim: "Precisa melhorar" };
export const TOLERANCIA_PADRAO = 20; // % da referência que separa atenção de precisa melhorar

export function corDoIndicador(i: Pick<Indicador, "valor" | "ref_min" | "ref_max" | "tolerancia" | "cor_manual">): Cor | null {
  if (i.cor_manual) return i.cor_manual;
  const { valor } = i;
  const min = i.ref_min === null ? null : Number(i.ref_min);
  const max = i.ref_max === null ? null : Number(i.ref_max);
  if (valor === null || (min === null && max === null)) return null;
  const v = Number(valor);
  if ((min === null || v >= min) && (max === null || v <= max)) return "bom";
  // Com as duas pontas, a folga sai da largura da faixa; com uma só, do próprio valor de referência.
  const base = min !== null && max !== null ? max - min : Math.abs((min ?? max)!);
  const folga = (base * (i.tolerancia ?? TOLERANCIA_PADRAO)) / 100;
  const distancia = min !== null && v < min ? min - v : v - max!;
  return distancia <= folga ? "atencao" : "ruim";
}
