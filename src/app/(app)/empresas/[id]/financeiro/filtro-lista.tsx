"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { classeInput, cx } from "@/components/ui";
import { paraBusca } from "@/lib/financeiro/estoque";

// Filtro na hora (sem recarregar) de uma lista já na tela. Cada linha filtrável leva data-filtro, data-busca (texto já
// passado por paraBusca), data-categoria e data-situacoes (etiquetas separadas por espaço). A linha só fica escondida:
// num formulário, os campos dela continuam sendo enviados.
export function FiltroLista({
  alvo,
  categorias,
  situacoes,
  rotuloBusca,
}: {
  alvo: string;
  categorias: string[];
  situacoes: { valor: string; rotulo: string }[];
  rotuloBusca: string;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [situacao, setSituacao] = useState("");
  const [contagem, setContagem] = useState<{ vistos: number; total: number }>();

  useEffect(() => {
    const termos = paraBusca(busca).split(/\s+/).filter(Boolean);
    const aplicar = () => {
      const linhas = document.querySelectorAll<HTMLElement>(`#${alvo} [data-filtro]`);
      let vistos = 0;
      linhas.forEach((l) => {
        const texto = l.dataset.busca ?? "";
        const ok =
          termos.every((t) => texto.includes(t)) &&
          (!categoria || (l.dataset.categoria ?? "") === categoria) &&
          (!situacao || (l.dataset.situacoes ?? "").split(" ").includes(situacao));
        l.hidden = !ok;
        if (ok) vistos++;
      });
      setContagem({ vistos, total: linhas.length });
    };
    aplicar();
    // A lista é refeita depois de salvar (linhas novas ou trocadas): filtra de novo.
    const raiz = document.getElementById(alvo);
    const observador = new MutationObserver(aplicar);
    if (raiz) observador.observe(raiz, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [alvo, busca, categoria, situacao]);

  const filtrando = !!(busca.trim() || categoria || situacao);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
      <label className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder={rotuloBusca}
          aria-label={rotuloBusca}
          className={cx(classeInput, "pl-8")}
        />
      </label>
      {categorias.length > 0 && (
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" className={cx(classeInput, "w-auto pr-8")}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      <select value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação" className={cx(classeInput, "w-auto pr-8")}>
        <option value="">Todas as situações</option>
        {situacoes.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.rotulo}
          </option>
        ))}
      </select>
      {filtrando && contagem && (
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {contagem.vistos} de {contagem.total}
          <button
            type="button"
            onClick={() => {
              setBusca("");
              setCategoria("");
              setSituacao("");
            }}
            className="font-medium text-marca-700 hover:underline"
          >
            Limpar
          </button>
        </span>
      )}
      {filtrando && contagem?.vistos === 0 && <p className="w-full text-sm text-slate-500">Nenhum item com esses filtros.</p>}
    </div>
  );
}
