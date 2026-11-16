"use client";

import { FileUp, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { avisar } from "@/components/avisos";
import { Botao, Campo, Entrada, classeBotao, classeTabela as t } from "@/components/ui";
import { chaveNome, lerContagem, lerCustos, lerFichas, lerVendas, type FichaImportada, type ItemImportado, type VendaImportada } from "@/lib/financeiro/estoque";
import { lerPlanilha } from "@/lib/xlsx";
import { importarContagem, importarCustos, importarFichas, importarVendas } from "@/server/estoque";

const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const real = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const classeArquivo =
  "block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50";

async function lerArquivo(arquivo: File) {
  if (arquivo.size > 10 * 1024 * 1024) throw new Error("Arquivo grande demais (mais de 10 MB).");
  return lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
}
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Mês do relatório pelo nome do arquivo ("Relatorio_vendas_outubro.xls"); sem ano no nome, o último mês com esse nome.
function mesDoArquivo(nome: string, hoje: Date) {
  const texto = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const i = NOMES_MES.findIndex((m) => texto.includes(m.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  const ano = Number(/(20\d{2})/.exec(texto)?.[1]) || null;
  if (i < 0) {
    const anterior = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 1, 1));
    return anterior.toISOString().slice(0, 7);
  }
  const a = ano ?? (i <= hoje.getMonth() ? hoje.getFullYear() : hoje.getFullYear() - 1);
  return `${a}-${String(i + 1).padStart(2, "0")}`;
}

// Painel à direita, igual aos outros de importação.
export function Dialogo({
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

export function Avisos({ titulo, linhas }: { titulo: string; linhas: string[] }) {
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

// Relatório de vendas do PDV (.xls ou .xlsx), um por mês. Importar de novo o mesmo mês substitui.
export function ImportarVendas({ empresaId, produtosComFicha }: { empresaId: string; produtosComFicha: string[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [lido, setLido] = useState<{ arquivo: string; itens: VendaImportada[]; erros: string[] } | null>(null);
  const [mes, setMes] = useState("");
  const [erro, setErro] = useState<string>();
  const [chave, setChave] = useState(0);
  const [ocupado, iniciar] = useTransition();
  const comFicha = new Set(produtosComFicha.map(chaveNome));
  const semFicha = lido?.itens.filter((i) => !comFicha.has(chaveNome(i.nome))) ?? [];
  const total = lido?.itens.reduce((a, i) => a + (i.valor ?? 0), 0) ?? 0;

  function ler(arquivo: File | undefined) {
    setLido(null);
    setErro(undefined);
    if (!arquivo) return;
    iniciar(async () => {
      try {
        const r = lerVendas(await lerArquivo(arquivo));
        if ("erro" in r) return setErro(r.erro);
        if (!r.itens.length) return setErro("Não encontrei nenhum produto com quantidade vendida.");
        setLido({ arquivo: arquivo.name, itens: r.itens, erros: r.erros });
        setMes(mesDoArquivo(arquivo.name, new Date()));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      }
    });
  }

  function importar() {
    if (!lido) return;
    iniciar(async () => {
      const r = await importarVendas(empresaId, { mes, arquivo: lido.arquivo, itens: lido.itens });
      if ("erro" in r) return setErro(r.erro);
      dialogo.current?.close();
      avisar("Vendas importadas");
      router.push(`?aba=cmv&mes=${r.mes}`);
    });
  }

  return (
    <Dialogo
      dialogo={dialogo}
      ocupado={ocupado}
      titulo="Importar vendas do PDV"
      gatilho={
        <>
          <FileUp />
          Importar vendas
        </>
      }
      aoAbrir={() => {
        setLido(null);
        setErro(undefined);
        setMes("");
        setChave((c) => c + 1);
      }}
      rodape={
        <>
          <Botao type="button" variante="secundario" onClick={() => dialogo.current?.close()}>
            Cancelar
          </Botao>
          <Botao type="button" onClick={importar} disabled={!lido || !mes || ocupado}>
            {ocupado && lido ? "Importando…" : "Importar vendas"}
          </Botao>
        </>
      }
    >
      <div key={chave} className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Relatório de vendas por produto (.xls ou .xlsx)" dica="Precisa das colunas Produto e Quantidade. O total vendido entra se houver.">
          <input type="file" accept=".xlsx,.xls" disabled={ocupado} onChange={(e) => ler(e.target.files?.[0])} className={classeArquivo} />
        </Campo>
        <Campo rotulo="Mês das vendas" dica="Se o mês já tiver vendas importadas, elas são substituídas.">
          <Entrada type="month" value={mes} onChange={(e) => setMes(e.target.value)} disabled={!lido} required />
        </Campo>
      </div>
      {ocupado && !lido && <p className="text-sm text-slate-500">Lendo o arquivo…</p>}
      {lido && (
        <>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {lido.itens.length} produtos vendidos{total > 0 && <> · {moeda(total)} em vendas</>}
            {semFicha.length > 0 && <> · {semFicha.length} ainda sem ficha técnica</>}.
          </p>
          <Avisos titulo="Linhas que ficaram de fora" linhas={lido.erros} />
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className={t.tabela}>
              <thead className={t.cabeca}>
                <tr>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                  <th className="px-3 py-2 text-right font-medium">Venda</th>
                </tr>
              </thead>
              <tbody>
                {lido.itens.slice(0, 300).map((i) => (
                  <tr key={i.nome} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5">
                      {i.nome}
                      {!comFicha.has(chaveNome(i.nome)) && <span className="ml-2 text-xs text-amber-700">sem ficha</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qtd.format(i.quantidade)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.valor === null ? "—" : moeda(i.valor)}</td>
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

// Fichas técnicas em planilha: uma linha por ingrediente (Produto, Insumo, Quantidade; Unidade e Categoria opcionais).
// Troca a ficha de cada produto da planilha; insumo que não existe é cadastrado sem custo.
export function ImportarFichas({ empresaId, insumos }: { empresaId: string; insumos: string[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [lido, setLido] = useState<{ fichas: FichaImportada[]; erros: string[] } | null>(null);
  const [resultado, setResultado] = useState<{ fichas: number; produtos_novos: number; insumos_novos: number } | null>(null);
  const [erro, setErro] = useState<string>();
  const [chave, setChave] = useState(0);
  const [ocupado, iniciar] = useTransition();
  const conhecidos = new Set(insumos.map(chaveNome));
  const novos = lido ? [...new Set(lido.fichas.flatMap((f) => f.itens.map((i) => i.insumo)).filter((n) => !conhecidos.has(chaveNome(n))))] : [];

  function ler(arquivo: File | undefined) {
    setLido(null);
    setErro(undefined);
    if (!arquivo) return;
    iniciar(async () => {
      try {
        const r = lerFichas(await lerArquivo(arquivo));
        if ("erro" in r) return setErro(r.erro);
        if (!r.fichas.length) return setErro("Não encontrei nenhuma ficha completa na planilha.");
        setLido(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      }
    });
  }

  function importar() {
    if (!lido) return;
    iniciar(async () => {
      const r = await importarFichas(empresaId, lido.fichas);
      if ("erro" in r) return setErro(r.erro);
      setResultado(r.resultado);
      avisar("Fichas importadas");
    });
  }

  return (
    <Dialogo
      dialogo={dialogo}
      ocupado={ocupado}
      titulo="Importar fichas técnicas"
      gatilho={
        <>
          <FileUp />
          Importar fichas
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
            <Botao type="button" onClick={importar} disabled={!lido || ocupado}>
              {ocupado && lido ? "Gravando…" : `Importar ${lido?.fichas.length ?? ""} fichas`}
            </Botao>
          </>
        )
      }
    >
      {resultado ? (
        <p className="text-sm text-slate-700">
          Pronto: {resultado.fichas} fichas gravadas, {resultado.produtos_novos} produtos novos e {resultado.insumos_novos} insumos novos
          {resultado.insumos_novos > 0 && " (sem custo: informe na aba Insumos)"}.
        </p>
      ) : (
        <>
          <Campo
            key={chave}
            rotulo="Planilha das fichas (.xlsx ou .xls)"
            dica="Uma linha por ingrediente: Produto (como no PDV), Insumo e Quantidade na unidade do insumo (ex.: 0,018 kg de café). Importar troca a ficha dos produtos da planilha."
          >
            <input type="file" accept=".xlsx,.xls" disabled={ocupado} onChange={(e) => ler(e.target.files?.[0])} className={classeArquivo} />
          </Campo>
          {ocupado && !lido && <p className="text-sm text-slate-500">Lendo o arquivo…</p>}
          {lido && (
            <>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {lido.fichas.length} fichas com {lido.fichas.reduce((a, f) => a + f.itens.length, 0)} ingredientes
                {novos.length > 0 && <> · {novos.length} insumos ainda não cadastrados serão criados sem custo</>}.
              </p>
              <Avisos titulo="Linhas que ficaram de fora" linhas={lido.erros} />
              <Avisos titulo="Insumos novos" linhas={novos} />
            </>
          )}
        </>
      )}
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
    </Dialogo>
  );
}
