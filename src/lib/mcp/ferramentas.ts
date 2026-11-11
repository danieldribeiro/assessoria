import "server-only";
import { carregarDiagnostico, resumoColeta } from "@/lib/consultas";
import { hoje } from "@/lib/datas";
import { corDoIndicador, NOME_COR } from "@/lib/dominio";
import { agruparContas, diasDeAtraso, limiteContas } from "@/lib/financeiro/apagar";
import {
  carregarBaseFinanceira,
  carregarFaturasPorId,
  carregarLancamentos,
  carregarMovimentos,
  carregarPrevistos,
  carregarSaldos,
} from "@/lib/financeiro/consultas";
import { compararCodigo, NOME_ATIVIDADE, nomeSecaoDre } from "@/lib/financeiro/dominio";
import { diaAnterior, montarFluxo } from "@/lib/financeiro/fluxo";
import { montarDre, parcelas, resumir } from "@/lib/financeiro/painel";
import { diasEntre, montarPeriodo } from "@/lib/financeiro/periodo";
import { ErroDeUso, type Ferramenta } from "@/lib/mcp/protocolo";
import { criarCliente } from "@/lib/supabase/server";

// Ferramentas do conector do Claude. Todas só leem, pelas mesmas consultas das telas e com a sessão de quem fez o
// login: as regras de acesso do banco decidem o que volta. Ver também somente-leitura.ts.

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const DATA = "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$";
const MAX_DIAS = 731;

const empresaId = { type: "string", description: "Id da empresa (veja listar_empresas).", pattern: UUID };
const inicio = { type: "string", description: "Primeiro dia do período, AAAA-MM-DD.", pattern: DATA };
const fim = { type: "string", description: "Último dia do período, AAAA-MM-DD.", pattern: DATA };

// As consultas das telas usam notFound() do Next quando o registro não existe ou a conta não tem acesso.
function naoEncontrado(e: unknown) {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.includes("404");
}

async function comAviso<T>(consulta: () => Promise<T>, aviso: string) {
  try {
    return await consulta();
  } catch (e) {
    if (naoEncontrado(e)) throw new ErroDeUso(aviso);
    throw e;
  }
}

export function lerPeriodoArgs(args: Record<string, unknown>) {
  const de = args.inicio as string;
  const ate = args.fim as string;
  if (new Date(`${de}T00:00:00Z`).toISOString().slice(0, 10) !== de) throw new ErroDeUso("inicio não é uma data válida.");
  if (new Date(`${ate}T00:00:00Z`).toISOString().slice(0, 10) !== ate) throw new ErroDeUso("fim não é uma data válida.");
  if (ate < de) throw new ErroDeUso("fim precisa ser igual ou depois de inicio.");
  if (diasEntre(de, ate) > MAX_DIAS) throw new ErroDeUso("Use um período de até 24 meses.");
  return montarPeriodo(de, ate);
}

