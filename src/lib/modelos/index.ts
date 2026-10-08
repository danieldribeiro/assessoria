// Listas padrão criadas em cada novo diagnóstico, por segmento.
// Para mudar a metodologia, edite estas listas: os diagnósticos novos já saem com a versão nova.

import type { Categoria } from "@/lib/dominio";

type ModeloSolicitacao = { categoria: Categoria; item: string };
type ModeloIndicador = { categoria: Categoria; nome: string; unidade: string | null };

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
    { categoria: "Financeiro", nome: "Faturamento médio mensal", unidade: "R$" },
    { categoria: "Financeiro", nome: "Despesas fixas médias mensais", unidade: "R$" },
    { categoria: "Financeiro", nome: "Custos variáveis sobre faturamento", unidade: "%" },
    { categoria: "Financeiro", nome: "Margem de contribuição", unidade: "%" },
    { categoria: "Financeiro", nome: "Resultado líquido médio mensal", unidade: "R$" },
    { categoria: "Financeiro", nome: "Margem líquida", unidade: "%" },
    { categoria: "Financeiro", nome: "Ponto de equilíbrio mensal", unidade: "R$" },
    { categoria: "Financeiro", nome: "Inadimplência", unidade: "%" },
    { categoria: "Financeiro", nome: "Endividamento total", unidade: "R$" },
    { categoria: "Financeiro", nome: "Parcelas de dívidas sobre faturamento", unidade: "%" },
    { categoria: "Operacional", nome: "Taxa de ocupação da agenda", unidade: "%" },
    { categoria: "Operacional", nome: "Atendimentos por mês", unidade: "qtd" },
    { categoria: "Operacional", nome: "Taxa de faltas", unidade: "%" },
    { categoria: "Operacional", nome: "Taxa de cancelamentos", unidade: "%" },
    { categoria: "Operacional", nome: "Faturamento por cadeira", unidade: "R$" },
    { categoria: "Operacional", nome: "Custo de materiais sobre faturamento", unidade: "%" },
    { categoria: "Comercial", nome: "Pacientes novos por mês", unidade: "qtd" },
    { categoria: "Comercial", nome: "Taxa de aceitação de orçamentos", unidade: "%" },
    { categoria: "Comercial", nome: "Ticket médio por paciente", unidade: "R$" },
    { categoria: "Comercial", nome: "Pacientes inativos (sem retorno há mais de 12 meses)", unidade: "qtd" },
    { categoria: "Pessoas", nome: "Folha de pagamento sobre faturamento", unidade: "%" },
    { categoria: "Pessoas", nome: "Faturamento por profissional", unidade: "R$" },
  ],
};

const MODELOS: Record<string, Modelo> = { Odontologia: odontologia };

export function modeloDoSegmento(segmento: string): Modelo {
  return MODELOS[segmento] ?? odontologia;
}
