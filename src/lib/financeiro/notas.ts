// Notas de compra (migração 0026): leitura do XML da NF-e (modelo 55) e da NFS-e, e o rateio de serviço e frete.
// Regras puras: rodam no navegador, para a conferência antes de gravar, e nos testes. Valores em centavos.

// ---------------------------------------------------------------------------
// XML: leitor pequeno, só o que a nota precisa (elementos, atributos, texto, CDATA e entidades).
// ---------------------------------------------------------------------------

export type No = { nome: string; atributos: Record<string, string>; filhos: No[]; texto: string };

const ENTIDADES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodificar(v: string) {
  return v.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return ENTIDADES[e.toLowerCase()] ?? "";
  });
}

// Sem prefixo de namespace: "ns2:infNFe" → "infNFe".
const local = (nome: string) => nome.slice(nome.indexOf(":") + 1);

export function lerXml(texto: string): No | null {
  const raiz: No = { nome: "#raiz", atributos: {}, filhos: [], texto: "" };
  const pilha: No[] = [raiz];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const lt = texto.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) pilha[pilha.length - 1].texto += decodificar(texto.slice(i, lt));
    if (texto.startsWith("<!--", lt)) {
      const fim = texto.indexOf("-->", lt + 4);
      if (fim < 0) return null;
      i = fim + 3;
    } else if (texto.startsWith("<![CDATA[", lt)) {
      const fim = texto.indexOf("]]>", lt + 9);
      if (fim < 0) return null;
      pilha[pilha.length - 1].texto += texto.slice(lt + 9, fim);
      i = fim + 3;
    } else if (texto[lt + 1] === "?" || texto[lt + 1] === "!") {
      const fim = texto.indexOf(">", lt);
      if (fim < 0) return null;
      i = fim + 1;
    } else if (texto[lt + 1] === "/") {
      const fim = texto.indexOf(">", lt);
      if (fim < 0) return null;
      const nome = local(texto.slice(lt + 2, fim).trim());
      const topo = pilha.pop();
      if (!topo || topo.nome !== nome || pilha.length === 0) return null;
      i = fim + 1;
    } else {
      // Fim da tag, pulando o ">" que estiver dentro de aspas.
      let fim = lt + 1;
      let aspa: string | null = null;
      for (; fim < n; fim++) {
        const c = texto[fim];
        if (aspa) {
          if (c === aspa) aspa = null;
        } else if (c === '"' || c === "'") aspa = c;
        else if (c === ">") break;
      }
      if (fim >= n) return null;
      let corpo = texto.slice(lt + 1, fim);
      const vazio = corpo.endsWith("/");
      if (vazio) corpo = corpo.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(corpo);
      if (!m) return null;
      const no: No = { nome: local(m[1]), atributos: {}, filhos: [], texto: "" };
      for (const a of corpo.slice(m[1].length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        no.atributos[local(a[1])] = decodificar(a[3] ?? a[4] ?? "");
      }
      pilha[pilha.length - 1].filhos.push(no);
      if (!vazio) pilha.push(no);
      i = fim + 1;
    }
  }
  if (pilha.length !== 1) return null;
  return raiz.filhos.find((f) => f.nome) ?? null;
}

// Primeiro descendente com o nome (busca em profundidade), ou o caminho "a/b/c" a partir do nó.
export function achar(no: No | null | undefined, caminho: string): No | null {
  if (!no) return null;
  let atual: No | null = no;
  for (const parte of caminho.split("/")) {
    atual = atual ? procurar(atual, parte) : null;
  }
  return atual;
}

function procurar(no: No, nome: string): No | null {
  for (const f of no.filhos) {
    if (f.nome === nome) return f;
    const dentro = procurar(f, nome);
    if (dentro) return dentro;
  }
  return null;
}

function todos(no: No | null, nome: string, saida: No[] = []): No[] {
  if (!no) return saida;
  for (const f of no.filhos) {
    if (f.nome === nome) saida.push(f);
    else todos(f, nome, saida);
  }
  return saida;
}

const textoDe = (no: No | null | undefined, caminho: string) => {
  const t = achar(no, caminho)?.texto.trim();
  return t ? t : null;
};

// ---------------------------------------------------------------------------
// Números e datas da nota
// ---------------------------------------------------------------------------

