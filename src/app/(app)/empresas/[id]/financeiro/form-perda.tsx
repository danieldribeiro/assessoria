"use client";

import { useRef, useState, useTransition } from "react";
import { avisar } from "@/components/avisos";
import { Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { MOTIVOS_PERDA } from "@/lib/financeiro/perdas";
import { lancarPerda } from "@/server/estoque";

// Anotar uma perda. Depois de gravar, limpa a quantidade e a observação e mantém a data e o motivo, para anotar a próxima.
export function FormPerda({ empresaId, hoje, insumos }: { empresaId: string; hoje: string; insumos: { id: string; nome: string; unidade: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [item, setItem] = useState("");
  const [erro, setErro] = useState<string>();
  const [ocupado, iniciar] = useTransition();
  const unidade = insumos.find((i) => i.id === item)?.unidade;

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await lancarPerda(empresaId, dados);
          setErro(r?.erro);
          if (r?.erro) return;
          avisar("Perda anotada");
          for (const nome of ["quantidade", "observacao"]) {
            const campo = form.current?.elements.namedItem(nome);
            if (campo instanceof HTMLInputElement) campo.value = "";
          }
          setItem("");
        });
      }}
      className="space-y-3 px-5 py-4"
    >
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr_8rem_10rem]">
        <Campo rotulo="Data">
          <Entrada type="date" name="data" defaultValue={hoje} max={hoje} required />
        </Campo>
        <Campo rotulo="Insumo">
          <Selecao name="item_id" value={item} onChange={(e) => setItem(e.target.value)} vazio="Escolha" opcoes={insumos.map((i) => ({ valor: i.id, rotulo: i.nome }))} required />
        </Campo>
        <Campo rotulo={unidade ? `Quantidade (${unidade})` : "Quantidade"}>
          <Entrada name="quantidade" inputMode="decimal" placeholder="0" className="text-right tabular-nums" required />
        </Campo>
        <Campo rotulo="Motivo">
          <Selecao name="motivo" defaultValue="vencido" opcoes={MOTIVOS_PERDA.map((m) => ({ valor: m.valor, rotulo: m.rotulo }))} />
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Campo rotulo="Observação (opcional)">
          <Entrada name="observacao" placeholder="Ex.: lote venceu 15/11" maxLength={300} />
        </Campo>
        <Botao type="submit" disabled={ocupado}>
          {ocupado ? "Gravando..." : "Anotar perda"}
        </Botao>
      </div>
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
    </form>
  );
}
