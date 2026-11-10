// Envio de arquivos pelo cliente (migration 0014): lista padrão, meses de referência e situação de cada item.
// Só funções puras aqui; as consultas ficam nas páginas e as gravações em src/server/envios.ts.

export type Frequencia = "unica" | "semanal" | "mensal";

export type ItemEnvio = {
  id: string;
  nome: string;
  dica: string | null;
  frequencia: Frequencia;
  ativo: boolean;
  ordem: number;
};

export type ArquivoEnvio = {
  id: string;
  item_id: string | null;
  competencia: string | null;
  nome_arquivo: string;
  tamanho: number | null;
  enviado_por: string | null;
  enviado_em: string;
};

export type DispensaEnvio = { id: string; item_id: string; competencia: string; motivo: string | null };

// Dia do mês até o qual o cliente manda o que é do mês anterior. O semanal vem toda segunda, com a semana anterior.
export const DIA_LIMITE = 5;
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;
export const EXTENSOES = ["ofx", "pdf", "csv", "xls", "xlsx", "jpg", "jpeg", "png"] as const;
export const ACEITA = EXTENSOES.map((e) => `.${e}`).join(",");

// Lista combinada no kit de entrada de dados. A equipe ativa por clínica e pode ajustar depois.
// Itens que são conversa ou formulário (contas, regime tributário, responsável, telas do sistema odontológico) ficam de fora.
// O relatório mensal do sistema odontológico entra quando o AXIS souber lê-lo (decisão de 10/11/2026).
export const LISTA_PADRAO: { nome: string; dica: string; frequencia: Frequencia }[] = [
  { frequencia: "unica", nome: "Saldo de cada conta no dia anterior ao início", dica: "Print ou PDF do extrato daquele dia, um por conta." },
  { frequencia: "unica", nome: "Extratos dos últimos 3 meses de cada conta", dica: "OFX, ou PDF quando o banco não tiver OFX. Um arquivo por conta." },
  { frequencia: "unica", nome: "Faturas dos últimos 3 meses de cada cartão", dica: "PDF baixado no app do cartão." },
  { frequencia: "unica", nome: "Contratos de empréstimos e parcelamentos", dica: "PDF. Se não houver, avise a assessoria." },
  { frequencia: "unica", nome: "Fornecedores principais e dentistas parceiros", dica: "Planilha simples ou lista, com a regra de repasse de cada parceiro." },

  { frequencia: "semanal", nome: "Extrato de cada conta bancária", dica: "OFX de segunda a domingo da semana anterior, um arquivo por conta. No internet banking: Extrato, Exportar ou Salvar como OFX." },
  { frequencia: "semanal", nome: "Recebimentos da maquininha", dica: "Planilha (CSV ou XLSX) ou PDF da semana anterior. No portal da adquirente: Vendas ou Recebimentos, Exportar." },
  { frequencia: "mensal", nome: "Fatura de cada cartão de crédito", dica: "PDF de cada fatura que fechou no mês. No app do cartão: Fatura, Baixar PDF." },

  { frequencia: "mensal", nome: "Folha, pró-labore e guias de impostos pagas", dica: "PDF recebido do contador." },
  { frequencia: "mensal", nome: "Repasses a dentistas parceiros e laboratórios", dica: "Planilha ou PDF do controle da clínica." },
  { frequencia: "mensal", nome: "Despesas pagas em dinheiro", dica: "Foto do comprovante ou anotação." },
];

