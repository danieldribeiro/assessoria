// Relatório do mês para o cliente (item 9, etapa A): regras puras, sem banco.
// Proposta aprovada em 12/11/2026: https://claude.ai/artifact/AG6DcZQaq1fyKkYbuG8xCC
// Cada bloco tem um motivo para aparecer: sempre, só quando há dado, pelo perfil da empresa, ou futuro (depende do
// sistema odontológico). Por cima disso a equipe liga ou desliga os blocos que não são fixos.
import type { ItemConta } from "@/lib/financeiro/apagar";
import type { ContaPlano, Saldo } from "@/lib/financeiro/dominio";
import { SECOES_DESPESA, type Parcela } from "@/lib/financeiro/painel";
import { somarDiasData, somarMeses } from "@/lib/financeiro/periodo";
import { DIAS_MEDIA } from "@/lib/financeiro/projecao";

export type RegraBloco = "fixo" | "dado" | "perfil" | "futuro";

export type IdBloco =
  | "numeros"
  | "recado"
  | "atencao"
  | "meses"
  | "dre"
  | "grupos"
  | "referencias"
  | "fornecedores"
  | "caixa"
  | "proximos"
  | "projecao"
  | "cartoes"
  | "clinica"
  | "dentistas"
  | "cadeiras"
  | "notas";

export type Bloco = {
  id: IdBloco;
  codigo: string; // B2, B3... (os mesmos da proposta)
  nome: string;
  folha: "Resumo" | "Resultado" | "Caixa" | "Clínica" | "Notas";
  regra: RegraBloco;
  padrao: boolean; // ligado quando a equipe ainda não mexeu
  explicacao: string;
};

export const BLOCOS: Bloco[] = [
  { id: "numeros", codigo: "B2", nome: "O mês em quatro números", folha: "Resumo", regra: "fixo", padrao: true, explicacao: "Sempre aparece." },
  { id: "recado", codigo: "B3", nome: "Recado da assessoria", folha: "Resumo", regra: "dado", padrao: true, explicacao: "Fica de fora se estiver em branco." },
  { id: "atencao", codigo: "B4", nome: "Pontos de atenção", folha: "Resumo", regra: "dado", padrao: true, explicacao: "Some se não houver nenhum." },
  { id: "meses", codigo: "B6", nome: "Últimos 12 meses", folha: "Resumo", regra: "dado", padrao: true, explicacao: "Só com 3 meses ou mais de dados." },
  { id: "dre", codigo: "B5", nome: "Resultado do mês (DRE)", folha: "Resultado", regra: "fixo", padrao: true, explicacao: "Sempre aparece." },
  { id: "grupos", codigo: "B7", nome: "Para onde foi o dinheiro", folha: "Resultado", regra: "dado", padrao: true, explicacao: "Some se não houver despesa no mês." },
  { id: "referencias", codigo: "B17", nome: "Custos x referência da assessoria", folha: "Resultado", regra: "perfil", padrao: true, explicacao: "Só para Odontologia, com faturamento no mês." },
  { id: "fornecedores", codigo: "B8", nome: "Maiores fornecedores", folha: "Resultado", regra: "dado", padrao: false, explicacao: "Só com despesas ligadas a fornecedor." },
  { id: "caixa", codigo: "B9", nome: "Dinheiro em caixa no mês", folha: "Caixa", regra: "fixo", padrao: true, explicacao: "Sempre aparece." },
  { id: "proximos", codigo: "B10", nome: "Próximos 30 dias", folha: "Caixa", regra: "dado", padrao: true, explicacao: "Some se não houver contas previstas." },
  { id: "projecao", codigo: "B11", nome: "Saldo projetado", folha: "Caixa", regra: "dado", padrao: true, explicacao: `Só com ${DIAS_MEDIA} dias de histórico.` },
  { id: "cartoes", codigo: "B12", nome: "Cartões de crédito", folha: "Caixa", regra: "dado", padrao: true, explicacao: "Só se a empresa tiver cartão cadastrado." },
  { id: "clinica", codigo: "B13", nome: "Indicadores da clínica", folha: "Clínica", regra: "futuro", padrao: false, explicacao: "Depende do sistema odontológico." },
  { id: "dentistas", codigo: "B14", nome: "Faturamento por dentista", folha: "Clínica", regra: "futuro", padrao: false, explicacao: "Só com 2 ou mais dentistas. Depende do sistema odontológico." },
  { id: "cadeiras", codigo: "B15", nome: "Faturamento por cadeira", folha: "Clínica", regra: "futuro", padrao: false, explicacao: "Só com 2 ou mais cadeiras. Depende do sistema odontológico." },
  { id: "notas", codigo: "B16", nome: "Notas sobre os números", folha: "Notas", regra: "fixo", padrao: true, explicacao: "Sempre aparece." },
];