// Valor do XML ("1736.19", "12", "3.5") → centavos, sem ponto flutuante. Mais de 2 casas: arredonda meio para cima.
export function centavosXml(v: string | null): number {
  if (!v) return 0;
  const m = /^\s*(-?)(\d+)(?:\.(\d+))?\s*$/.exec(v);
  if (!m) return 0;
  const dec = (m[3] ?? "").padEnd(3, "0");
  let c = Number(m[2]) * 100 + Number(dec.slice(0, 2));
  if (Number(dec[2]) >= 5) c += 1;
  return m[1] ? -c : c;
}

const numeroXml = (v: string | null) => {
  const x = v ? Number(v) : NaN;
  return Number.isFinite(x) ? x : 0;
};

// "2026-10-14T10:20:00-03:00" ou "2026-10-14" → "2026-10-14" (a data local da nota, sem converter fuso).
export function dataXml(v: string | null) {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim()) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

// Matriz e filiais têm a mesma raiz (8 primeiros dígitos do CNPJ): a GoCoffee cadastrada pela matriz casa com a nota da filial.
export const raizCnpj = (v: string | null | undefined) => {
  const d = soDigitos(v);
  return d.length === 14 ? d.slice(0, 8) : d;
};

// ---------------------------------------------------------------------------
// Nota lida
// ---------------------------------------------------------------------------

export type ItemNota = {
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  valor: number; // centavos: produto − desconto + outras despesas + seguro + IPI + ICMS ST, sem o frete
};

export type Duplicata = { numero: string | null; vencimento: string; valor: number };

export type NotaLida = {
  tipo: "produto" | "servico";
  chave: string | null; // 44 dígitos da NF-e, ou o número/código de verificação da NFS-e
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  saida: string | null; // data de saída da mercadoria, quando vier
  emitente: { documento: string | null; nome: string };
  valorTotal: number; // centavos: o total da nota
  frete: number; // centavos
  itens: ItemNota[];
  duplicatas: Duplicata[];
  informacoes: string | null;
  notaReferida: string | null; // NFS-e: número da NF-e citada no texto ("NF 35720")
  avisos: string[];
};

export type ErroNota = { erro: string };

export function lerNotaFiscal(texto: string): NotaLida | ErroNota {
  const raiz = lerXml(texto.replace(/^﻿/, ""));
  if (!raiz) return { erro: "O arquivo não é um XML válido." };
  const infNFe = achar(raiz, "infNFe");
  if (infNFe) return lerNfe(infNFe);
  const nfse = achar(raiz, "infNFSe") ?? achar(raiz, "InfNfse") ?? achar(raiz, "Nfse") ?? (raiz.nome === "Nfse" ? raiz : null);
  if (nfse) return lerNfse(raiz);
  const tem = (nome: string) => raiz.nome === nome || !!achar(raiz, nome);
  if (tem("resNFe")) return { erro: "Este XML é só o resumo da nota. Baixe o XML completo (com os itens)." };
  if (tem("procEventoNFe") || tem("evento")) return { erro: "Este XML é um evento (cancelamento, carta de correção), não a nota." };
  return { erro: "Não reconheci este XML como NF-e ou NFS-e." };
}