// Primeiro dia do mês, no formato do banco.
export function inicioDoMes(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function somarMeses(competencia: string, n: number) {
  const [a, m] = competencia.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

// O mês que o cliente está fechando: sempre o anterior ao de hoje.
export function competenciaPadrao(hoje: string) {
  return somarMeses(inicioDoMes(hoje), -1);
}

// Prazo de um mês: dia 5 do mês seguinte.
export function prazoDoMes(competencia: string) {
  return `${somarMeses(competencia, 1).slice(0, 8)}${String(DIA_LIMITE).padStart(2, "0")}`;
}

// Semanas: de segunda a domingo, identificadas pela segunda-feira. Contas em UTC para não depender do fuso.
function utc(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
export function somarDias(iso: string, dias: number) {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function inicioDaSemana(iso: string) {
  return somarDias(iso, -((utc(iso).getUTCDay() + 6) % 7));
}
export function ehSegunda(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && utc(iso).getUTCDay() === 1;
}

// A semana que o cliente manda nesta segunda: a anterior à de hoje.
export function semanaPadrao(hoje: string) {
  return somarDias(inicioDaSemana(hoje), -7);
}

// Prazo da semana: a segunda-feira seguinte ao domingo que a fecha.
export function prazoDaSemana(segunda: string) {
  return somarDias(segunda, 7);
}

// Últimas semanas fechadas, da mais nova para a mais antiga.
export function semanasRecentes(hoje: string, quantas = 4) {
  const ultima = semanaPadrao(hoje);
  return Array.from({ length: quantas }, (_, i) => somarDias(ultima, -7 * i));
}

// "2026-11-02" → "02/11 a 08/11".
export function nomeDaSemana(segunda: string) {
  const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `${fmt(segunda)} a ${fmt(somarDias(segunda, 6))}`;
}

// Referência de um arquivo ou dispensa vinda de fora: mês (dia 1) ou semana (segunda). Qualquer outra coisa → vazio.
export function lerReferencia(valor: string | null | undefined) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(utc(valor).getTime()) || utc(valor).toISOString().slice(0, 10) !== valor) return null;
  return valor.endsWith("-01") || ehSegunda(valor) ? valor : null;
}

// Meses que o cliente pode escolher ao enviar: o atual e os anteriores, do mais novo para o mais antigo.
export function mesesRecentes(hoje: string, quantos = 6) {
  const atual = inicioDoMes(hoje);
  return Array.from({ length: quantos }, (_, i) => somarMeses(atual, -i));
}

// "2026-10-01" → "outubro de 2026".
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function nomeDoMes(competencia: string) {
  return `${NOMES_MES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`;
}

// ?mes=2026-10 → "2026-10-01"; qualquer outra coisa → vazio.
export function lerMes(valor: string | undefined) {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? `${valor}-01` : null;
}

export function extensaoDe(nome: string) {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

// Motivo para recusar o arquivo antes de enviar, ou vazio quando está tudo certo.
export function problemaNoArquivo(nome: string, tamanho: number) {
  if (!(EXTENSOES as readonly string[]).includes(extensaoDe(nome))) {
    return "Formato não aceito. Envie OFX, PDF, CSV, XLS, XLSX, JPG ou PNG.";
  }
  if (tamanho > TAMANHO_MAXIMO) return "O arquivo passou de 20 MB.";
  if (tamanho === 0) return "O arquivo está vazio.";
  return null;
}

// Caminho no armazenamento: pasta da clínica, um id para nunca colidir e o nome original legível.
export function caminhoDoArquivo(empresaId: string, nome: string, id: string) {
  const ext = extensaoDe(nome);
  const base = nome
    .slice(0, nome.length - (ext ? ext.length + 1 : 0))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${empresaId}/${id}${base ? `-${base}` : ""}.${ext}`;
}

export function formatarTamanho(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export type Situacao = "recebido" | "dispensado" | "pendente" | "atrasado";

// Situação de um item: no mensal, a do mês escolhido; no semanal, a da semana (segunda) passada em `competencia`;
// no "uma vez", basta um arquivo em qualquer mês.
export function situacaoDoItem(
  item: Pick<ItemEnvio, "id" | "frequencia">,
  competencia: string,
  arquivos: Pick<ArquivoEnvio, "item_id" | "competencia">[],
  dispensas: Pick<DispensaEnvio, "item_id" | "competencia">[],
  hoje: string,
): Situacao {
  const doItem = arquivos.filter((a) => a.item_id === item.id);
  if (item.frequencia === "unica") return doItem.length ? "recebido" : "pendente";
  if (doItem.some((a) => a.competencia === competencia)) return "recebido";
  if (dispensas.some((d) => d.item_id === item.id && d.competencia === competencia)) return "dispensado";
  const prazo = item.frequencia === "semanal" ? prazoDaSemana(competencia) : prazoDoMes(competencia);
  return hoje > prazo ? "atrasado" : "pendente";
}

// Arquivos de um item que contam para o mês mostrado.
export function arquivosDoItem<A extends Pick<ArquivoEnvio, "item_id" | "competencia">>(
  item: Pick<ItemEnvio, "id" | "frequencia">,
  competencia: string,
  arquivos: A[],
) {
  return arquivos.filter((a) => a.item_id === item.id && (item.frequencia === "unica" || a.competencia === competencia));
}

export function resumo(situacoes: Situacao[]) {
  const total = situacoes.length;
  const prontos = situacoes.filter((s) => s === "recebido" || s === "dispensado").length;
  return { total, prontos, faltam: total - prontos };
}