// Blocos de clínica só existem para o segmento Odontologia.
export const BLOCOS_CLINICA: IdBloco[] = ["referencias", "clinica", "dentistas", "cadeiras"];

export function blocosDaEmpresa(segmento: string | null) {
  const clinica = (segmento ?? "").trim().toLowerCase() === "odontologia";
  return BLOCOS.filter((b) => clinica || !BLOCOS_CLINICA.includes(b.id));
}

// Mês do relatório (AAAA-MM). Padrão: o mês passado, que é o que se fecha. Mês futuro ou inválido volta ao padrão.
export function mesDoRelatorio(param: string | undefined, hoje: string) {
  const passado = somarMeses(hoje.slice(0, 7), -1);
  if (!param || !/^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return passado;
  return param > hoje.slice(0, 7) ? passado : param;
}

// Os 12 meses que terminam no mês do relatório, como AAAA-MM-01.
export function dozeMeses(mes: string) {
  return Array.from({ length: 12 }, (_, i) => `${somarMeses(mes, i - 11)}-01`);
}

// Meses (AAAA-MM-01) que têm pelo menos uma receita ou despesa da DRE.
export function mesesComDados(lista: Parcela[]) {
  return new Set(lista.filter((p) => p.conta.dre_secao).map((p) => p.mes));
}

// ---------------------------------------------------------------------------
// Despesas por grupo: o subgrupo do plano (ex.: 3.1 Despesas de pessoal) quando a conta está num; senão a própria
// conta. Assim o cliente vê "Pessoal" em vez de salário, férias e FGTS separados.
// ---------------------------------------------------------------------------

export type GrupoDespesa = { id: string; nome: string; centavos: number };

const ehDespesa = (p: Parcela) => (SECOES_DESPESA as readonly number[]).includes(p.conta.dre_secao ?? 0);

export function grupoDaConta(conta: ContaPlano, plano: Map<string, ContaPlano>) {
  const pai = conta.conta_pai_id ? plano.get(conta.conta_pai_id) : undefined;
  return pai && pai.conta_pai_id ? pai : conta;
}

// Despesas por grupo num conjunto de parcelas, em centavos positivos, da maior para a menor.
export function despesasPorGrupo(lista: Parcela[], plano: ContaPlano[]): GrupoDespesa[] {
  const mapa = new Map(plano.map((c) => [c.id, c]));
  const por = new Map<string, GrupoDespesa>();
  for (const p of lista) {
    if (!ehDespesa(p)) continue;
    const g = grupoDaConta(p.conta, mapa);
    const x = por.get(g.id) ?? { id: g.id, nome: g.nome, centavos: 0 };
    x.centavos -= p.centavos;
    por.set(g.id, x);
  }
  return [...por.values()].filter((g) => g.centavos !== 0).sort((a, b) => b.centavos - a.centavos);
}

// Os `maximo` maiores grupos e o resto junto em "Outras".
export function principaisGrupos(grupos: GrupoDespesa[], maximo = 5): GrupoDespesa[] {
  const primeiros = grupos.slice(0, maximo);
  const resto = grupos.slice(maximo);
  if (resto.length) primeiros.push({ id: "outras", nome: "Outras", centavos: resto.reduce((a, g) => a + g.centavos, 0) });
  return primeiros;
}

// ---------------------------------------------------------------------------
// Pontos de atenção (B4)
// ---------------------------------------------------------------------------

// Decisão 3 da proposta: um grupo de despesa conta como "subiu muito" se ficou 10% acima da média dos 3 meses
// anteriores e a diferença passa de R$ 500. Só vale quando os 3 meses anteriores têm dados.
export const ALTA_PERCENTUAL = 0.1;
export const ALTA_MINIMA_CENTAVOS = 500_00;
export const MESES_MEDIA = 3;

export type AltaDespesa = { nome: string; atual: number; media: number; percentual: number };

export function altasDeDespesa(lista: Parcela[], plano: ContaPlano[], mes: string): AltaDespesa[] {
  const anteriores = Array.from({ length: MESES_MEDIA }, (_, i) => `${somarMeses(mes, -(i + 1))}-01`);
  const comDados = mesesComDados(lista);
  if (!anteriores.every((m) => comDados.has(m))) return [];
  const atual = despesasPorGrupo(lista.filter((p) => p.mes === `${mes}-01`), plano);
  const antes = despesasPorGrupo(lista.filter((p) => anteriores.includes(p.mes)), plano);
  const somaAntes = new Map(antes.map((g) => [g.id, g.centavos]));
  const saida: AltaDespesa[] = [];
  for (const g of atual) {
    const media = Math.round((somaAntes.get(g.id) ?? 0) / MESES_MEDIA);
    const diferenca = g.centavos - media;
    if (media <= 0 || diferenca < ALTA_MINIMA_CENTAVOS || g.centavos < media * (1 + ALTA_PERCENTUAL)) continue;
    saida.push({ nome: g.nome, atual: g.centavos / 100, media: media / 100, percentual: diferenca / media });
  }
  return saida.sort((a, b) => b.atual - b.media - (a.atual - a.media));
}

// ---------------------------------------------------------------------------
// Caixa do mês (B9): por conta de caixa, a partir dos saldos acumulados do banco (fin_saldos) no dia anterior ao
// mês e no último dia. Entradas e saídas são só lançamentos realizados; transferências entre contas próprias ficam
// numa coluna à parte. Saldo inicial + entradas − saídas ± transferências = saldo final, sempre.
// ---------------------------------------------------------------------------

export type SaldoAcumulado = Saldo & {
  entradas?: number;
  saidas?: number;
  transferencias_recebidas?: number;
  transferencias_enviadas?: number;
};

export type LinhaCaixa = { id: string; nome: string; inicial: number; entradas: number; saidas: number; transferencias: number; final: number };

const c = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100);

