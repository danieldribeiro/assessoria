"use client";

import { FileUp, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { avisar } from "@/components/avisos";
import { Botao, Campo, Entrada, classeBotao, classeTabela as t } from "@/components/ui";
import { chaveNome, lerContagem, lerCustos, type ItemImportado } from "@/lib/financeiro/estoque";
import { lerPlanilha } from "@/lib/xlsx";
import { importarContagem, importarCustos } from "@/server/estoque";

const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const classeArquivo =
  "block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50";

async function lerArquivo(arquivo: File) {
  if (arquivo.size > 10 * 1024 * 1024) throw new Error("Arquivo grande demais (mais de 10 MB).");
  if (/\.xls$/i.test(arquivo.name)) throw new Error("Este é o formato antigo do Excel (.xls). Abra no Excel e salve como .xlsx.");
  return lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
}

// Painel à direita, igual aos outros de importação.
function Dialogo({
  gatilho,
  titulo,
  aoAbrir,
  rodape,
  children,
  ocupado,
  dialogo,
}: {
  gatilho: ReactNode;
  titulo: string;
  aoAbrir: () => void;
  rodape: ReactNode;
  children: ReactNode;
  ocupado: boolean;
  dialogo: React.RefObject<HTMLDialogElement | null>;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => {
          aoAbrir();
          dialogo.current?.showModal();
        }}
        className={classeBotao("primario", true)}
      >
        {gatilho}
      </button>
      <dialog
        ref={dialogo}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl whitespace-normal bg-superficie p-0 text-left shadow-xl"
        onClick={(e) => e.target === dialogo.current && !ocupado && dialogo.current?.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">{rodape}</div>
        </div>
      </dialog>
    </>
  );
}

function Avisos({ titulo, linhas }: { titulo: string; linhas: string[] }) {
  if (!linhas.length) return null;
  return (
    <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4 shrink-0" />
        {titulo}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-6 text-xs">
        {linhas.slice(0, 15).map((l) => (
          <li key={l}>{l}</li>
        ))}
        {linhas.length > 15 && <li>e mais {linhas.length - 15}.</li>}
      </ul>
    </div>
  );
}

// Contagem de estoque: a planilha (exportada do Omnia, por exemplo) é lida aqui no navegador. A contagem entra
// em rascunho; insumos que ainda não existem são criados sem custo.
export function ImportarContagem({ empresaId, insumos }: { empresaId: string; insumos: string[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [lido, setLido] = useState<{ arquivo: string; itens: ItemImportado[]; erros: string[] } | null>(null);
  const [data, setData] = useState("");
  const [erro, setErro] = useState<string>();
  const [chave, setChave] = useState(0);
  const [ocupado, iniciar] = useTransition();
  const conhecidos = new Set(insumos.map(chaveNome));
  const novos = lido?.itens.filter((i) => !conhecidos.has(chaveNome(i.nome))).length ?? 0;

  function ler(arquivo: File | undefined) {
    setLido(null);
    setErro(undefined);
    if (!arquivo) return;
    iniciar(async () => {
      try {
        const r = lerContagem(await lerArquivo(arquivo));
        if ("erro" in r) return setErro(r.erro);
        if (!r.itens.length) return setErro("Não encontrei nenhum item com quantidade contada.");
        setLido({ arquivo: arquivo.name, itens: r.itens, erros: r.erros });
        setData(r.data ?? "");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      }
    });
  }

  function importar() {
    if (!lido) return;
    iniciar(async () => {
      const r = await importarContagem(empresaId, { data, arquivo: lido.arquivo, itens: lido.itens });
      if ("erro" in r) return setErro(r.erro);
      dialogo.current?.close();
      avisar("Contagem importada em rascunho");
      router.push(`?aba=contagens&contagem=${r.id}`);
    });
  }

  return (
    <Dialogo
      dialogo={dialogo}
      ocupado={ocupado}
      titulo="Importar contagem de estoque"
      gatilho={
        <>
          <FileUp />
          Importar contagem
        </>
      }
      aoAbrir={() => {
        setLido(null);
        setErro(undefined);
        setData("");
        setChave((c) => c + 1);
      }}
      rodape={
        <>
          <Botao type="button" variante="secundario" onClick={() => dialogo.current?.close()}>
            Cancelar
          </Botao>
          <Botao type="button" onClick={importar} disabled={!lido || !data || ocupado}>
            {ocupado && lido ? "Importando…" : "Importar em rascunho"}
          </Botao>
        </>
      }
    >
      <div key={chave} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Planilha da contagem (.xlsx)" dica="Precisa das colunas Produto e Qtd Contada. Categoria e Unidade entram se existirem.">
          <input type="file" accept=".xlsx,.xls" disabled={ocupado} onChange={(e) => ler(e.target.files?.[0])} className={classeArquivo} />
        </Campo>
        <Campo rotulo="Data da contagem" dica="O estoque do fim do dia. Para o CMV do mês, conte no último dia.">
          <Entrada type="date" value={data} onChange={(e) => setData(e.target.value)} disabled={!lido} required />
        </Campo>
      </div>
      {ocupado && !lido && <p className="text-sm text-slate-500">Lendo o arquivo…</p>}
      {lido && (
        <>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {lido.itens.length} itens contados
            {novos > 0 && <> · {novos} ainda não estão nos insumos e serão cadastrados sem custo</>}.
          </p>
          <Avisos titulo="Linhas que ficaram de fora" linhas={lido.erros} />
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className={t.tabela}>
              <thead className={t.cabeca}>
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {lido.itens.slice(0, 200).map((i) => (
                  <tr key={i.nome} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5">{i.nome}</td>
                    <td className="px-3 py-1.5 text-slate-500">{i.categoria ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                      {qtd.format(i.quantidade)} {i.unidade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
    </Dialogo>
  );
}

// Lista de custos: uma planilha com o nome do insumo e o custo por unidade contada. Atualiza só os insumos que já existem.
export function ImportarCustos({ empresaId, insumos }: { empresaId: string; insumos: string[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [lido, setLido] = useState<{ custos: { nome: string; custo: number }[]; erros: string[] } | null>(null);
  const [resultado, setResultado] = useState<{ atualizados: number; iguais: number; semInsumo: string[] } | null>(null);
  const [erro, setErro] = useState<string>();
  const [chave, setChave] = useState(0);
  const [ocupado, iniciar] = useTransition();
  const conhecidos = new Set(insumos.map(chaveNome));
  const casados = lido?.custos.filter((c) => conhecidos.has(chaveNome(c.nome))) ?? [];

  function ler(arquivo: File | undefined) {
    setLido(null);
    setErro(undefined);
    if (!arquivo) return;
    iniciar(async () => {
      try {
        const r = lerCustos(await lerArquivo(arquivo));
        if ("erro" in r) return setErro(r.erro);
        setLido(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      }
    });
  }

  function importar() {
    if (!lido) return;
    iniciar(async () => {
      const r = await importarCustos(empresaId, lido.custos);
      if (r && "erro" in r) return setErro(r.erro);
      setResultado(r ?? null);
      avisar("Custos atualizados");
    });
  }

  return (
    <Dialogo
      dialogo={dialogo}
      ocupado={ocupado}
      titulo="Importar custos dos insumos"
      gatilho={
        <>
          <FileUp />
          Importar custos
        </>
      }
      aoAbrir={() => {
        setLido(null);
        setResultado(null);
        setErro(undefined);
        setChave((c) => c + 1);
      }}
      rodape={
        resultado ? (
          <Botao type="button" onClick={() => dialogo.current?.close()}>
            Fechar
          </Botao>
        ) : (
          <>
            <Botao type="button" variante="secundario" onClick={() => dialogo.current?.close()}>
              Cancelar
            </Botao>
            <Botao type="button" onClick={importar} disabled={!casados.length || ocupado}>
              {ocupado && lido ? "Gravando…" : `Atualizar ${casados.length} custos`}
            </Botao>
          </>
        )
      }
    >
      {resultado ? (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Pronto: {resultado.atualizados} custos mudaram e {resultado.iguais} já estavam iguais. Contagens fechadas não mudam;
            as em rascunho já usam os custos novos.
          </p>
          <Avisos titulo="Linhas da planilha sem insumo com o mesmo nome (ficaram de fora)" linhas={resultado.semInsumo} />
        </div>
      ) : (
        <>
          <Campo
            key={chave}
            rotulo="Planilha de custos (.xlsx)"
            dica="Uma coluna com o nome (Item, Produto ou Insumo) e uma de custo (o título começa com Custo). O custo é por unidade contada: por kg, por pacote, por unidade."
          >
            <input type="file" accept=".xlsx,.xls" disabled={ocupado} onChange={(e) => ler(e.target.files?.[0])} className={classeArquivo} />
          </Campo>
          {ocupado && !lido && <p className="text-sm text-slate-500">Lendo o arquivo…</p>}
          {lido && (
            <>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {lido.custos.length} custos na planilha · {casados.length} casam com insumos cadastrados
                {lido.custos.length > casados.length && <> · {lido.custos.length - casados.length} sem insumo com o mesmo nome</>}.
              </p>
              <Avisos titulo="Linhas que ficaram de fora" linhas={lido.erros} />
              {casados.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className={t.tabela}>
                    <thead className={t.cabeca}>
                      <tr>
                        <th className="px-3 py-2 font-medium">Insumo</th>
                        <th className="px-3 py-2 text-right font-medium">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {casados.slice(0, 200).map((c) => (
                        <tr key={c.nome} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-1.5">{c.nome}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{real.format(c.custo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
    </Dialogo>
  );
}