const base = (id: string) => comAviso(() => carregarBaseFinanceira(id), "Empresa não encontrada, ou esta conta não tem acesso ao financeiro dela.");

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: "listar_empresas",
    title: "Listar empresas",
    description: "Lista as empresas (clínicas) cadastradas no AXIS que esta conta enxerga, com id, nome, segmento e cidade.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async executar() {
      const supabase = await criarCliente();
      const { data, error } = await supabase.from("empresas").select("id, nome, segmento, cidade, uf").order("nome");
      if (error) throw new Error(error.message);
      return { empresas: data ?? [] };
    },
  },
  {
    name: "listar_diagnosticos",
    title: "Listar diagnósticos",
    description: "Lista os diagnósticos, do mais recente para o mais antigo, com empresa, situação e período analisado. Filtra por empresa se informada.",
    inputSchema: { type: "object", properties: { empresa_id: empresaId }, additionalProperties: false },
    async executar(args) {
      const supabase = await criarCliente();
      let consulta = supabase
        .from("diagnosticos")
        .select("id, empresa_id, status, periodo_inicio, periodo_fim, data_inicio, data_prevista, publicado_em, empresa:empresas(nome)")
        .order("data_inicio", { ascending: false })
        .limit(200);
      if (args.empresa_id) consulta = consulta.eq("empresa_id", args.empresa_id as string);
      const { data, error } = await consulta;
      if (error) throw new Error(error.message);
      return { diagnosticos: data ?? [] };
    },
  },
  {
    name: "ver_diagnostico",
    title: "Ver diagnóstico",
    description:
      "Mostra um diagnóstico completo: situação atual, recomendações, andamento da coleta, indicadores (valor, referência e semáforo), achados, oportunidades e plano de ação.",
    inputSchema: {
      type: "object",
      properties: { diagnostico_id: { type: "string", description: "Id do diagnóstico (veja listar_diagnosticos).", pattern: UUID } },
      required: ["diagnostico_id"],
      additionalProperties: false,
    },
    async executar(args) {
      const d = await comAviso(() => carregarDiagnostico(args.diagnostico_id as string), "Diagnóstico não encontrado, ou esta conta não tem acesso a ele.");
      const prioridade = (p: { prioridade: string }) => p.prioridade;
      return {
        empresa: { id: d.empresa.id, nome: d.empresa.nome, segmento: d.empresa.segmento },
        status: d.status,
        periodo_analisado: { inicio: d.periodo_inicio, fim: d.periodo_fim },
        data_inicio: d.data_inicio,
        data_prevista: d.data_prevista,
        responsavel: d.responsavel?.nome ?? null,
        publicado_na_central_em: d.publicado_em,
        situacao_atual: d.situacao_atual,
        recomendacoes: d.recomendacoes,
        observacoes: d.observacoes,
        coleta: resumoColeta(d.solicitacoes),
        indicadores: d.indicadores.map((i) => {
          const cor = corDoIndicador(i);
          return {
            categoria: i.categoria,
            nome: i.nome,
            valor: i.valor === null ? null : Number(i.valor),
            unidade: i.unidade,
            periodo: i.periodo,
            referencia: i.referencia,
            faixa: { minimo: i.ref_min, maximo: i.ref_max },
            semaforo: cor ? NOME_COR[cor] : null,
            significado: i.significado,
            observacao: i.observacao,
          };
        }),
        achados: d.achados.map((a) => ({
          categoria: a.categoria,
          titulo: a.titulo,
          descricao: a.descricao,
          evidencia: a.evidencia,
          causa_provavel: a.causa_provavel,
          impacto: a.impacto,
          prioridade: prioridade(a),
          status: a.status,
        })),
        oportunidades: d.oportunidades.map((o) => ({
          categoria: o.categoria,
          titulo: o.titulo,
          descricao: o.descricao,
          potencial_impacto: o.potencial_impacto,
          esforco_estimado: o.esforco_estimado,
          prioridade: prioridade(o),
          status: o.status,
        })),
        plano_de_acao: d.acoes.map((a) => ({
          acao: a.acao,
          responsavel: a.responsavel,
          prazo: a.prazo,
          prioridade: a.prioridade,
          status: a.status,
          observacoes: a.observacoes,
        })),
      };
    },
  },
  {
    name: "plano_de_contas",
    title: "Plano de contas",
    description: "Mostra o plano de contas gerencial da empresa (código, nome, linha da DRE), as contas de caixa e os cartões.",
    inputSchema: { type: "object", properties: { empresa_id: empresaId }, required: ["empresa_id"], additionalProperties: false },
    async executar(args) {
      const b = await base(args.empresa_id as string);
      return {
        empresa: b.empresa.nome,
        contas: [...b.contas]
          .sort((x, y) => compararCodigo(x.codigo, y.codigo))
          .map((c) => ({
            codigo: c.codigo,
            nome: c.nome,
            tipo: c.tipo,
            natureza: c.natureza,
            linha_dre: c.dre_secao ? `${c.dre_secao}. ${nomeSecaoDre(c.dre_secao)}` : null,
            ativa: c.ativa,
          })),
        contas_de_caixa: b.caixas.map((c) => ({ nome: c.nome, tipo: c.tipo, ativa: c.ativa })),
        cartoes: b.cartoes.map((c) => ({ nome: c.nome, dia_fechamento: c.dia_fechamento, dia_vencimento: c.dia_vencimento, ativo: c.ativo })),
      };
    },
  },
  {
    name: "saldos_caixa",
    title: "Saldos das contas de caixa",
    description: "Saldo de cada conta de caixa (bancos, caixa, aplicações) no fim de um dia, pelos lançamentos realizados. Sem data, usa hoje.",
    inputSchema: {
      type: "object",
      properties: { empresa_id: empresaId, data: { type: "string", description: "Dia, AAAA-MM-DD. Padrão: hoje.", pattern: DATA } },
      required: ["empresa_id"],
      additionalProperties: false,
    },
    async executar(args) {
      const b = await base(args.empresa_id as string);
      const dia = (args.data as string | undefined) ?? hoje();
      const saldos = await carregarSaldos(b.empresa.id, dia);
      const total = saldos.reduce((a, s) => a + Math.round((s.saldo ?? 0) * 100), 0) / 100;
      return {
        empresa: b.empresa.nome,
        data: dia,
        saldos: saldos.map((s) => ({ conta: s.nome, ativa: s.ativa, saldo: s.saldo })),
        total,
      };
    },
  },
  {
    name: "resultado_dre",
    title: "Resultado (DRE gerencial)",
    description:
      "DRE gerencial por competência no período, mês a mês, com as contas de cada linha, e o resumo (faturamento, despesas, resultado operacional e do período).",
    inputSchema: { type: "object", properties: { empresa_id: empresaId, inicio, fim }, required: ["empresa_id", "inicio", "fim"], additionalProperties: false },
    async executar(args) {
      const p = lerPeriodoArgs(args);
      const b = await base(args.empresa_id as string);
      const lancamentos = await carregarLancamentos(b.empresa.id, p.inicio, p.fim, "competencia");
      const lista = parcelas(lancamentos, b.contas, "competencia", {}, p.inicio, p.fim);
      const dre = montarDre(lista, p.meses, b.contas);
      return {
        empresa: b.empresa.nome,
        periodo: { inicio: p.inicio, fim: p.fim },
        resumo: resumir(lista),
        meses: dre.meses.map((m) => m.slice(0, 7)),
        linhas: dre.linhas.map((l) => ({
          linha: `${l.numero}. ${l.nome}`,
          calculada: l.calculada,
          por_mes: l.valores,
          total: l.total,
          contas: l.contas.map((c) => ({ codigo: c.codigo, nome: c.nome, por_mes: c.valores, total: c.total })),
          subgrupos: l.itens.flatMap((i) =>
            i.tipo === "subgrupo"
              ? [{ codigo: i.codigo, nome: i.nome, por_mes: i.valores, total: i.total, contas: i.contas.map((c) => c.codigo) }]
              : [],
          ),
        })),
        fora_da_dre: dre.foraDaDre,
      };
    },
  },
  {
    name: "fluxo_caixa",
    title: "Fluxo de caixa",
    description:
      "Fluxo de caixa do período por atividade (operacional, investimento, financiamento), mês a mês, com saldo inicial e final. base=realizado (padrão) usa o que já foi pago e recebido; base=previsto usa os vencimentos em aberto.",
    inputSchema: {
      type: "object",
      properties: {
        empresa_id: empresaId,
        inicio,
        fim,
        base: { type: "string", description: "realizado (padrão) ou previsto.", enum: ["realizado", "previsto"] },
      },
      required: ["empresa_id", "inicio", "fim"],
      additionalProperties: false,
    },
    async executar(args) {
      const p = lerPeriodoArgs(args);
      const b = await base(args.empresa_id as string);
      const tipo = (args.base as "realizado" | "previsto" | undefined) ?? "realizado";
      const [movimentos, antes, depois] = await Promise.all([
        carregarMovimentos(b.empresa.id, p.inicio, p.fim, tipo),
        carregarSaldos(b.empresa.id, diaAnterior(p.inicio)),
        carregarSaldos(b.empresa.id, p.fim),
      ]);
      const f = montarFluxo(b.contas, movimentos, p.meses);
      const soma = (s: { saldo: number | null }[]) => s.reduce((a, x) => a + Math.round((x.saldo ?? 0) * 100), 0) / 100;
      return {
        empresa: b.empresa.nome,
        periodo: { inicio: p.inicio, fim: p.fim },
        base: tipo,
        saldo_inicial: soma(antes),
        saldo_final_realizado: soma(depois),
        meses: f.meses.map((m) => m.slice(0, 7)),
        entradas: f.entradas,
        saidas: f.saidas,
        variacao: f.variacao,
        total: f.total,
        atividades: f.secoes.map((s) => ({
          atividade: NOME_ATIVIDADE[s.atividade],
          por_mes: s.valores,
          total: s.total,
          linhas: s.linhas.filter((l) => l.total !== 0 || l.valores.some((v) => v !== 0)).map((l) => ({ codigo: l.codigo, nome: l.nome, grupo: l.grupo, por_mes: l.valores, total: l.total })),
        })),
      };
    },
  },
  {
    name: "listar_lancamentos",
    title: "Listar lançamentos",
    description:
      "Lançamentos do período com valor, datas, situação, contas do plano, conta de caixa e fornecedor/cliente. criterio=movimento (padrão) usa pagamento ou vencimento; criterio=competencia usa a data de competência.",
    inputSchema: {
      type: "object",
      properties: {
        empresa_id: empresaId,
        inicio,
        fim,
        criterio: { type: "string", description: "movimento (padrão) ou competencia.", enum: ["movimento", "competencia"] },
        situacao: { type: "string", description: "Filtra por situação.", enum: ["previsto", "realizado", "cancelado"] },
        direcao: { type: "string", description: "Filtra por entrada ou saida.", enum: ["entrada", "saida"] },
        limite: { type: "integer", description: "Máximo de lançamentos (padrão 200, até 1000)." },
      },
      required: ["empresa_id", "inicio", "fim"],
      additionalProperties: false,
    },
    async executar(args) {
      const p = lerPeriodoArgs(args);
      const b = await base(args.empresa_id as string);
      const limite = Math.min(Math.max(Number(args.limite ?? 200), 1), 1000);
      const todos = await carregarLancamentos(b.empresa.id, p.inicio, p.fim, (args.criterio as "movimento" | "competencia" | undefined) ?? "movimento");
      const filtrados = todos.filter((l) => (!args.situacao || l.situacao === args.situacao) && (!args.direcao || l.direcao === args.direcao));
      const contas = new Map(b.contas.map((c) => [c.id, c]));
      const caixas = new Map(b.caixas.map((c) => [c.id, c.nome]));
      const contrapartes = new Map(b.contrapartes.map((c) => [c.id, c.nome]));
      const somar = (d: string) => filtrados.filter((l) => l.direcao === d && l.situacao !== "cancelado").reduce((a, l) => a + Math.round(l.valor_total * 100), 0) / 100;
      return {
        empresa: b.empresa.nome,
        periodo: { inicio: p.inicio, fim: p.fim },
        quantidade: filtrados.length,
        mostrando: Math.min(limite, filtrados.length),
        total_entradas: somar("entrada"),
        total_saidas: somar("saida"),
        lancamentos: filtrados.slice(0, limite).map((l) => ({
          descricao: l.descricao,
          direcao: l.direcao,
          valor: l.valor_total,
          situacao: l.situacao,
          competencia: l.data_competencia,
          vencimento: l.data_vencimento,
          liquidacao: l.data_liquidacao,
          conta_caixa: caixas.get(l.conta_caixa_id) ?? null,
          fornecedor_cliente: l.contraparte_id ? (contrapartes.get(l.contraparte_id) ?? null) : null,
          documento: l.documento,
          observacoes: l.observacoes ?? null,
          cartao: l.fatura_id ? { parcela: l.parcela ?? null, parcelas: l.parcelas ?? null } : null,
          contas: l.rateios.map((r) => {
            const c = contas.get(r.conta_id);
            return { conta: c ? `${c.codigo} ${c.nome}` : null, valor: r.valor };
          }),
        })),
      };
    },
  },
  {
    name: "contas_a_pagar_receber",
    title: "Contas a pagar e a receber",
    description:
      "Lançamentos previstos agrupados por vencimento: vencidas, próximos 7 dias, até o fim do mês e meses seguintes (até 6). Faturas de cartão abertas entram como uma conta só.",
    inputSchema: { type: "object", properties: { empresa_id: empresaId }, required: ["empresa_id"], additionalProperties: false },
    async executar(args) {
      const b = await base(args.empresa_id as string);
      const dia = hoje();
      const previstos = await carregarPrevistos(b.empresa.id, limiteContas(dia));
      const ids = b.recursos.cartoes ? [...new Set(previstos.map((l) => l.fatura_id).filter((id): id is string => !!id))] : [];
      const faturas = await carregarFaturasPorId(b.empresa.id, ids);
      const cartoes = new Map(b.cartoes.map((c) => [c.id, c.nome]));
      const caixas = new Map(b.caixas.map((c) => [c.id, c.nome]));
      const NOMES: Record<string, string> = { vencidas: "Vencidas", semana: "Próximos 7 dias", mes: "Até o fim do mês" };
      return {
        empresa: b.empresa.nome,
        hoje: dia,
        grupos: agruparContas(previstos, faturas, dia).map((g) => ({
          grupo: NOMES[g.chave] ?? `Mês ${g.chave.slice(4)}`,
          a_pagar: g.pagar,
          a_receber: g.receber,
          contas: g.itens.map((i) => ({
            descricao: i.tipo === "fatura" ? `Fatura ${cartoes.get(i.fatura.cartao_id) ?? "do cartão"}` : i.lancamento.descricao,
            tipo: i.tipo,
            direcao: i.direcao,
            valor: i.valor,
            vencimento: i.vencimento,
            dias_de_atraso: diasDeAtraso(i.vencimento, dia),
            conta_caixa: caixas.get(i.caixa) ?? null,
          })),
        })),
      };
    },
  },
];