export function caixaDoMes(antes: SaldoAcumulado[], fim: SaldoAcumulado[]): { linhas: LinhaCaixa[]; total: LinhaCaixa } {
  const porId = new Map(antes.map((s) => [s.conta_caixa_id, s]));
  const linhas: LinhaCaixa[] = [];
  for (const f of fim) {
    if (f.saldo === null) continue; // conta que só começa depois do mês
    const a = porId.get(f.conta_caixa_id);
    const comecou = a && a.saldo !== null;
    const inicial = comecou ? c(a!.saldo) : c(f.saldo_inicial);
    const base = (k: "entradas" | "saidas" | "transferencias_recebidas" | "transferencias_enviadas") => (comecou ? c(a![k]) : 0);
    const entradas = c(f.entradas) - base("entradas");
    const saidas = c(f.saidas) - base("saidas");
    const transferencias = c(f.transferencias_recebidas) - base("transferencias_recebidas") - (c(f.transferencias_enviadas) - base("transferencias_enviadas"));
    const final = c(f.saldo);
    // Conta desativada e parada no mês não precisa aparecer.
    if (!f.ativa && inicial === 0 && final === 0 && entradas === 0 && saidas === 0 && transferencias === 0) continue;
    linhas.push({ id: f.conta_caixa_id, nome: f.nome, inicial, entradas, saidas, transferencias, final });
  }
  const soma = (k: keyof Omit<LinhaCaixa, "id" | "nome">) => linhas.reduce((t, l) => t + l[k], 0);
  const emReais = (l: LinhaCaixa): LinhaCaixa => ({
    ...l,
    inicial: l.inicial / 100,
    entradas: l.entradas / 100,
    saidas: l.saidas / 100,
    transferencias: l.transferencias / 100,
    final: l.final / 100,
  });
  const total = { id: "total", nome: "Total", inicial: soma("inicial"), entradas: soma("entradas"), saidas: soma("saidas"), transferencias: soma("transferencias"), final: soma("final") };
  return { linhas: linhas.map(emReais), total: emReais(total) };
}

