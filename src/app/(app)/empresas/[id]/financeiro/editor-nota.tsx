"use client";

import { FileUp, PenLine, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import { avisar } from "@/components/avisos";
import { EntradaMoeda } from "@/components/entrada-moeda";
import { Botao, Campo, Entrada, Selecao, classeBotao, classeInput, cx } from "@/components/ui";
import { chaveNome } from "@/lib/financeiro/estoque";
import {
  chaveItemNota,
  conferirNota,
  custosDosItens,
  lerNotaFiscal,
  raizCnpj,
  type FinanceiroNota,
  type NotaEnviada,
  type NotaLida,
} from "@/lib/financeiro/notas";
import { moedaParaCampo } from "@/lib/moeda";
import { lerNumeroBR, paraCampoBR } from "@/lib/numeros";
import { salvarNota } from "@/server/estoque";
import { Avisos } from "./importar-estoque";

// Tipos que a aba manda para o editor (só o que ele usa).
export type InsumoNota = { id: string; nome: string; unidade: string };
export type DeParaNotaCliente = { fornecedor: string; chave: string; item_id: string | null; fator: number; ignorar: boolean };
export type ContraparteNota = { id: string; nome: string; documento: string | null };
export type OpcaoNota = { valor: string; rotulo: string };
export type SaidaNota = {
  id: string;
  descricao: string | null;
  documento: string | null;
  contraparte_id: string | null;
  valor: number;
  competencia: string;
  vencimento: string | null;
  situacao: string;
  ligada: boolean; // já ligada a outra nota
};
export type NotaProdutoRef = { id: string; numero: string | null; emitente_nome: string; emitente_documento: string | null; entrada: string };
// Nota já gravada, para editar.
export type NotaGravada = Omit<NotaEnviada, "itens" | "financeiro"> & {
  id: string;
  itens: { codigo: string | null; descricao: string; unidade: string | null; quantidade: number; valor: number; item_id: string | null; fator: number }[];
  lancamentos: string[];
};

type Contexto = {
  empresaId: string;
  insumos: InsumoNota[];
  depara: DeParaNotaCliente[];
  contrapartes: ContraparteNota[];
  contas: OpcaoNota[];
  contaPadrao: string;
  caixas: OpcaoNota[];
  saidas: SaidaNota[];
  notasProduto: NotaProdutoRef[];
};

const DadosNotas = createContext<Contexto | null>(null);
export function ContextoNotas({ valor, children }: { valor: Contexto; children: ReactNode }) {
  return <DadosNotas.Provider value={valor}>{children}</DadosNotas.Provider>;
}

type ItemForm = {
  k: number;
  codigo: string | null;
  descricao: string;
  unidade: string;
  quantidade: string;
  valor: string; // moeda mascarada
  insumo: string; // nome do insumo (existente ou novo)
  unidadeNova: string; // unidade do insumo novo
  ignorar: boolean;
  fator: string;
};
type VencForm = { k: number; vencimento: string; valor: string };
type Form = {
  id: string | null;
  tipo: "produto" | "servico";
  chave: string | null;
  numero: string;
  serie: string | null;
  emissao: string;
  entrada: string;
  emitente_documento: string;
  emitente_nome: string;
  contraparte_id: string;
  total: string;
  frete: string;
  remessa: string;
  nota_produto_id: string;
  notaReferida: string | null;
  origem: "xml" | "manual";
  arquivo: string | null;
  informacoes: string | null;
  observacoes: string;
  avisos: string[];
  itens: ItemForm[];
  modo: FinanceiroNota["modo"];
  conta_id: string;
  caixa_id: string;
  vencimentos: VencForm[];
  ligar: string[];
  temLancamentos: boolean;
};

let proximaChave = 1;
const k = () => proximaChave++;
const real = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const custo4 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const NAO_INSUMO = "Não é insumo";

function centavosDe(texto: string): number | null {
  const l = lerNumeroBR(texto);
  return l.estado === "valido" ? Math.round(l.valor * 100) : l.estado === "vazio" ? 0 : null;
}
const numeroDe = (texto: string) => {
  const l = lerNumeroBR(texto);
  return l.estado === "valido" ? l.valor : NaN;
};

// Lançamentos que parecem pagar a nota: mesmo fornecedor, valor igual (até 1%) ou o número da nota no documento.
function candidatos(f: Form, ctx: Contexto) {
  const total = centavosDe(f.total) ?? 0;
  const pontos = (s: SaidaNota) =>
    (f.contraparte_id && s.contraparte_id === f.contraparte_id ? 2 : 0) +
    (total && Math.abs(s.valor - total) <= Math.max(100, total * 0.01) ? 2 : 0) +
    (f.numero && `${s.documento ?? ""} ${s.descricao ?? ""}`.includes(f.numero) ? 3 : 0);
  return ctx.saidas
    .map((s) => ({ s, p: pontos(s) }))
    .filter((x) => x.p > 0 || f.ligar.includes(x.s.id))
    .sort((a, b) => b.p - a.p || Math.abs(Date.parse(a.s.competencia) - Date.parse(f.entrada)) - Math.abs(Date.parse(b.s.competencia) - Date.parse(f.entrada)))
    .slice(0, 12)
    .map((x) => x.s);
}

function acharContraparte(ctx: Contexto, documento: string | null, nome: string) {
  const d = (documento ?? "").replace(/\D/g, "");
  return (
    (d && ctx.contrapartes.find((c) => c.documento === d)) ||
    (d.length === 14 && ctx.contrapartes.find((c) => c.documento?.length === 14 && raizCnpj(c.documento) === raizCnpj(d))) ||
    ctx.contrapartes.find((c) => chaveNome(c.nome) === chaveNome(nome)) ||
    null
  );
}

// Nota lida do XML → formulário, com o de-para e os lançamentos que parecem pagá-la.
function formDaNota(n: NotaLida, arquivo: string, ctx: Contexto): Form {
  const raiz = raizCnpj(n.emitente.documento);
  const porId = new Map(ctx.insumos.map((i) => [i.id, i]));
  const porNome = new Map(ctx.insumos.map((i) => [chaveNome(i.nome), i]));
  const contraparte = acharContraparte(ctx, n.emitente.documento, n.emitente.nome);
  const entrada = n.saida ?? n.emissao ?? "";
  const f: Form = {
    id: null,
    tipo: n.tipo,
    chave: n.chave,
    numero: n.numero ?? "",
    serie: n.serie,
    emissao: n.emissao ?? "",
    entrada,
    emitente_documento: n.emitente.documento ?? "",
    emitente_nome: n.emitente.nome,
    contraparte_id: contraparte?.id ?? "",
    total: moedaParaCampo(n.valorTotal / 100),
    frete: moedaParaCampo(n.frete / 100),
    remessa: "",
    nota_produto_id: "",
    notaReferida: n.notaReferida,
    origem: "xml",
    arquivo,
    informacoes: n.informacoes,
    observacoes: "",
    avisos: n.avisos,
    itens: n.itens.map((i) => {
      const dp = ctx.depara.find((d) => d.fornecedor === raiz && d.chave === chaveItemNota(i));
      const insumo = dp?.item_id ? porId.get(dp.item_id) : porNome.get(chaveNome(i.descricao));
      return {
        k: k(),
        codigo: i.codigo,
        descricao: i.descricao,
        unidade: i.unidade ?? "",
        quantidade: paraCampoBR(i.quantidade),
        valor: moedaParaCampo(i.valor / 100),
        insumo: insumo?.nome ?? "",
        unidadeNova: (i.unidade ?? "un").toLowerCase(),
        ignorar: !!dp?.ignorar,
        fator: paraCampoBR(dp && !dp.ignorar ? dp.fator : 1),
      };
    }),
    modo: "criar",
    conta_id: ctx.contaPadrao,
    caixa_id: ctx.caixas[0]?.valor ?? "",
    vencimentos: n.duplicatas.map((d) => ({ k: k(), vencimento: d.vencimento, valor: moedaParaCampo(d.valor / 100) })),
    ligar: [],
    temLancamentos: false,
  };
  if (!f.vencimentos.length) f.vencimentos = [{ k: k(), vencimento: "", valor: f.total }];
  // NFS-e: a NF-e citada no texto, do mesmo fornecedor (pela raiz do CNPJ).
  if (n.tipo === "servico" && n.notaReferida) {
    const ref = ctx.notasProduto.find((p) => p.numero && String(Number(p.numero)) === n.notaReferida && (!raiz || raizCnpj(p.emitente_documento) === raiz));
    if (ref) {
      f.nota_produto_id = ref.id;
      if (!f.entrada) f.entrada = ref.entrada;
    }
  }
  // Já existe um lançamento que paga a nota (ex.: as compras de outubro lançadas antes): ligar em vez de criar outro.
  const provaveis = candidatos(f, ctx).filter((s) => !s.ligada && Math.abs(s.valor - n.valorTotal) <= 1);
  const mesmo = provaveis.find((s) => s.contraparte_id && s.contraparte_id === f.contraparte_id) ?? (provaveis.length === 1 ? provaveis[0] : undefined);
  if (mesmo) {
    f.modo = "ligar";
    f.ligar = [mesmo.id];
  }
  return f;
}

function formVazio(ctx: Contexto): Form {
  return {
    id: null,
    tipo: "produto",
    chave: null,
    numero: "",
    serie: null,
    emissao: "",
    entrada: "",
    emitente_documento: "",
    emitente_nome: "",
    contraparte_id: "",
    total: "",
    frete: "",
    remessa: "",
    nota_produto_id: "",
    notaReferida: null,
    origem: "manual",
    arquivo: null,
    informacoes: null,
    observacoes: "",
    avisos: [],
    itens: [itemVazio()],
    modo: "criar",
    conta_id: ctx.contaPadrao,
    caixa_id: ctx.caixas[0]?.valor ?? "",
    vencimentos: [{ k: k(), vencimento: "", valor: "" }],
    ligar: [],
    temLancamentos: false,
  };
}
const itemVazio = (): ItemForm => ({ k: k(), codigo: null, descricao: "", unidade: "", quantidade: "", valor: "", insumo: "", unidadeNova: "un", ignorar: false, fator: "1" });

function formDaGravada(n: NotaGravada, ctx: Contexto): Form {
  const porId = new Map(ctx.insumos.map((i) => [i.id, i]));
  return {
    ...formVazio(ctx),
    id: n.id,
    tipo: n.tipo,
    chave: n.chave,
    numero: n.numero ?? "",
    serie: n.serie,
    emissao: n.emissao ?? "",
    entrada: n.entrada,
    emitente_documento: n.emitente_documento ?? "",
    emitente_nome: n.emitente_nome,
    contraparte_id: n.contraparte_id ?? "",
    total: moedaParaCampo(n.valor_total / 100),
    frete: moedaParaCampo(n.valor_frete / 100),
    remessa: n.remessa ?? "",
    nota_produto_id: n.nota_produto_id ?? "",
    origem: n.origem,
    arquivo: n.arquivo_nome,
    informacoes: n.informacoes,
    observacoes: n.observacoes ?? "",
    itens: n.itens.map((i) => ({
      k: k(),
      codigo: i.codigo,
      descricao: i.descricao,
      unidade: i.unidade ?? "",
      quantidade: paraCampoBR(i.quantidade),
      valor: moedaParaCampo(i.valor / 100),
      insumo: i.item_id ? (porId.get(i.item_id)?.nome ?? "") : "",
      unidadeNova: (i.unidade ?? "un").toLowerCase(),
      ignorar: !i.item_id,
      fator: paraCampoBR(i.fator),
    })),
    modo: "manter",
    ligar: n.lancamentos,
    temLancamentos: n.lancamentos.length > 0,
  };
}

// Formulário → o que vai para o servidor. Devolve o motivo quando falta algo.
function montar(f: Form, ctx: Contexto): NotaEnviada | string {
  const porNome = new Map(ctx.insumos.map((i) => [chaveNome(i.nome), i]));
  const total = centavosDe(f.total);
  const frete = centavosDe(f.frete);
  if (total === null) return "Valor total inválido.";
  if (frete === null) return "Frete inválido.";
  const itens: NotaEnviada["itens"] = [];
  if (f.tipo === "produto") {
    for (const i of f.itens) {
      if (!i.descricao.trim() && !i.quantidade.trim() && !i.valor.trim()) continue;
      const valor = centavosDe(i.valor);
      if (valor === null) return `Valor inválido em ${i.descricao || "um item"}.`;
      const nome = i.insumo.trim();
      if (!i.ignorar && !nome) return `Escolha o insumo de "${i.descricao}" ou marque que não é insumo.`;
      const existente = nome ? porNome.get(chaveNome(nome)) : undefined;
      itens.push({
        codigo: i.codigo,
        descricao: i.descricao.trim(),
        unidade: i.unidade.trim() || null,
        quantidade: numeroDe(i.quantidade),
        valor,
        item_id: i.ignorar ? null : (existente?.id ?? null),
        fator: i.ignorar ? 1 : numeroDe(i.fator),
        criar_insumo: !i.ignorar && !existente ? { nome, unidade: i.unidadeNova.trim() || "un" } : null,
      });
    }
  }
  let financeiro: FinanceiroNota;
  if (f.modo === "criar") {
    const duplicatas = [];
    for (const v of f.vencimentos) {
      const valor = centavosDe(v.valor);
      if (valor === null) return "Valor de vencimento inválido.";
      duplicatas.push({ numero: null, vencimento: v.vencimento, valor });
    }
    financeiro = { modo: "criar", conta_caixa_id: f.caixa_id, conta_id: f.conta_id, duplicatas };
  } else if (f.modo === "ligar") financeiro = { modo: "ligar", lancamentos: f.ligar };
  else financeiro = { modo: f.modo };
  const nota: NotaEnviada = {
    tipo: f.tipo,
    chave: f.chave,
    numero: f.numero.trim() || null,
    serie: f.serie,
    emissao: f.emissao || null,
    entrada: f.entrada,
    contraparte_id: f.contraparte_id || null,
    emitente_documento: f.emitente_documento.replace(/\D/g, "") || null,
    emitente_nome: f.emitente_nome.trim() || ctx.contrapartes.find((c) => c.id === f.contraparte_id)?.nome || "",
    valor_total: total,
    valor_frete: f.tipo === "produto" ? frete : 0,
    nota_produto_id: f.tipo === "servico" ? f.nota_produto_id || null : null,
    remessa: f.tipo === "produto" ? f.remessa.trim() || null : null,
    origem: f.origem,
    arquivo_nome: f.arquivo,
    informacoes: f.informacoes,
    observacoes: f.observacoes.trim() || null,
    itens,
    financeiro,
  };
  return conferirNota(nota) ?? nota;
}

// ---------------------------------------------------------------------------

type Modo = { tipo: "xml" } | { tipo: "manual" } | { tipo: "editar"; nota: NotaGravada };

export function EditorNotas({ modo }: { modo: Modo }) {
  const ctx = useContext(DadosNotas)!;
  const dialogo = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [fila, setFila] = useState<Form[]>([]);
  const [lidas, setLidas] = useState<{ total: number; erros: string[] }>({ total: 0, erros: [] });
  const [gravadas, setGravadas] = useState<NotaProdutoRef[]>([]);
  const [erro, setErro] = useState<string>();
  const [chaveArquivo, setChaveArquivo] = useState(0);
  const [ocupado, iniciar] = useTransition();
  const f = fila[0];
  const contexto: Contexto = { ...ctx, notasProduto: [...gravadas, ...ctx.notasProduto] };

  function abrir() {
    setErro(undefined);
    setGravadas([]);
    setLidas({ total: 0, erros: [] });
    setChaveArquivo((c) => c + 1);
    setFila(modo.tipo === "manual" ? [formVazio(ctx)] : modo.tipo === "editar" ? [formDaGravada(modo.nota, ctx)] : []);
    dialogo.current?.showModal();
  }

  async function ler(arquivos: FileList | null) {
    setErro(undefined);
    const erros: string[] = [];
    const notas: Form[] = [];
    for (const a of Array.from(arquivos ?? []).slice(0, 30)) {
      if (a.size > 5 * 1024 * 1024) {
        erros.push(`${a.name}: arquivo grande demais.`);
        continue;
      }
      const lida = lerNotaFiscal(await a.text());
      if ("erro" in lida) erros.push(`${a.name}: ${lida.erro}`);
      else notas.push(formDaNota(lida, a.name, contexto));
    }
    // Produtos antes dos serviços: a NFS-e se liga à NF-e gravada logo antes.
    notas.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "produto" ? -1 : 1));
    setLidas({ total: notas.length, erros });
    setFila(notas);
  }

  const mudar = (m: Partial<Form>) => setFila((fs) => [{ ...fs[0], ...m }, ...fs.slice(1)]);
  const mudarItem = (chave: number, m: Partial<ItemForm>) => mudar({ itens: f.itens.map((i) => (i.k === chave ? { ...i, ...m } : i)) });
  const pular = () => setFila((fs) => fs.slice(1));

  function gravar() {
    setErro(undefined);
    const nota = montar(f, contexto);
    if (typeof nota === "string") return setErro(nota);
    iniciar(async () => {
      const r = await salvarNota(ctx.empresaId, f.id, nota);
      if ("erro" in r) return setErro(r.erro);
      avisar(f.id ? "Nota salva" : `Nota ${nota.numero ?? ""} lançada`);
      if (nota.tipo === "produto") {
        setGravadas((g) => [{ id: r.id, numero: nota.numero, emitente_nome: nota.emitente_nome, emitente_documento: nota.emitente_documento, entrada: nota.entrada }, ...g]);
        // A NFS-e que cita esta nota, mais adiante na fila, já se liga a ela.
        setFila((fs) =>
          fs.slice(1).map((x) =>
            x.tipo === "servico" && !x.nota_produto_id && x.notaReferida && nota.numero && String(Number(nota.numero)) === x.notaReferida
              ? { ...x, nota_produto_id: r.id, entrada: x.entrada || nota.entrada }
              : x,
          ),
        );
      } else pular();
      router.refresh();
      if (fila.length <= 1) dialogo.current?.close();
    });
  }

  const titulo = modo.tipo === "editar" ? "Editar nota" : modo.tipo === "manual" ? "Lançar nota à mão" : "Importar notas (XML)";
  return (
    <>
      {modo.tipo === "editar" ? (
        <button type="button" onClick={abrir} className={classeBotao("secundario", true)}>
          Editar
        </button>
      ) : (
        <button type="button" onClick={abrir} className={classeBotao(modo.tipo === "xml" ? "primario" : "secundario", true)}>
          {modo.tipo === "xml" ? <FileUp className="size-4" /> : <PenLine className="size-4" />}
          {modo.tipo === "xml" ? "Importar XML" : "Lançar à mão"}
        </button>
      )}
      <dialog
        ref={dialogo}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-3xl whitespace-normal bg-superficie p-0 text-left shadow-xl"
        onClick={(e) => e.target === dialogo.current && !ocupado && dialogo.current?.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              {titulo}
              {modo.tipo === "xml" && lidas.total > 1 && f && <span className="ml-2 text-sm font-normal text-slate-500">nota {lidas.total - fila.length + 1} de {lidas.total}</span>}
            </h2>
            <button type="button" onClick={() => dialogo.current?.close()} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm">
            {modo.tipo === "xml" && (
              <div className="space-y-2">
                <input
                  key={chaveArquivo}
                  type="file"
                  multiple
                  accept=".xml,text/xml,application/xml"
                  onChange={(e) => ler(e.target.files)}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
                />
                <p className="text-xs text-slate-500">
                  Selecione um ou mais XML de NF-e (produtos) e de NFS-e (serviço). Cada nota é conferida aqui antes de gravar. Para nota só em papel ou
                  PDF, use <strong>Lançar à mão</strong>.
                </p>
                <Avisos titulo="Arquivos não lidos" linhas={lidas.erros} />
                {lidas.total > 0 && !f && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">Todas as notas foram conferidas.</p>}
              </div>
            )}
            {f && <FormNota f={f} ctx={contexto} mudar={mudar} mudarItem={mudarItem} />}
            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
            {modo.tipo === "xml" && fila.length > 1 && (
              <button type="button" onClick={pular} disabled={ocupado} className={classeBotao("secundario")}>
                Pular esta nota
              </button>
            )}
            <button type="button" onClick={() => dialogo.current?.close()} className={classeBotao("secundario")}>
              {f ? "Cancelar" : "Fechar"}
            </button>
            {f && (
              <Botao type="button" onClick={gravar} disabled={ocupado}>
                {ocupado ? "Gravando..." : fila.length > 1 ? "Gravar e ir para a próxima" : "Gravar nota"}
              </Botao>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

function FormNota({ f, ctx, mudar, mudarItem }: { f: Form; ctx: Contexto; mudar: (m: Partial<Form>) => void; mudarItem: (k: number, m: Partial<ItemForm>) => void }) {
  const porNome = new Map(ctx.insumos.map((i) => [chaveNome(i.nome), i]));
  const lista = `insumos-nota-${f.chave ?? "manual"}`;
  const total = centavosDe(f.total) ?? 0;
  const frete = centavosDe(f.frete) ?? 0;
  const valores = f.itens.map((i) => centavosDe(i.valor) ?? 0);
  const custos = custosDosItens(valores.map((valor) => ({ valor })), 0, frete);
  const somaItens = valores.reduce((s, v) => s + v, 0);
  const diferenca = total - somaItens - frete;
  const somaVenc = f.vencimentos.reduce((s, v) => s + (centavosDe(v.valor) ?? 0), 0);
  const cands = candidatos(f, ctx);
  const servicoLigado = f.tipo === "servico" && f.nota_produto_id ? ctx.notasProduto.find((p) => p.id === f.nota_produto_id) : null;
  const opcoesProduto = ctx.notasProduto.slice(0, 60).map((p) => ({ valor: p.id, rotulo: `NF ${p.numero ?? "s/n"} · ${p.emitente_nome} · ${dataBR(p.entrada)}` }));

  return (
    <div className="space-y-5">
      <Avisos titulo="Confira antes de gravar" linhas={f.avisos} />

      {/* Cabeçalho */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {f.origem === "manual" && !f.id ? (
            <Selecao
              value={f.tipo}
              onChange={(e) => mudar({ tipo: e.target.value as Form["tipo"] })}
              opcoes={[
                { valor: "produto", rotulo: "NF-e de produtos" },
                { valor: "servico", rotulo: "NFS-e (serviço)" },
              ]}
              className="w-auto"
              aria-label="Tipo de nota"
            />
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{f.tipo === "produto" ? "NF-e de produtos" : "NFS-e (serviço)"}</span>
          )}
          {f.arquivo && <span className="truncate text-xs text-slate-500">{f.arquivo}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Número">
            <Entrada value={f.numero} onChange={(e) => mudar({ numero: e.target.value })} />
          </Campo>
          <Campo rotulo="Emissão">
            <Entrada type="date" value={f.emissao} onChange={(e) => mudar({ emissao: e.target.value })} />
          </Campo>
          <Campo rotulo="Entrada no estoque" dica="É a competência da compra.">
            <Entrada type="date" value={f.entrada} onChange={(e) => mudar({ entrada: e.target.value })} required />
          </Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Fornecedor" dica={f.emitente_documento ? `CNPJ ${f.emitente_documento}` : undefined}>
            <Selecao
              value={f.contraparte_id}
              onChange={(e) => mudar({ contraparte_id: e.target.value })}
              vazio={f.emitente_nome ? `Cadastrar novo: ${f.emitente_nome}` : "Cadastrar novo (digite abaixo)"}
              opcoes={ctx.contrapartes.map((c) => ({ valor: c.id, rotulo: c.nome }))}
            />
          </Campo>
          {!f.contraparte_id ? (
            <Campo rotulo="Nome do fornecedor novo">
              <Entrada value={f.emitente_nome} onChange={(e) => mudar({ emitente_nome: e.target.value })} />
            </Campo>
          ) : (
            <Campo rotulo="Valor total da nota">
              <EntradaMoeda value={f.total} onChange={(total) => mudar({ total })} />
            </Campo>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {!f.contraparte_id && (
            <Campo rotulo="Valor total da nota">
              <EntradaMoeda value={f.total} onChange={(total) => mudar({ total })} />
            </Campo>
          )}
          {f.tipo === "produto" && (
            <>
              <Campo rotulo="Frete (dentro do total)">
                <EntradaMoeda value={f.frete} onChange={(frete) => mudar({ frete })} />
              </Campo>
              <Campo rotulo="Remessa" dica="Notas da mesma entrega com o mesmo nome dividem o frete.">
                <Entrada value={f.remessa} onChange={(e) => mudar({ remessa: e.target.value })} placeholder="Ex.: pedido 143713" />
              </Campo>
            </>
          )}
        </div>
        {f.tipo === "servico" && (
          <Campo
            rotulo="NF-e de produtos desta nota de serviço"
            dica={
              servicoLigado
                ? "O valor desta nota é rateado entre os itens da NF-e, na proporção do valor de cada um, e entra no custo dos insumos."
                : f.notaReferida
                  ? `O texto da nota cita a NF ${f.notaReferida}, que ainda não foi lançada. Lance a NF-e antes, ou grave sem ligar e ligue depois.`
                  : "Sem NF-e ligada, o valor do serviço não entra no custo dos insumos."
            }
          >
            <Selecao value={f.nota_produto_id} onChange={(e) => mudar({ nota_produto_id: e.target.value })} vazio="Nenhuma" opcoes={opcoesProduto} />
          </Campo>
        )}
      </section>

      {/* Itens */}
      {f.tipo === "produto" && (
        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Itens</h3>
          <p className="text-xs text-slate-500">
            Ligue cada item ao insumo do estoque e diga quanto vem em 1 unidade da nota (ex.: 1 CX = 12 L). Digite um nome novo para criar o insumo. O
            Axis lembra a escolha para as próximas notas deste fornecedor.
          </p>
          <datalist id={lista}>
            {ctx.insumos.map((i) => (
              <option key={i.id} value={i.nome} />
            ))}
          </datalist>
          <div className="space-y-3">
            {f.itens.map((i, idx) => {
              const insumo = porNome.get(chaveNome(i.insumo));
              const novo = !i.ignorar && i.insumo.trim() !== "" && !insumo;
              const unidadeInsumo = insumo?.unidade ?? (i.unidadeNova || "un");
              const q = numeroDe(i.quantidade) * numeroDe(i.fator);
              const unit = q > 0 && !i.ignorar ? custos[idx].custo / 100 / q : null;
              return (
                <div key={i.k} className="rounded-lg border border-slate-200 p-3">
                  <div className="grid grid-cols-[1fr_4.5rem_1.4fr_2rem] gap-2 sm:grid-cols-[1fr_6rem_5rem_8rem_2rem]">
                    {f.origem === "manual" ? (
                      <input value={i.descricao} onChange={(e) => mudarItem(i.k, { descricao: e.target.value })} placeholder="Descrição na nota" aria-label="Descrição" className={cx(classeInput, "col-span-4 sm:col-span-1")} />
                    ) : (
                      <p className="col-span-4 self-center font-medium text-slate-800 sm:col-span-1">
                        {i.descricao}
                        {i.codigo && <span className="ml-1 text-xs font-normal text-slate-400">cód. {i.codigo}</span>}
                      </p>
                    )}
                    <input value={i.quantidade} onChange={(e) => mudarItem(i.k, { quantidade: e.target.value })} inputMode="decimal" placeholder="Quant." aria-label="Quantidade" className={cx(classeInput, "text-right tabular-nums")} />
                    <input value={i.unidade} onChange={(e) => mudarItem(i.k, { unidade: e.target.value })} placeholder="Unid." aria-label="Unidade na nota" className={classeInput} />
                    <EntradaMoeda value={i.valor} onChange={(valor) => mudarItem(i.k, { valor })} aria-label="Valor do item" />
                    {f.origem === "manual" ? (
                      <button
                        type="button"
                        onClick={() => mudar({ itens: f.itens.filter((x) => x.k !== i.k) })}
                        aria-label="Apagar item"
                        className="flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                  <div className="mt-2 grid items-center gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={i.ignorar ? NAO_INSUMO : i.insumo}
                        disabled={i.ignorar}
                        onChange={(e) => mudarItem(i.k, { insumo: e.target.value })}
                        list={lista}
                        placeholder="Insumo do estoque"
                        aria-label="Insumo"
                        className={cx(classeInput, "w-auto min-w-0 flex-1 basis-48", !i.ignorar && !i.insumo && "border-amber-300")}
                      />
                      {!i.ignorar && (
                        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                          1 {i.unidade || "un"} =
                          <span className="w-20">
                            <input value={i.fator} onChange={(e) => mudarItem(i.k, { fator: e.target.value })} inputMode="decimal" aria-label="Quanto vem em 1 unidade da nota" className={cx(classeInput, "text-right tabular-nums")} />
                          </span>
                          {novo ? (
                            <span className="w-16">
                              <input value={i.unidadeNova} onChange={(e) => mudarItem(i.k, { unidadeNova: e.target.value })} aria-label="Unidade do insumo novo" className={classeInput} />
                            </span>
                          ) : (
                            unidadeInsumo
                          )}
                        </span>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={i.ignorar} onChange={(e) => mudarItem(i.k, { ignorar: e.target.checked })} />
                      Não é insumo
                    </label>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {novo && <span className="mr-2 rounded bg-marca-50 px-1.5 py-0.5 font-medium text-marca-700">insumo novo</span>}
                    {custos[idx].frete > 0 && <>+ {real(custos[idx].frete)} de frete · </>}
                    {unit !== null && Number.isFinite(unit) && (
                      <>
                        custo {custo4.format(unit)} por {unidadeInsumo}
                        {f.id ? "" : " (sem o serviço da NFS-e, que entra quando ela for lançada)"}
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
          {f.origem === "manual" && (
            <button type="button" onClick={() => mudar({ itens: [...f.itens, itemVazio()] })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50">
              <Plus className="size-3.5" /> Adicionar item
            </button>
          )}
          <p className={cx("text-xs", Math.abs(diferenca) > 1 ? "text-amber-700" : "text-slate-500")}>
            Itens {real(somaItens)} + frete {real(frete)} = {real(somaItens + frete)}
            {Math.abs(diferenca) > 1 ? ` · diferença de ${real(diferenca)} para o total da nota` : " · confere com o total"}
          </p>
        </section>
      )}

      {/* Pagamento */}
      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">Pagamento</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(
            [
              ...(f.id ? [["manter", "Manter como está"]] : []),
              ...(!f.temLancamentos ? [["criar", "Criar contas a pagar"]] : []),
              ["ligar", "Ligar a lançamentos que já existem"],
              ["nenhum", "Sem pagamento"],
            ] as [Form["modo"], string][]
          ).map(([valor, rotulo]) => (
            <label key={valor} className="flex items-center gap-1.5">
              <input type="radio" name={`modo-${f.chave ?? f.id ?? "nova"}`} checked={f.modo === valor} onChange={() => mudar({ modo: valor })} />
              {rotulo}
            </label>
          ))}
        </div>
        {f.modo === "criar" && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Conta do plano">
                <Selecao value={f.conta_id} onChange={(e) => mudar({ conta_id: e.target.value })} vazio="Escolha" opcoes={ctx.contas} />
              </Campo>
              <Campo rotulo="Pagar pela conta">
                <Selecao value={f.caixa_id} onChange={(e) => mudar({ caixa_id: e.target.value })} vazio="Escolha" opcoes={ctx.caixas} />
              </Campo>
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-medium text-slate-700">Vencimentos (boletos)</span>
              {f.vencimentos.map((v) => (
                <div key={v.k} className="grid grid-cols-[1fr_1fr_2rem] gap-2">
                  <Entrada type="date" value={v.vencimento} onChange={(e) => mudar({ vencimentos: f.vencimentos.map((x) => (x.k === v.k ? { ...x, vencimento: e.target.value } : x)) })} aria-label="Vencimento" />
                  <EntradaMoeda value={v.valor} onChange={(valor) => mudar({ vencimentos: f.vencimentos.map((x) => (x.k === v.k ? { ...x, valor } : x)) })} aria-label="Valor" />
                  <button
                    type="button"
                    onClick={() => mudar({ vencimentos: f.vencimentos.filter((x) => x.k !== v.k) })}
                    aria-label="Apagar vencimento"
                    className="flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => mudar({ vencimentos: [...f.vencimentos, { k: k(), vencimento: "", valor: "" }] })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50">
                  <Plus className="size-3.5" /> Adicionar vencimento
                </button>
                <span className={cx("text-xs", somaVenc !== total ? "text-amber-700" : "text-slate-500")}>
                  Soma {real(somaVenc)} {somaVenc !== total ? `· faltam ${real(total - somaVenc)}` : "· confere"}
                </span>
              </div>
              <p className="text-xs text-slate-500">Cada vencimento vira uma conta a pagar prevista, com competência na data de entrada.</p>
            </div>
          </div>
        )}
        {f.modo === "ligar" && (
          <div className="space-y-1 rounded-lg bg-slate-50 p-3">
            {cands.length === 0 ? (
              <p className="text-slate-600">Nenhum lançamento parecido (mesmo fornecedor, mesmo valor ou o número da nota) nos últimos meses.</p>
            ) : (
              cands.map((s) => (
                <label key={s.id} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-white">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={f.ligar.includes(s.id)}
                    onChange={(e) => mudar({ ligar: e.target.checked ? [...f.ligar, s.id] : f.ligar.filter((x) => x !== s.id) })}
                  />
                  <span className="flex-1">
                    <span className="font-medium text-slate-800">{s.descricao ?? s.documento ?? "Sem descrição"}</span>
                    <span className="block text-xs text-slate-500">
                      competência {dataBR(s.competencia)}
                      {s.vencimento && ` · vence ${dataBR(s.vencimento)}`} · {s.situacao}
                      {s.ligada && " · já ligado a outra nota"}
                    </span>
                  </span>
                  <span className="tabular-nums text-slate-800">{real(s.valor)}</span>
                </label>
              ))
            )}
          </div>
        )}
        {f.modo === "nenhum" && <p className="text-xs text-slate-500">A nota entra no estoque e no custo médio, mas não gera nem liga nenhum pagamento.</p>}
      </section>

      <Campo rotulo="Observações">
        <Entrada value={f.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} />
      </Campo>
    </div>
  );
}
