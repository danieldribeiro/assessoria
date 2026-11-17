"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { avisar } from "@/components/avisos";
import { EntradaMoeda } from "@/components/entrada-moeda";
import { Botao, classeBotao, classeInput, cx } from "@/components/ui";
import { lerNumeroBR, mensagemNumeroInvalido, paraCampoBR } from "@/lib/numeros";
import { salvarComplementos } from "@/server/estoque";

type Linha = { chave: number; nome: string; quantidade: string; valor: string };
export type Complemento = { nome: string; quantidade: number; valor: number | null };

const moeda = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Complementos do mês (0025): os adicionais cobrados à parte, digitados do relatório "Análise de Complementos" do PDV.
// Cada nome vira um produto na categoria Complementos; a dose média fica na ficha dele, na aba Fichas técnicas.
export function EditorComplementos({
  vendaId,
  mes,
  atuais,
  sugestoes,
}: {
  vendaId: string;
  mes: string;
  atuais: Complemento[];
  sugestoes: string[];
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const proxima = useRef(0);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string>();
  const [ocupado, iniciar] = useTransition();

  const novaLinha = (c?: Complemento): Linha => ({
    chave: proxima.current++,
    nome: c?.nome ?? "",
    quantidade: c ? paraCampoBR(c.quantidade) : "",
    valor: c?.valor === null || c?.valor === undefined ? "" : moeda(c.valor),
  });

  function abrir() {
    setErro(undefined);
    setLinhas(atuais.length ? atuais.map((c) => novaLinha(c)) : [novaLinha()]);
    dialogo.current?.showModal();
  }

  const trocar = (chave: number, mudanca: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));

  function salvar() {
    setErro(undefined);
    const itens: Complemento[] = [];
    for (const l of linhas) {
      if (!l.nome.trim() && !l.quantidade.trim() && !l.valor.trim()) continue; // linha em branco
      const nome = l.nome.trim();
      if (!nome) return setErro("Informe o nome de cada complemento (ou apague a linha).");
      const q = lerNumeroBR(l.quantidade);
      if (q.estado === "invalido") return setErro(mensagemNumeroInvalido(`Quantidade de ${nome}`, q.texto));
      if (q.estado === "vazio" || q.valor < 0) return setErro(`Informe a quantidade de ${nome}.`);
      const v = lerNumeroBR(l.valor);
      if (v.estado === "invalido") return setErro(mensagemNumeroInvalido(`Total de ${nome}`, v.texto));
      itens.push({ nome, quantidade: q.valor, valor: v.estado === "valido" ? v.valor : null });
    }
    iniciar(async () => {
      const r = await salvarComplementos(vendaId, itens);
      if (r && "erro" in r && typeof r.erro === "string") return setErro(r.erro);
      dialogo.current?.close();
      avisar(itens.length ? "Complementos salvos" : "Complementos apagados");
    });
  }

  return (
    <>
      <button type="button" onClick={abrir} className={classeBotao("secundario", true)}>
        {atuais.length ? "Editar complementos" : "Lançar complementos"}
      </button>
      <dialog
        ref={dialogo}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl whitespace-normal bg-superficie p-0 text-left shadow-xl"
        onClick={(e) => e.target === dialogo.current && !ocupado && dialogo.current?.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Complementos · {mes}</h2>
            <button type="button" onClick={() => dialogo.current?.close()} className="text-sm text-slate-500 hover:text-slate-700">
              Fechar
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
            <p className="text-slate-600">
              Copie do relatório <strong>Análise de Complementos</strong> do PDV os adicionais que gastam insumo (leite de aveia, leite sem
              lactose, chantilly...). Leite integral não entra: ele já está nas fichas das bebidas.
            </p>
            <p className="text-slate-600">
              Cada nome vira um produto em <strong>Complementos</strong>. Monte a ficha dele na{" "}
              <Link href="?aba=fichas" className="font-medium text-marca-700 underline">
                aba Fichas técnicas
              </Link>{" "}
              com a dose média (ex.: 250 ml de leite de aveia), já que o tamanho da bebida não vem no relatório.
            </p>
            <datalist id="sugestoes-complementos">
              {sugestoes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_6rem_8rem_2rem] gap-2 text-xs font-medium text-slate-500 sm:grid">
                <span>Complemento</span>
                <span className="text-right">Quant.</span>
                <span className="text-right">Total cobrado</span>
                <span />
              </div>
              {linhas.map((l) => (
                <div key={l.chave} className="grid grid-cols-[4.5rem_1fr_2rem] gap-2 sm:grid-cols-[1fr_6rem_8rem_2rem]">
                  <input
                    value={l.nome}
                    onChange={(e) => trocar(l.chave, { nome: e.target.value })}
                    list="sugestoes-complementos"
                    placeholder="Ex.: Leite de aveia (adicional)"
                    aria-label="Complemento"
                    className={cx(classeInput, "col-span-3 sm:col-span-1")}
                  />
                  <input
                    value={l.quantidade}
                    onChange={(e) => trocar(l.chave, { quantidade: e.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Quantidade"
                    className={cx(classeInput, "text-right tabular-nums")}
                  />
                  <EntradaMoeda value={l.valor} onChange={(valor) => trocar(l.chave, { valor })} aria-label="Total cobrado" />
                  <button
                    type="button"
                    onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                    aria-label="Apagar linha"
                    className="flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLinhas((ls) => [...ls, novaLinha()])}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50"
              >
                <Plus className="size-3.5" /> Adicionar complemento
              </button>
            </div>
            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={() => dialogo.current?.close()} className={classeBotao("secundario")}>
              Cancelar
            </button>
            <Botao type="button" onClick={salvar} disabled={ocupado}>
              {ocupado ? "Salvando..." : "Salvar"}
            </Botao>
          </div>
        </div>
      </dialog>
    </>
  );
}