// ---------------------------------------------------------------------------
// Próximos 30 dias (B10): o que vence de hoje até hoje + 29 dias, e o que já venceu e não foi pago.
// ---------------------------------------------------------------------------

export const DIAS_PROXIMOS = 30;

export type Proximos = { receber: number; pagar: number; vencidas: number; quantasVencidas: number; ate: string };

export function proximos(itens: ItemConta[], hoje: string, dias = DIAS_PROXIMOS): Proximos {
  const ate = somarDiasData(hoje, dias - 1);
  let receber = 0;
  let pagar = 0;
  let vencidas = 0;
  let quantasVencidas = 0;
  for (const i of itens) {
    const v = Math.round(i.valor * 100);
    if (i.vencimento < hoje) {
      if (i.direcao === "saida") {
        vencidas += v;
        quantasVencidas++;
      }
      continue;
    }
    if (i.vencimento > ate) continue;
    if (i.direcao === "saida") pagar += v;
    else receber += v;
  }
  return { receber: receber / 100, pagar: pagar / 100, vencidas: vencidas / 100, quantasVencidas, ate };
}

// ---------------------------------------------------------------------------
// Notas (B16): ressalvas que valem para os números deste relatório.
// ---------------------------------------------------------------------------

// Valor dos lançamentos previstos (ainda não pagos ou recebidos) que entraram na DRE do mês, pela competência.
export function previstosNoMes(lista: Parcela[], mes: string) {
  let receitas = 0;
  let despesas = 0;
  for (const p of lista) {
    if (p.mes !== `${mes}-01` || !p.conta.dre_secao || p.lancamento.situacao !== "previsto") continue;
    if (p.centavos > 0) receitas += p.centavos;
    else despesas -= p.centavos;
  }
  return { receitas: receitas / 100, despesas: despesas / 100 };
}

// ---------------------------------------------------------------------------
// Custos x referência da assessoria (decisão do Daniel em 12/11/2026: limites iguais para todas as empresas de
// Odontologia, em % da receita bruta). As faixas vêm de consultorias odontológicas dos EUA, sem estudo publicado;
// o Daniel as adotou como referência da assessoria. Acima do teto vira alerta.
// Cada conta de despesa entra numa categoria pelo nome dela ou de um grupo acima dela no plano. Pró-labore dos
// sócios fica fora de tudo (a referência é "sem a remuneração do dentista dono").
// ---------------------------------------------------------------------------

export type Referencia = { id: string; nome: string; min: number; max: number; chaves: string[] };