function lerNfe(inf: No): NotaLida | ErroNota {
  const avisos: string[] = [];
  const modelo = textoDe(inf, "ide/mod");
  if (modelo && modelo !== "55") return { erro: `Esta nota é modelo ${modelo} (NFC-e ou outra). Só a NF-e (modelo 55) traz os itens de compra.` };
  const chave = soDigitos(inf.atributos.Id) || null;
  const emit = achar(inf, "emit");
  const itens: ItemNota[] = [];
  let freteItens = 0;
  for (const det of todos(inf, "det")) {
    const prod = achar(det, "prod");
    const imp = achar(det, "imposto");
    const c = (tag: string) => centavosXml(textoDe(prod, tag));
    const ipi = centavosXml(textoDe(achar(imp, "IPI"), "vIPI"));
    const icms = achar(imp, "ICMS");
    const st = centavosXml(textoDe(icms, "vICMSST")) + centavosXml(textoDe(icms, "vFCPST"));
    freteItens += c("vFrete");
    itens.push({
      codigo: textoDe(prod, "cProd"),
      descricao: textoDe(prod, "xProd") ?? "(sem descrição)",
      unidade: textoDe(prod, "uCom"),
      quantidade: numeroXml(textoDe(prod, "qCom")),
      valor: c("vProd") - c("vDesc") + c("vOutro") + c("vSeg") + ipi + st,
    });
  }
  if (itens.length === 0) return { erro: "A nota não tem itens." };
  const tot = achar(inf, "total/ICMSTot");
  const valorTotal = centavosXml(textoDe(tot, "vNF"));
  const frete = tot ? centavosXml(textoDe(tot, "vFrete")) : freteItens;
  const somaItens = itens.reduce((s, i) => s + i.valor, 0);
  const diferenca = valorTotal - somaItens - frete;
  if (valorTotal && Math.abs(diferenca) > 1) {
    avisos.push(`A soma dos itens com o frete difere do total da nota em ${(diferenca / 100).toFixed(2).replace(".", ",")}. Confira antes de gravar.`);
  }
  const duplicatas = todos(achar(inf, "cobr"), "dup")
    .map((d) => ({ numero: textoDe(d, "nDup"), vencimento: dataXml(textoDe(d, "dVenc")) ?? "", valor: centavosXml(textoDe(d, "vDup")) }))
    .filter((d) => d.vencimento && d.valor > 0);
  return {
    tipo: "produto",
    chave: chave && chave.length === 44 ? chave : null,
    numero: textoDe(inf, "ide/nNF"),
    serie: textoDe(inf, "ide/serie"),
    emissao: dataXml(textoDe(inf, "ide/dhEmi") ?? textoDe(inf, "ide/dEmi")),
    saida: dataXml(textoDe(inf, "ide/dhSaiEnt") ?? textoDe(inf, "ide/dSaiEnt")),
    emitente: {
      documento: soDigitos(textoDe(emit, "CNPJ") ?? textoDe(emit, "CPF")) || null,
      nome: textoDe(emit, "xFant") ?? textoDe(emit, "xNome") ?? "(emitente sem nome)",
    },
    valorTotal: valorTotal || somaItens + frete,
    frete,
    itens,
    duplicatas,
    informacoes: textoDe(inf, "infAdic/infCpl"),
    notaReferida: null,
    avisos,
  };
}

// NFS-e: padrão nacional (infNFSe / DPS) ou o ABRASF usado por muitas prefeituras (InfNfse). Só o cabeçalho:
// a nota de serviço não tem itens, o valor dela é rateado entre os itens da NF-e a que se refere.
function lerNfse(raiz: No): NotaLida | ErroNota {
  const nacional = achar(raiz, "infNFSe");
  const prim = (...caminhos: string[]) => {
    for (const c of caminhos) {
      const v = textoDe(raiz, c);
      if (v) return v;
    }
    return null;
  };
  const prestador = nacional ? achar(nacional, "emit") : (achar(raiz, "PrestadorServico") ?? achar(raiz, "Prestador"));
  const documento = soDigitos(textoDe(prestador, "CNPJ") ?? textoDe(prestador, "Cnpj") ?? textoDe(prestador, "CPF") ?? textoDe(prestador, "Cpf")) || null;
  const nome = textoDe(prestador, "xFant") ?? textoDe(prestador, "xNome") ?? textoDe(prestador, "NomeFantasia") ?? textoDe(prestador, "RazaoSocial") ?? "(prestador sem nome)";
  const valorTotal = centavosXml(prim("valores/vLiq", "vLiq", "ValorLiquidoNfse", "valores/vServPrest/vServ", "vServ", "ValorServicos"));
  if (!valorTotal) return { erro: "Não achei o valor da nota de serviço no XML." };
  const numero = prim("nNFSe", "Numero");
  const informacoes = [prim("xInfComp", "OutrasInformacoes", "InformacoesComplementares"), prim("xDescServ", "Discriminacao")].filter(Boolean).join(" · ") || null;
  const emissao = dataXml(prim("dhProc", "dhEmi", "DataEmissao", "dCompet", "Competencia"));
  return {
    tipo: "servico",
    chave: soDigitos(nacional?.atributos.Id) || prim("CodigoVerificacao") || (numero && documento ? `${documento}-${numero}` : null),
    numero,
    serie: null,
    emissao,
    saida: null,
    emitente: { documento, nome },
    valorTotal,
    frete: 0,
    itens: [],
    duplicatas: [],
    informacoes,
    notaReferida: notaReferida(informacoes),
    avisos: [],
  };
}

