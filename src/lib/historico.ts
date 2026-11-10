// Tela de histórico: junta o histórico geral (0013) com os do financeiro (0007/0008) e traduz para leitura.
// Só funções puras aqui; as consultas ficam na página.

export type Evento = {
  chave: string;
  em: string;
  tabela: string;
  registro_id: string;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  por: string | null;
  empresa_id: string | null;
  diagnostico_id: string | null;
};

export const GRUPOS = {
  diagnosticos: ["diagnosticos", "solicitacoes", "indicadores", "achados", "oportunidades", "acoes"],
  cadastros: ["empresas", "contatos", "acessos_central", "perfis", "assessoria"],
  financeiro: ["fin_lancamentos", "fin_contas"],
  arquivos: ["envios_arquivos", "envios_itens", "envios_dispensas"],
} as const;
export type Grupo = keyof typeof GRUPOS;

export const ROTULO_TABELA: Record<string, string> = {
  empresas: "Empresa",
  contatos: "Contato",
  diagnosticos: "Diagnóstico",
  solicitacoes: "Solicitação",
  indicadores: "Indicador",
  achados: "Achado",
  oportunidades: "Oportunidade",
  acoes: "Ação do plano",
  acessos_central: "Acesso à central",
  perfis: "Pessoa",
  assessoria: "Dados da assessoria",
  fin_lancamentos: "Lançamento",
  fin_contas: "Conta do plano",
  envios_arquivos: "Arquivo enviado",
  envios_itens: "Item da lista de arquivos",
  envios_dispensas: "Arquivo dispensado no mês",
};

export const ROTULO_ACAO: Record<string, string> = {
  criado: "Criado",
  alterado: "Alterado",
  excluido: "Excluído",
  entrou: "Entrou na central",
  realizado: "Marcado como pago/recebido",
  cancelado: "Cancelado",
};

// Linha de fin_lancamentos_eventos ou fin_contas_eventos no formato comum.
export function doFinanceiro(
  tabela: "fin_lancamentos" | "fin_contas",
  e: { id: number; em: string; acao: string; antes: unknown; depois: unknown; por: string | null; empresa_id: string; lancamento_id?: string; conta_id?: string },
): Evento {
  const acao = { criada: "criado", alterada: "alterado", editado: "alterado" }[e.acao] ?? e.acao;
  return {
    chave: `${tabela}:${e.id}`,
    em: e.em,
    tabela,
    registro_id: (e.lancamento_id ?? e.conta_id)!,
    acao,
    antes: (e.antes as Record<string, unknown>) ?? null,
    depois: (e.depois as Record<string, unknown>) ?? null,
    por: e.por,
    empresa_id: e.empresa_id,
    diagnostico_id: null,
  };
}

// Campos técnicos que não dizem nada a quem lê.
const OCULTOS = new Set([
  "id", "empresa_id", "diagnostico_id", "criado_em", "criado_por", "atualizado_em", "ordem", "origem_tipo", "origem_id",
  "compra_id", "fatura_id", "cancelado_em", "origem_modelo", "codigo_municipio",
  "caminho", "enviado_em", "enviado_por", "por", "em",
]);

const ROTULO_CAMPO: Record<string, string> = {
  nome: "Nome", titulo: "Título", descricao: "Descrição", status: "Status", situacao: "Situação", valor: "Valor",
  unidade: "Unidade", categoria: "Categoria", observacao: "Observação", observacoes: "Observações", email: "E-mail",
  telefone: "Telefone", cargo: "Cargo", papel: "Papel", responsavel: "Responsável", responsavel_id: "Responsável",
  prazo: "Prazo", prioridade: "Prioridade", prioridade_manual: "Prioridade manual", nota_impacto: "Impacto",
  nota_urgencia: "Urgência", nota_esforco: "Esforço", ref_min: "Referência mínima", ref_max: "Referência máxima",
  periodo_inicio: "Início do período", periodo_fim: "Fim do período", data_inicio: "Data de início",
  data_prevista: "Data prevista", publicado_em: "Publicado em", recado: "Recado ao cliente", item: "Item",
  acao: "Ação", link: "Link", data_solicitacao: "Pedido em", data_recebimento: "Recebido em", evidencia: "Evidência",
  causa_provavel: "Causa provável", impacto: "Impacto", potencial_impacto: "Potencial de impacto",
  esforco_estimado: "Esforço estimado", situacao_atual: "Situação atual", recomendacoes: "Recomendações",
  ultimo_acesso: "Último acesso", financeiro_na_central: "Financeiro na central", logo_url: "Logo", foto_url: "Foto",
  motivo_nao_calculavel: "Motivo de não calcular", ressalva: "Ressalva", significado: "Significado",
  cor_manual: "Cor manual", tolerancia: "Tolerância", referencia: "Referência", periodo: "Período",
  direcao: "Entrada ou saída", valor_total: "Valor", conta_caixa_id: "Conta de caixa",
  data_competencia: "Competência", data_vencimento: "Vencimento", data_liquidacao: "Pago/recebido em",
  documento: "Documento", juros_nao_segregados: "Juros não separados", contraparte_id: "Fornecedor/cliente",
  rateio: "Rateio", parcela: "Parcela", parcelas: "Parcelas", codigo: "Código", conta_pai_id: "Conta-mãe",
  tipo: "Tipo", natureza: "Natureza", classificacao: "Classificação", comportamento_caixa: "Efeito no caixa",
  dre_secao: "Linha do DRE", custo_cmv: "Custo (CMV)", ativa: "Ativa", segmento: "Segmento", cnpj: "CNPJ",
  razao_social: "Razão social", nome_fantasia: "Nome fantasia", responsaveis_area: "Responsáveis por área",
  versao_metodologia: "Versão da metodologia", pasta_url: "Pasta", achado_id: "Achado", oportunidade_id: "Oportunidade",
  item_id: "Item", competencia: "Mês de referência", nome_arquivo: "Arquivo", tamanho: "Tamanho (bytes)",
  frequencia: "Frequência", dica: "Como tirar o arquivo", ativo: "Na lista", motivo: "Motivo",
};

