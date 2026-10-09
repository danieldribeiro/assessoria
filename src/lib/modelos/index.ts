// Listas padrão criadas em cada novo diagnóstico, por segmento.
// Para mudar a metodologia, edite estas listas: os diagnósticos novos já saem com a versão nova.

import type { Categoria } from "@/lib/dominio";

type ModeloSolicitacao = { categoria: Categoria; item: string };
// Faixa de referência: ref_min e/ou ref_max alimentam o semáforo da central da clínica.
// `significado` explica o indicador ao dono, em linguagem simples.
type ModeloIndicador = {
  categoria: Categoria;
  nome: string;
  unidade: string | null;
  referencia?: string;
  ref_min?: number;
  ref_max?: number;
  significado?: string;
};

type Modelo = { solicitacoes: ModeloSolicitacao[]; indicadores: ModeloIndicador[] };

const odontologia: Modelo = {
  solicitacoes: [
    { categoria: "Geral", item: "Contrato social e alterações" },
    { categoria: "Geral", item: "Lista de serviços/procedimentos com preços praticados" },
    { categoria: "Geral", item: "Estrutura física: número de cadeiras e salas" },
    { categoria: "Financeiro", item: "Extratos bancários de todas as contas do período" },
    { categoria: "Financeiro", item: "Relatório de faturamento mensal por procedimento" },
    { categoria: "Financeiro", item: "Contas a pagar e despesas do período" },
    { categoria: "Financeiro", item: "Contas a receber e relatório de inadimplência" },
    { categoria: "Financeiro", item: "Taxas de cartão e antecipações" },
    { categoria: "Financeiro", item: "Contratos de empréstimos, financiamentos e parcelamentos" },
    { categoria: "Financeiro", item: "Guias de impostos e regime tributário" },
    { categoria: "Financeiro", item: "Repasses a dentistas parceiros e laboratórios" },
    { categoria: "Operacional", item: "Agenda do período (horários disponíveis e ocupados)" },
    { categoria: "Operacional", item: "Relatório de atendimentos realizados" },
    { categoria: "Operacional", item: "Relatório de cancelamentos e faltas" },
    { categoria: "Operacional", item: "Controle de estoque e compras de materiais" },
    { categoria: "Operacional", item: "Lista de fornecedores principais" },
    { categoria: "Comercial", item: "Relatório de pacientes novos e origem" },
    { categoria: "Comercial", item: "Orçamentos emitidos e aprovados" },
    { categoria: "Comercial", item: "Base de pacientes com data do último atendimento" },
    { categoria: "Comercial", item: "Convênios atendidos e tabela de valores" },
    { categoria: "Pessoas", item: "Folha de pagamento e encargos" },
    { categoria: "Pessoas", item: "Quadro de equipe: funções, jornada e forma de contratação" },
  ],
  indicadores: [
    { categoria: "Financeiro", nome: "Faturamento médio mensal", unidade: "R$", significado: "Quanto a clínica fatura, em média, por mês." },
    { categoria: "Financeiro", nome: "Despesas fixas médias mensais", unidade: "R$" },
    {
      categoria: "Financeiro",
      nome: "Custos variáveis sobre faturamento",
      unidade: "%",
      referencia: "até 40%",
      ref_max: 40,
      significado: "De cada R$ 100 faturados, quanto vai para repasses, materiais, laboratório e taxas de cartão.",
    },
    {
      categoria: "Financeiro",
      nome: "Margem de contribuição",
      unidade: "%",
      referencia: "60% ou mais",
      ref_min: 60,
      significado: "De cada R$ 100 faturados, quanto sobra para pagar as despesas fixas e gerar lucro.",
    },
    { categoria: "Financeiro", nome: "Resultado líquido médio mensal", unidade: "R$" },
    {
      categoria: "Financeiro",
      nome: "Margem líquida",
      unidade: "%",
      referencia: "10% a 15%",
      ref_min: 10,
      significado: "De cada R$ 100 faturados, quanto vira lucro depois de pagar tudo.",
    },
    { categoria: "Financeiro", nome: "Ponto de equilíbrio mensal", unidade: "R$" },
    {
      categoria: "Financeiro",
      nome: "Inadimplência",
      unidade: "%",
      referencia: "até 3%",
      ref_max: 3,
      significado: "Parte do que foi vendido e não foi pago no prazo.",
    },
    { categoria: "Financeiro", nome: "Endividamento total", unidade: "R$" },
    {
      categoria: "Financeiro",
      nome: "Parcelas de dívidas sobre faturamento",
      unidade: "%",
      referencia: "até 5%",
      ref_max: 5,
      significado: "De cada R$ 100 faturados, quanto vai para pagar empréstimos e financiamentos.",
    },
    {
      categoria: "Operacional",
      nome: "Taxa de ocupação da agenda",
      unidade: "%",
      referencia: "85% ou mais",
      ref_min: 85,
      significado: "Parte dos horários disponíveis que foram de fato atendidos.",
    },
    { categoria: "Operacional", nome: "Atendimentos por mês", unidade: "qtd" },
    {
      categoria: "Operacional",
      nome: "Taxa de faltas",
      unidade: "%",
      referencia: "até 10%",
      ref_max: 10,
      significado: "Parte dos pacientes agendados que não apareceram nem avisaram.",
    },
    { categoria: "Operacional", nome: "Taxa de cancelamentos", unidade: "%" },
    { categoria: "Operacional", nome: "Faturamento por cadeira", unidade: "R$" },
    {
      categoria: "Operacional",
      nome: "Custo de materiais sobre faturamento",
      unidade: "%",
      referencia: "6% a 8%",
      ref_max: 8,
      significado: "De cada R$ 100 faturados, quanto é gasto com materiais.",
    },
    { categoria: "Comercial", nome: "Pacientes novos por mês", unidade: "qtd" },
    {
      categoria: "Comercial",
      nome: "Taxa de aceitação de orçamentos",
      unidade: "%",
      referencia: "55% a 65%",
      ref_min: 55,
      significado: "De cada 10 orçamentos apresentados, quantos os pacientes aprovam.",
    },
    { categoria: "Comercial", nome: "Ticket médio por paciente", unidade: "R$" },
    { categoria: "Comercial", nome: "Pacientes inativos (sem retorno há mais de 12 meses)", unidade: "qtd" },
    {
      categoria: "Pessoas",
      nome: "Folha de pagamento sobre faturamento",
      unidade: "%",
      referencia: "até 25%",
      ref_max: 25,
      significado: "De cada R$ 100 faturados, quanto vai para salários e encargos da equipe.",
    },
    { categoria: "Pessoas", nome: "Faturamento por profissional", unidade: "R$" },
  ],
};

const MODELOS: Record<string, Modelo> = { Odontologia: odontologia };

export function modeloDoSegmento(segmento: string): Modelo {
  return MODELOS[segmento] ?? odontologia;
}