// "Inf. Cont.: NF 35720 PEDIDO 143713" → "35720". Aceita "NF", "NF-e", "NFe", "Nota Fiscal", com ou sem "nº".
export function notaReferida(texto: string | null) {
  const m = texto ? /\b(?:NF-?e?|Nota\s+Fiscal)\s*(?:n[º°o.]?\s*)?[:\-]?\s*(\d{1,9})\b/i.exec(texto) : null;
  return m ? String(Number(m[1])) : null;
}

// ---------------------------------------------------------------------------
// Rateio
// ---------------------------------------------------------------------------

// Divide `total` centavos na proporção dos pesos, sem perder centavo: cada parte recebe o piso e as sobras vão
// para as maiores frações (empate: a linha que vem antes). Pesos todos zero: divide por igual.
export function ratearCentavos(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const base = pesos.map((p) => Math.max(0, p));
  const soma = base.reduce((s, p) => s + p, 0);
  const usados = soma > 0 ? base : base.map(() => 1);
  const somaUsada = soma > 0 ? soma : base.length;
  const sinal = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const brutos = usados.map((p) => (abs * p) / somaUsada);
  const partes = brutos.map(Math.floor);
  let sobra = abs - partes.reduce((s, p) => s + p, 0);
  const ordem = brutos.map((b, i) => ({ i, f: b - Math.floor(b) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; sobra > 0; k = (k + 1) % ordem.length, sobra--) partes[ordem[k].i] += 1;
  return partes.map((p) => p * sinal);
}

// Custo de cada item de uma nota de produto: o valor dele + a parte do serviço (NFS-e ligada) + a parte do frete.
// O frete e o serviço vão na proporção do valor de cada item.
export function custosDosItens(itens: Pick<ItemNota, "valor">[], servico: number, frete: number) {
  const pesos = itens.map((i) => i.valor);
  const s = ratearCentavos(servico, pesos);
  const f = ratearCentavos(frete, pesos);
  return itens.map((i, k) => ({ servico: s[k], frete: f[k], custo: i.valor + s[k] + f[k] }));
}

// Duplicatas que a nota não trouxe: uma só, no valor total, vencendo na data indicada.
export function duplicatasOuUnica(nota: Pick<NotaLida, "duplicatas" | "valorTotal">, vencimento: string): Duplicata[] {
  return nota.duplicatas.length ? nota.duplicatas : [{ numero: null, vencimento, valor: nota.valorTotal }];
}

// ---------------------------------------------------------------------------
// Nota conferida, do jeito que vai para o banco (fin_estoque_salvar_nota). Valores em centavos.
// ---------------------------------------------------------------------------

export type ItemEnviado = {
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  valor: number;
  item_id: string | null; // insumo; vazio e sem criar_insumo = não é insumo
  fator: number;
  criar_insumo: { nome: string; unidade: string } | null;
};

export type FinanceiroNota =
  | { modo: "criar"; conta_caixa_id: string; conta_id: string; duplicatas: Duplicata[] }
  | { modo: "ligar"; lancamentos: string[] }
  // Compra no cartão de crédito (0011): a nota vira a compra, nas faturas do cartão. primeira_fatura: AAAA-MM ou
  // null (pelo dia de fechamento).
  | { modo: "cartao"; cartao_id: string; conta_id: string; data_compra: string; parcelas: number; primeira_fatura: string | null }
  | { modo: "nenhum" }
  | { modo: "manter" };

export type NotaEnviada = {
  tipo: "produto" | "servico";
  chave: string | null;
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  entrada: string;
  contraparte_id: string | null;
  emitente_documento: string | null;
  emitente_nome: string;
  valor_total: number;
  valor_frete: number;
  nota_produto_id: string | null;
  remessa: string | null;
  origem: "xml" | "manual";
  arquivo_nome: string | null;
  informacoes: string | null;
  observacoes: string | null;
  itens: ItemEnviado[];
  financeiro: FinanceiroNota;
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Confere a nota antes de gravar (no navegador e de novo no servidor). Devolve o motivo, ou null quando está tudo certo.
export function conferirNota(n: NotaEnviada): string | null {
  if (n.tipo !== "produto" && n.tipo !== "servico") return "Tipo de nota inválido.";
  if (!DATA.test(n.entrada ?? "")) return "Informe a data de entrada no estoque.";
  if (n.emissao && !DATA.test(n.emissao)) return "Data de emissão inválida.";
  if (!n.emitente_nome?.trim()) return "Informe o fornecedor.";
  if (!Number.isInteger(n.valor_total) || n.valor_total <= 0) return "Informe o valor total da nota.";
  if (!Number.isInteger(n.valor_frete) || n.valor_frete < 0) return "Frete inválido.";
  if (n.tipo === "produto") {
    if (!n.itens.length) return "A nota de produtos precisa de ao menos um item.";
    for (const [k, i] of n.itens.entries()) {
      const nome = i.descricao?.trim() || `item ${k + 1}`;
      if (!i.descricao?.trim()) return `Informe a descrição do item ${k + 1}.`;
      if (!Number.isFinite(i.quantidade) || i.quantidade <= 0) return `Informe a quantidade de ${nome}.`;
      if (!Number.isInteger(i.valor) || i.valor < 0) return `Valor inválido em ${nome}.`;
      if (!Number.isFinite(i.fator) || i.fator <= 0) return `Informe quanto vem em 1 ${i.unidade ?? "unidade"} de ${nome}.`;
      if (i.criar_insumo && !i.criar_insumo.nome.trim()) return `Informe o nome do insumo novo de ${nome}.`;
    }
    const soma = n.itens.reduce((s, i) => s + i.valor, 0) + n.valor_frete;
    if (Math.abs(soma - n.valor_total) > 100) {
      return `Os itens com o frete somam ${reais(soma)}, mas o total da nota é ${reais(n.valor_total)}. Confira os valores.`;
    }
  } else if (n.itens.length) return "A nota de serviço não tem itens.";
  const f = n.financeiro;
  if (f.modo === "criar") {
    if (!f.conta_caixa_id) return "Escolha a conta de onde sai o pagamento.";
    if (!f.conta_id) return "Escolha a conta do plano (a categoria da compra).";
    if (!f.duplicatas.length) return "Informe ao menos um vencimento.";
    for (const d of f.duplicatas) {
      if (!DATA.test(d.vencimento)) return "Informe a data de cada vencimento.";
      if (!Number.isInteger(d.valor) || d.valor <= 0) return "Informe o valor de cada vencimento.";
    }
    const soma = f.duplicatas.reduce((s, d) => s + d.valor, 0);
    if (soma !== n.valor_total) return `Os vencimentos somam ${reais(soma)}, mas o total da nota é ${reais(n.valor_total)}.`;
  } else if (f.modo === "cartao") {
    if (!f.cartao_id) return "Escolha o cartão.";
    if (!f.conta_id) return "Escolha a conta do plano (a categoria da compra).";
    if (!DATA.test(f.data_compra ?? "")) return "Informe a data da compra no cartão.";
    if (!Number.isInteger(f.parcelas) || f.parcelas < 1 || f.parcelas > 48) return "Parcelas: de 1 a 48.";
    if (f.parcelas > n.valor_total) return "O valor é pequeno demais para tantas parcelas.";
    if (f.primeira_fatura && !/^\d{4}-\d{2}$/.test(f.primeira_fatura)) return "Escolha a fatura da primeira parcela.";
  } else if (f.modo === "ligar") {
    if (!f.lancamentos.length) return "Marque o lançamento que paga esta nota (ou escolha outra opção).";
  } else if (f.modo !== "nenhum" && f.modo !== "manter") return "Escolha o que fazer com o pagamento.";
  return null;
}

// De-para: a chave do item no fornecedor (código, ou a descrição em minúsculas).
export const chaveItemNota = (i: Pick<ItemNota, "codigo" | "descricao">) => (i.codigo?.trim() ? i.codigo.trim() : i.descricao.trim().toLowerCase());