export function rotuloCampo(campo: string) {
  if (ROTULO_CAMPO[campo]) return ROTULO_CAMPO[campo];
  const t = campo.replace(/_/g, " ");
  return t[0].toUpperCase() + t.slice(1);
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Campos que mudaram entre antes e depois, sem os técnicos. Serve para linhas inteiras e para as que já vêm só com a diferença.
export function camposAlterados(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
  const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  return [...chaves]
    .filter((c) => !OCULTOS.has(c) && !igual(antes?.[c], depois?.[c]))
    .map((c) => ({ campo: c, antes: antes?.[c] ?? null, depois: depois?.[c] ?? null }));
}

// Campos preenchidos de uma linha inteira (criação ou exclusão), sem os técnicos.
export function camposPreenchidos(linha: Record<string, unknown> | null) {
  return Object.entries(linha ?? {})
    .filter(([c, v]) => !OCULTOS.has(c) && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([campo, valor]) => ({ campo, valor }));
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valor legível. `nomes` traduz ids (pessoas, contas, caixas, fornecedores) em nomes.
export function formatarCampo(campo: string, valor: unknown, nomes: Record<string, string> = {}): string {
  if (valor === null || valor === undefined || valor === "") return "vazio";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (campo === "rateio" && Array.isArray(valor)) {
    return valor
      .map((r: { conta_id?: string; valor?: number }) => `${nomes[r.conta_id ?? ""] ?? "conta"}: ${moeda.format(Number(r.valor))}`)
      .join("; ");
  }
  if (campo.endsWith("_url")) return "imagem ou link";
  if (typeof valor === "number") return campo === "valor_total" ? moeda.format(valor) : numero.format(valor);
  if (typeof valor === "string") {
    if (UUID.test(valor)) return nomes[valor] ?? "(registro)";
    if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) return formatarMomento(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split("-").reverse().join("/");
    return valor;
  }
  if (Array.isArray(valor)) return valor.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  return JSON.stringify(valor);
}

const momento = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});
export function formatarMomento(iso: string) {
  return momento.format(new Date(iso)).replace(",", "");
}

const dia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
export function formatarDia(iso: string) {
  return dia.format(new Date(iso));
}
export function chaveDia(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

// Nome do item a partir de uma linha (inteira ou parcial). Vazio quando a linha não traz o campo.
export function nomeDaLinha(tabela: string, l: Record<string, unknown> | null | undefined): string | null {
  if (!l) return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  switch (tabela) {
    case "indicadores":
    case "empresas":
    case "contatos":
    case "perfis":
      return s(l.nome);
    case "achados":
    case "oportunidades":
      return s(l.titulo);
    case "acoes":
      return s(l.acao);
    case "solicitacoes":
      return s(l.item);
    case "acessos_central":
      return s(l.email);
    case "envios_arquivos":
      return s(l.nome_arquivo);
    case "envios_dispensas":
      return typeof l.competencia === "string" ? `Mês ${l.competencia.slice(5, 7)}/${l.competencia.slice(0, 4)}` : null;
    case "assessoria":
      return s(l.nome_fantasia) ?? s(l.razao_social);
    case "fin_contas":
      return s(l.codigo) && s(l.nome) ? `${l.codigo} ${l.nome}` : s(l.nome);
    case "fin_lancamentos": {
      const d = s(l.descricao);
      const v = typeof l.valor_total === "number" ? moeda.format(l.valor_total) : null;
      return [d, v].filter(Boolean).join(" · ") || null;
    }
    case "diagnosticos":
      return null; // a página usa o período do diagnóstico
    default:
      return s(l.nome) ?? s(l.titulo);
  }
}

// Junta as fontes do mais novo para o mais antigo.
export function juntar(...listas: Evento[][]) {
  return listas.flat().sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : a.chave < b.chave ? 1 : -1));
}
