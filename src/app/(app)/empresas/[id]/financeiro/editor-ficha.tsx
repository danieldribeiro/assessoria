"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { avisar } from "@/components/avisos";
import { Botao, classeBotao, classeInput, cx } from "@/components/ui";
import { lerNumeroBR, mensagemNumeroInvalido, paraCampoBR } from "@/lib/numeros";
import { salvarFicha } from "@/server/estoque";

type Insumo = { id: string; nome: string; unidade: string; custo: number | null };
type Linha = { chave: number; item_id: string; quantidade: string };

const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Ficha técnica de um produto: quanto de cada insumo vai em uma unidade vendida, na unidade em que o insumo é contado.
export function EditorFicha({
  produto,
  ficha,
  insumos,
}: {
  produto: { id: string; nome: string };
  ficha: { item_id: string; quantidade: number }[];
  insumos: Insumo[];
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const proxima = useRef(0);
  const novaLinha = (item_id = "", quantidade = ""): Linha => ({ chave: proxima.current++, item_id, quantidade });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string>();
  const [ocupado, iniciar] = useTransition();
  const porId = new Map(insumos.map((i) => [i.id, i]));

  const custo = linhas.reduce(
    (a, l) => {
      const q = lerNumeroBR(l.quantidade);
      const c = porId.get(l.item_id)?.custo;
      if (!l.item_id || q.estado !== "valido") return a;
      if (c === null || c === undefined) return { ...a, semCusto: a.semCusto + 1 };
      return { ...a, total: a.total + q.valor * c };
    },
    { total: 0, semCusto: 0 },
  );

  function abrir() {
    setErro(undefined);
    setLinhas(ficha.length ? ficha.map((l) => novaLinha(l.item_id, paraCampoBR(l.quantidade))) : [novaLinha()]);
    dialogo.current?.showModal();
  }

  const mudar = (chave: number, campo: "item_id" | "quantidade", valor: string) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));

  function salvar() {
    setErro(undefined);
    const itens: { item_id: string; quantidade: number }[] = [];
    for (const l of linhas) {
      if (!l.item_id && !l.quantidade.trim()) continue; // linha em branco
      if (!l.item_id) return setErro("Escolha o insumo de cada linha (ou apague a linha).");
      const q = lerNumeroBR(l.quantidade);
      const nome = porId.get(l.item_id)?.nome ?? "insumo";
      if (q.estado === "invalido") return setErro(mensagemNumeroInvalido(`Quantidade de ${nome}`, q.texto));
      if (q.estado === "vazio" || q.valor <= 0) return setErro(`Informe a quantidade de ${nome} (maior que zero).`);
      itens.push({ item_id: l.item_id, quantidade: q.valor });
    }
    iniciar(async () => {
      const r = await salvarFicha(produto.id, itens);
      if (r && "erro" in r && typeof r.erro === "string") return setErro(r.erro);
      dialogo.current?.close();
      avisar(itens.length ? "Ficha salva" : "Ficha apagada");
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
              Quanto de cada insumo vai em <strong>uma unidade vendida</strong>, na unidade em que o insumo é contado. Ex.: se o
              café é contado em kg e a dose leva 18 g, informe 0,018.
            </p>
            <ul className="space-y-2">
              {linhas.map((l) => {
                const insumo = porId.get(l.item_id);
                return (
                  <li key={l.chave} className="flex items-center gap-2">
                    <select
                      value={l.item_id}
                      onChange={(e) => mudar(l.chave, "item_id", e.target.value)}
                      aria-label="Insumo"
                      className={cx(classeInput, "min-w-0 flex-1 pr-8")}
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
                      onChange={(e) => mudar(l.chave, "quantidade", e.target.value)}
                      inputMode="decimal"
                      placeholder="0,000"
                      aria-label={`Quantidade de ${insumo?.nome ?? "insumo"}`}
                      className={cx(classeInput, "w-24 text-right tabular-nums")}
                    />
                    <span className="w-14 truncate text-xs text-slate-500">{insumo?.unidade ?? ""}</span>
                    <button
                      type="button"
                      onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Tirar este insumo"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setLinhas((ls) => [...ls, novaLinha()])} className={classeBotao("secundario", true)}>
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