export const REFERENCIAS: Referencia[] = [
  { id: "equipe", nome: "Equipe", min: 0.25, max: 0.28, chaves: ["pessoal", "salari", "encargo", "folha de pagamento", "beneficio"] },
  { id: "ocupacao", nome: "Aluguel e ocupação", min: 0.05, max: 0.07, chaves: ["ocupacao", "aluguel", "condominio", "iptu"] },
  { id: "materiais", nome: "Materiais", min: 0.05, max: 0.06, chaves: ["materia"] },
  { id: "laboratorio", nome: "Laboratório", min: 0.06, max: 0.1, chaves: ["laborat"] },
  { id: "marketing", nome: "Marketing", min: 0.03, max: 0.05, chaves: ["marketing", "publicidade", "propaganda"] },
];
// Custo total: custos e despesas variáveis e despesas operacionais (linhas 5, 6 e 8), sem pró-labore. Deduções e
// tributos sobre o faturamento ficam fora, porque a referência de origem não tem imposto sobre a venda.
export const REFERENCIA_TOTAL = { id: "total", nome: "Custo total (sem pró-labore)", min: 0.6, max: 0.65 };
const SECOES_CUSTO_TOTAL = [5, 6, 8];
const SECOES_CATEGORIA = [5, 6, 8];

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const ehProLabore = (nome: string) => /pro[\s-]?labore/.test(normalizar(nome));

// Nomes da conta e dos grupos acima dela, da própria conta para cima.
function cadeia(conta: ContaPlano, plano: Map<string, ContaPlano>) {
  const nomes: string[] = [];
  let c: ContaPlano | undefined = conta;
  for (let i = 0; c && i < 20; i++) {
    nomes.push(normalizar(c.nome));
    c = c.conta_pai_id ? plano.get(c.conta_pai_id) : undefined;
  }
  return nomes;
}

export function categoriaDaConta(conta: ContaPlano, plano: Map<string, ContaPlano>): string | null {
  const nomes = cadeia(conta, plano);
  if (nomes.some((n) => ehProLabore(n))) return null;
  // A conta decide antes dos grupos: "Aluguel" dentro de "Demais despesas" é ocupação.
  for (const nome of nomes) {
    const ref = REFERENCIAS.find((r) => r.chaves.some((k) => nome.includes(k)));
    if (ref) return ref.id;
  }
  return null;
}

export type SituacaoReferencia = "abaixo" | "dentro" | "acima" | "sem_faturamento";
export type LinhaReferencia = { id: string; nome: string; min: number; max: number; valor: number; percentual: number | null; situacao: SituacaoReferencia };

function situacao(p: number | null, min: number, max: number): SituacaoReferencia {
  if (p === null) return "sem_faturamento";
  // Comparação em décimos de ponto percentual, para 28,0% contar como dentro de "até 28%".
  const x = Math.round(p * 1000);
  if (x > Math.round(max * 1000)) return "acima";
  if (x < Math.round(min * 1000)) return "abaixo";
  return "dentro";
}

export function custosReferencia(lista: Parcela[], plano: ContaPlano[], faturamento: number): { linhas: LinhaReferencia[]; total: LinhaReferencia } {
  const mapa = new Map(plano.map((c) => [c.id, c]));
  const por = new Map<string, number>();
  let total = 0;
  for (const p of lista) {
    const secao = p.conta.dre_secao ?? 0;
    if (ehProLabore(p.conta.nome) || cadeia(p.conta, mapa).some(ehProLabore)) continue;
    if (SECOES_CUSTO_TOTAL.includes(secao)) total -= p.centavos;
    if (!SECOES_CATEGORIA.includes(secao)) continue;
    const cat = categoriaDaConta(p.conta, mapa);
    if (cat) por.set(cat, (por.get(cat) ?? 0) - p.centavos);
  }
  const fat = Math.round(faturamento * 100);
  const linha = (r: { id: string; nome: string; min: number; max: number }, c: number): LinhaReferencia => {
    const percentual = fat > 0 ? c / fat : null;
    return { id: r.id, nome: r.nome, min: r.min, max: r.max, valor: c / 100, percentual, situacao: situacao(percentual, r.min, r.max) };
  };
  return { linhas: REFERENCIAS.map((r) => linha(r, por.get(r.id) ?? 0)), total: linha(REFERENCIA_TOTAL, total) };
}
