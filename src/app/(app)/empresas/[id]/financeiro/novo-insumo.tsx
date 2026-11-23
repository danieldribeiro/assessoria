"use client";

import { Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { avisar } from "@/components/avisos";
import { Botao, Campo, Entrada } from "@/components/ui";
import { criarInsumo } from "@/server/estoque";
import { Dialogo } from "./importar-estoque";

// Cadastrar um insumo à mão, sem precisar de contagem, nota ou planilha.
export function NovoInsumo({ empresaId, unidades, categorias }: { empresaId: string; unidades: string[]; categorias: string[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState<string>();
  const [ocupado, iniciar] = useTransition();

  return (
    <Dialogo
      dialogo={dialogo}
      ocupado={ocupado}
      titulo="Novo insumo"
      gatilho={
        <>
          <Plus />
          Novo insumo
        </>
      }
      aoAbrir={() => {
        setErro(undefined);
        form.current?.reset();
      }}
      rodape={
        <>
          <Botao type="button" variante="secundario" onClick={() => dialogo.current?.close()}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-novo-insumo" disabled={ocupado}>
            {ocupado ? "Gravando…" : "Cadastrar insumo"}
          </Botao>
        </>
      }
    >
      <form
        id="form-novo-insumo"
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          iniciar(async () => {
            const r = await criarInsumo(empresaId, dados);
            setErro(r?.erro);
            if (r?.erro) return;
            avisar("Insumo cadastrado");
            dialogo.current?.close();
          });
        }}
        className="space-y-4"
      >
        <Campo rotulo="Nome">
          <Entrada name="nome" required maxLength={120} placeholder="Ex.: Leite de aveia 1L" autoComplete="off" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Unidade em que é contado" dica="Como aparece na contagem: kg, L, un, pct, cx…">
            <Entrada name="unidade" required maxLength={20} list="unidades-insumo" placeholder="un" autoComplete="off" />
          </Campo>
          <Campo rotulo="Categoria (opcional)">
            <Entrada name="categoria" maxLength={60} list="categorias-insumo" autoComplete="off" />
          </Campo>
        </div>
        <Campo rotulo="Custo por unidade (opcional)" dica="Pode deixar em branco e informar depois na tabela de insumos.">
          <Entrada name="custo" inputMode="decimal" placeholder="0,00" className="text-right tabular-nums sm:w-40" />
        </Campo>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="fora_do_cmv" className="size-4 rounded border-slate-300 text-marca-600" />
          Fora do CMV (limpeza, utensílios: é contado, mas não entra no custo da mercadoria)
        </label>
        <datalist id="unidades-insumo">
          {unidades.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <datalist id="categorias-insumo">
          {categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </form>
    </Dialogo>
  );
}
