"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { avisar } from "@/components/avisos";
import { Botao, classeBotao, classeInput, cx } from "@/components/ui";
import { medidaInicial, naMedida, opcoesMedida, type OpcaoMedida } from "@/lib/financeiro/estoque";
import { lerNumeroBR, mensagemNumeroInvalido, paraCampoBR } from "@/lib/numeros";
import { salvarFicha } from "@/server/estoque";

export type InsumoFicha = {
  id: string;
  nome: string;
  unidade: string;
  custo: number | null;
  conteudo: number | null;
  conteudo_medida: string | null;
};
type Linha = { chave: number; item_id: string; quantidade: string; medida: string };

const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

// Ficha técnica de um produto: quanto de cada insumo vai em uma unidade vendida.
// A quantidade pode ser digitada em g ou ml; grava convertida para a unidade em que o insumo é contado.
export function EditorFicha({
  produto,
  ficha,
  insumos,
  preco,
}: {
  produto: { id: string; nome: string };
  ficha: { item_id: string; quantidade: number }[];
  insumos: InsumoFicha[];
  preco?: number | null; // preço de venda de tabela (0024); undefined = campo ainda não existe no banco
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const proxima = useRef(0);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string>();
  const [precoTexto, setPrecoTexto] = useState("");
  const [ocupado, iniciar] = useTransition();
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const opcoes = (id: string): OpcaoMedida[] => {
    const i = porId.get(id);
    return i ? opcoesMedida(i) : [];
  };
  const fatorDe = (l: Linha) => opcoes(l.item_id).find((o) => o.medida === l.medida)?.fator ?? 1;

  // Linha com a quantidade já na medida mais natural (ex.: 0,02 kg aparece como 20 g).
  function novaLinha(item_id = "", contada?: number): Linha {
    const o = item_id ? medidaInicial(opcoes(item_id)) : undefined;
    return {
      chave: proxima.current++,
      item_id,
      medida: o?.medida ?? "",
      quantidade: contada === undefined || !o ? "" : paraCampoBR(naMedida(contada, o.fator)),
    };
  }

  // Custo de cada linha: quantidade digitada × fator da medida × custo por unidade contada.
  const custoLinha = (l: Linha) => {
    const q = lerNumeroBR(l.quantidade);
    const c = porId.get(l.item_id)?.custo;
    if (!l.item_id || q.estado !== "valido") return undefined;
    return c === null || c === undefined ? null : q.valor * fatorDe(l) * c;
  };
  const custo = linhas.reduce(
    (a, l) => {
      const v = custoLinha(l);
      if (v === undefined) return a;
      return v === null ? { ...a, semCusto: a.semCusto + 1 } : { ...a, total: a.total + v };
    },
    { total: 0, semCusto: 0 },
  );

  function abrir() {
    setErro(undefined);
    setPrecoTexto(preco === undefined || preco === null ? "" : paraCampoBR(preco));
    setLinhas(ficha.length ? ficha.map((l) => novaLinha(l.item_id, l.quantidade)) : [novaLinha()]);
    dialogo.current?.showModal();
  }

  const trocar = (chave: number, mudanca: (l: Linha) => Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...mudanca(l) } : l)));

  // Trocar a medida mantém a mesma quantidade física (20 g → 0,02 kg).
  function trocarMedida(l: Linha, medida: string) {
    const q = lerNumeroBR(l.quantidade);
    const novo = opcoes(l.item_id).find((o) => o.medida === medida)?.fator ?? 1;
    const quantidade = q.estado === "valido" ? paraCampoBR(naMedida(q.valor * fatorDe(l), novo)) : l.quantidade;
    trocar(l.chave, () => ({ medida, quantidade }));
  }

  const precoLido = lerNumeroBR(precoTexto);
  const margem = precoLido.estado === "valido" && precoLido.valor > 0 && custo.total > 0 ? (precoLido.valor - custo.total) / precoLido.valor : null;

  function salvar() {
    setErro(undefined);
    let novoPreco: number | null | undefined;
    if (preco !== undefined) {
      if (precoLido.estado === "invalido") return setErro(mensagemNumeroInvalido("Preço de venda", precoLido.texto));
      if (precoLido.estado === "valido" && precoLido.valor < 0) return setErro("O preço de venda não pode ser negativo.");
      novoPreco = precoLido.estado === "valido" ? precoLido.valor : null;
    }
    const itens: { item_id: string; quantidade: number }[] = [];
    for (const l of linhas) {
      if (!l.item_id && !l.quantidade.trim()) continue; // linha em branco
      if (!l.item_id) return setErro("Escolha o insumo de cada linha (ou apague a linha).");
      const q = lerNumeroBR(l.quantidade);
      const nome = porId.get(l.item_id)?.nome ?? "insumo";
      if (q.estado === "invalido") return setErro(mensagemNumeroInvalido(`Quantidade de ${nome}`, q.texto));
      if (q.estado === "vazio" || q.valor <= 0) return setErro(`Informe a quantidade de ${nome} (maior que zero).`);
      itens.push({ item_id: l.item_id, quantidade: Number((q.valor * fatorDe(l)).toFixed(6)) });
    }
    iniciar(async () => {
      const r = await salvarFicha(produto.id, itens, novoPreco);
      if (r && "erro" in r && typeof r.erro === "string") return setErro(r.erro);
      dialogo.current?.close();
      avisar(itens.length ? "Ficha salva" : ficha.length ? "Ficha apagada" : "Preço salvo");
    });
  }

  return (
    <>
      <button type="button" onClick={abrir} className="rounded-md px-2.5 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50">
        {ficha.length ? "Editar" : "Montar ficha"}
      </button>
      <dialog
        ref={dialogo}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl whitespace-normal bg-superficie p-0 text-left shadow-xl"
        onClick={(e) => e.target === dialogo.current && !ocupado && dialogo.current?.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Ficha técnica · {produto.nome}</h2>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <p className="text-sm text-slate-600">
              Quanto de cada insumo vai em <strong>uma unidade vendida</strong>. Escolha a medida (g, ml, pct…) e o Axis converte para a
              unidade em que o insumo é contado no estoque.
            </p>
            {preco !== undefined && (
              <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-slate-700">Preço de venda (cardápio)</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm text-slate-500">R$</span>
                  <input
                    value={precoTexto}
                    onChange={(e) => setPrecoTexto(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className={cx(classeInput, "w-28 text-right tabular-nums")}
                  />
                </span>
              </label>
            )}
            <ul className="space-y-3">
              {linhas.map((l) => {
                const insumo = porId.get(l.item_id);
                const ops = opcoes(l.item_id);
                const v = custoLinha(l);
                return (
                  <li key={l.chave} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5rem_auto] items-center gap-x-2 gap-y-1">
                    <select
                      value={l.item_id}
                      onChange={(e) => {
                        const id = e.target.value;
                        const o = id ? medidaInicial(opcoesMedida(porId.get(id)!)) : undefined;
                        trocar(l.chave, () => ({ item_id: id, medida: o?.medida ?? "" }));
                      }}
                      aria-label="Insumo"
                      className={cx(classeInput, "pr-8")}
                    >
                      <option value="">Escolha o insumo…</option>
                      {insumos.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}
                        </option>
                      ))}
                    </select>
                    <input
                      value={l.quantidade}
                      onChange={(e) => trocar(l.chave, () => ({ quantidade: e.target.value }))}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Quantidade de ${insumo?.nome ?? "insumo"}`}
                      className={cx(classeInput, "text-right tabular-nums")}
                    />
                    <select
                      value={l.medida}
                      onChange={(e) => trocarMedida(l, e.target.value)}
                      disabled={ops.length < 2}
                      aria-label="Medida"
                      className={cx(classeInput, "pr-7 disabled:opacity-100")}
                    >
                      {ops.length === 0 && <option value="">—</option>}
                      {ops.map((o) => (
                        <option key={o.medida} value={o.medida}>
                          {o.medida}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Tirar este insumo"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    {insumo && (
                      <p className="col-span-full flex flex-wrap justify-between gap-x-3 text-xs text-slate-500">
                        <span>
                          {insumo.custo === null ? (
                            <span className="text-amber-700">sem custo cadastrado</span>
                          ) : (
                            <>
                              {real.format(insumo.custo)} por {insumo.unidade}
                            </>
                          )}
                          {insumo.conteudo && insumo.conteudo_medida && (
                            <>
                              {" "}
                              · 1 {insumo.unidade} = {qtd.format(insumo.conteudo)} {insumo.conteudo_medida}
                            </>
                          )}
                          {ops.length < 2 && " · para usar g, ml ou pacote, informe o conteúdo de 1 unidade na aba Insumos"}
                        </span>
                        {typeof v === "number" && <span className="font-medium tabular-nums text-slate-700">{real.format(v)}</span>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => setLinhas((ls) => [...ls, novaLinha()])}
              className={classeBotao("secundario", true)}
            >
              <Plus />
              Adicionar insumo
            </button>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Custo da ficha: <strong className="tabular-nums">{real.format(custo.total)}</strong>
              {custo.semCusto > 0 && (
                <span className="text-amber-700">
                  {" "}
                  (mais {custo.semCusto} {custo.semCusto === 1 ? "insumo" : "insumos"} ainda sem custo)
                </span>
              )}
              {margem !== null && (
                <>
                  {" "}
                  · Margem pelo preço de venda: <strong className={cx("tabular-nums", margem < 0 && "text-red-700")}>{pct.format(margem)}</strong>
                </>
              )}
            </p>
            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
            <Botao type="button" variante="secundario" onClick={() => dialogo.current?.close()}>
              Cancelar
            </Botao>
            <Botao type="button" onClick={salvar} disabled={ocupado}>
              {ocupado ? "Salvando…" : "Salvar ficha"}
            </Botao>
          </div>
        </div>
      </dialog>
    </>
  );
}
