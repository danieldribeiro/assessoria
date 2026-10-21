"use client";

import { FileUp, TriangleAlert } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { avisar } from "@/components/avisos";
import { Botao, Campo, Etiqueta, Selecao, classeBotao, cx, classeTabela as t, type Tom } from "@/components/ui";
import { classificarPrevia, decodificarOfx, lerOfx, resumoArquivo, type EstadoPrevia, type ExtratoOfx } from "@/lib/financeiro/ofx";
import { conferirExtrato, importarExtrato } from "@/server/financeiro";

type Opcao = { valor: string; rotulo: string };
type Previa = ReturnType<typeof classificarPrevia>;
type Lido = { nome: string; sha256: string; extrato: ExtratoOfx; previa: Previa; jaImportadoEm: string | null; contaDiferente: string | null };
type Resumo = { novas: number; jaExistiam: number; deFora: number; comErro: number };

const ESTADOS: Record<EstadoPrevia, { rotulo: string; tom: Tom; dica: string }> = {
  nova: { rotulo: "Nova", tom: "verde", dica: "Ainda não está no sistema." },
  existente: { rotulo: "Já importada", tom: "cinza", dica: "Já está no sistema; não é gravada de novo." },
  parecida: { rotulo: "Parecida", tom: "ambar", dica: "Mesma data, valor e descrição de uma já gravada, com outro identificador do banco. Fica de fora, a não ser que você marque." },
  repetida: { rotulo: "Repetida no arquivo", tom: "ambar", dica: "Aparece duas vezes no arquivo com o mesmo identificador; só a primeira entra." },
};

const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const data = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

// Importação de extrato OFX: o arquivo é lido aqui no navegador, a prévia mostra o que é novo e o que já existe,
// e só as movimentações marcadas vão para o banco, como pendentes. Nenhum lançamento é criado.
export function ImportarExtrato({ empresaId, caixas }: { empresaId: string; caixas: Opcao[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [caixa, setCaixa] = useState(caixas.length === 1 ? caixas[0].valor : "");
  const [lido, setLido] = useState<Lido | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string>();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [chave, setChave] = useState(0);

  function abrir() {
    setLido(null);
    setResumo(null);
    setErro(undefined);
    setMarcadas(new Set());
    setChave((c) => c + 1);
    dialogo.current?.showModal();
  }

  function ler(arquivo: File | undefined) {
    setLido(null);
    setResumo(null);
    setErro(undefined);
    if (!arquivo) return;
    if (!caixa) {
      setErro("Escolha antes a conta de caixa do extrato.");
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      setErro("Arquivo grande demais (mais de 10 MB).");
      return;
    }
    iniciar(async () => {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const extrato = lerOfx(decodificarOfx(bytes));
      if ("erro" in extrato) return setErro(extrato.erro);
      if (extrato.movimentos.length === 0) {
        return setErro(extrato.erros.length ? "Nenhuma movimentação do arquivo pôde ser lida (veja os erros abaixo)." : "O arquivo não tem movimentações.");
      }
      const sha256 = await resumoArquivo(bytes);
      const datas = extrato.movimentos.map((m) => m.data).sort();
      const r = await conferirExtrato(empresaId, caixa, sha256, extrato.conta, datas[0], datas[datas.length - 1]);
      if ("erro" in r) return setErro(r.erro);
      const previa = classificarPrevia(extrato.movimentos, r.existentes);
      setLido({ nome: arquivo.name, sha256, extrato, previa, jaImportadoEm: r.jaImportadoEm, contaDiferente: r.contaDiferente });
      setMarcadas(new Set(previa.filter((p) => p.estado === "nova").map((p) => p.chave)));
    });
  }

  function importar() {
    if (!lido) return;
    const enviar = lido.previa.filter((p) => (p.estado === "nova" || p.estado === "parecida") && marcadas.has(p.chave));
    if (enviar.length === 0) return setErro("Nenhuma movimentação marcada para importar.");
    iniciar(async () => {
      const e = lido.extrato;
      const r = await importarExtrato(empresaId, caixa, {
        arquivoNome: lido.nome,
        sha256: lido.sha256,
        banco: e.banco,
        agencia: e.agencia,
        conta: e.conta,
        inicio: e.inicio,
        fim: e.fim,
        saldo: e.saldo,
        saldoEm: e.saldoEm,
        lidas: e.movimentos.length + e.erros.length,
        comErro: e.erros.length,
        movimentos: enviar.map(({ data, centavos, tipo_ofx, descricao, fitid, documento, chave }) => ({ data, centavos, tipo_ofx, descricao, fitid, documento, chave })),
      });
      if ("erro" in r) return setErro(r.erro);
      const existentes = lido.previa.filter((p) => p.estado === "existente").length;
      setResumo({
        novas: r.resultado.novas,
        jaExistiam: existentes + r.resultado.duplicadas,
        deFora: lido.previa.length - existentes - enviar.length,
        comErro: e.erros.length,
      });
      avisar("Extrato importado");
    });
  }

  const contagem = (estado: EstadoPrevia) => lido?.previa.filter((p) => p.estado === estado).length ?? 0;
  const marcaveis = lido?.previa.filter((p) => p.estado === "nova" || p.estado === "parecida") ?? [];

  return (
    <>
      <button type="button" onClick={abrir} className={classeBotao("primario")} disabled={caixas.length === 0}>
        <FileUp />
        Importar extrato
      </button>
      <dialog
        ref={dialogo}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-3xl whitespace-normal bg-superficie p-0 text-left shadow-xl"
        onClick={(e) => e.target === dialogo.current && !ocupado && dialogo.current?.close()}
      >
        <div key={chave} className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Importar extrato do banco (OFX)</h2>
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
            {resumo ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">Pronto. As movimentações novas estão na aba Extratos como pendentes, esperando conciliação.</p>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Gravadas", resumo.novas],
                    ["Já existiam", resumo.jaExistiam],
                    ["Deixadas de fora", resumo.deFora],
                    ["Com erro no arquivo", resumo.comErro],
                  ].map(([r, v]) => (
                    <div key={r} className="rounded-lg border border-slate-200 px-3 py-2">
                      <dt className="text-xs text-slate-500">{r}</dt>
                      <dd className="text-lg font-semibold tabular-nums text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-slate-500">Nenhum lançamento foi criado e nenhum saldo mudou.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Conta de caixa do extrato">
                    <Selecao
                      vazio="Escolha…"
                      opcoes={caixas}
                      value={caixa}
                      onChange={(e) => {
                        setCaixa(e.target.value);
                        setLido(null);
                      }}
                    />
                  </Campo>
                  <Campo rotulo="Arquivo OFX" dica="Exporte no site ou aplicativo do banco, no formato OFX (Money).">
                    <input
                      type="file"
                      accept=".ofx,.OFX,application/x-ofx"
                      disabled={!caixa || ocupado}
                      onChange={(e) => ler(e.target.files?.[0])}
                      className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
                    />
                  </Campo>
                </div>

                {ocupado && !lido && <p className="text-sm text-slate-500">Lendo o arquivo…</p>}

                {lido && (
                  <>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <p>
                        {lido.extrato.banco && <>Banco {lido.extrato.banco} · </>}
                        {lido.extrato.agencia && <>agência {lido.extrato.agencia} · </>}
                        {lido.extrato.conta && <>conta {lido.extrato.conta} · </>}
                        período {data(lido.extrato.inicio)} a {data(lido.extrato.fim)}
                      </p>
                      {lido.extrato.saldo !== null && (
                        <p className="text-xs text-slate-500">
                          Saldo informado pelo banco: {moeda(lido.extrato.saldo)} em {data(lido.extrato.saldoEm)}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        {[
                          plural(lido.previa.length, "movimentação lida", "movimentações lidas"),
                          plural(contagem("nova"), "nova", "novas"),
                          plural(contagem("existente"), "já importada", "já importadas"),
                          contagem("parecida") > 0 && plural(contagem("parecida"), "parecida", "parecidas"),
                          contagem("repetida") > 0 && plural(contagem("repetida"), "repetida no arquivo", "repetidas no arquivo"),
                          lido.extrato.erros.length > 0 && `${lido.extrato.erros.length} com erro`,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        .
                      </p>
                    </div>

                    {lido.jaImportadoEm && (
                      <Alerta>
                        Este mesmo arquivo já foi importado nesta conta em {new Date(lido.jaImportadoEm).toLocaleString("pt-BR")}. O que já existe
                        não é gravado de novo.
                      </Alerta>
                    )}
                    {lido.contaDiferente && (
                      <Alerta>
                        A conta do arquivo ({lido.extrato.conta}) é diferente da usada nas importações anteriores desta conta de caixa (
                        {lido.contaDiferente}). Confira se escolheu a conta de caixa certa.
                      </Alerta>
                    )}
                    {lido.extrato.erros.length > 0 && (
                      <Alerta>
                        <span className="block font-medium">Linhas do arquivo que não foram lidas</span>
                        {lido.extrato.erros.map((x) => (
                          <span key={x.posicao} className="block text-xs">
                            Movimentação {x.posicao}: {x.motivo}. <span className="text-amber-700">{x.trecho}</span>
                          </span>
                        ))}
                      </Alerta>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className={t.tabela}>
                        <thead className={t.cabeca}>
                          <tr>
                            <th className={t.th}>
                              <input
                                type="checkbox"
                                aria-label="Marcar todas as novas e parecidas"
                                checked={marcaveis.length > 0 && marcaveis.every((p) => marcadas.has(p.chave))}
                                onChange={(e) => setMarcadas(new Set(e.target.checked ? marcaveis.map((p) => p.chave) : []))}
                              />
                            </th>
                            <th className={t.th}>Data</th>
                            <th className={t.th}>Descrição</th>
                            <th className={`${t.th} text-right`}>Valor</th>
                            <th className={t.th}>Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lido.previa.map((p, i) => {
                            const e = ESTADOS[p.estado];
                            const marcavel = p.estado === "nova" || p.estado === "parecida";
                            return (
                              <tr key={`${p.chave}-${i}`} className={cx(t.linha, !marcavel && "text-slate-400")}>
                                <td className={t.td}>
                                  <input
                                    type="checkbox"
                                    aria-label={`Importar ${p.descricao}`}
                                    disabled={!marcavel}
                                    checked={marcadas.has(p.chave) && marcavel}
                                    onChange={(ev) =>
                                      setMarcadas((m) => {
                                        const n = new Set(m);
                                        if (ev.target.checked) n.add(p.chave);
                                        else n.delete(p.chave);
                                        return n;
                                      })
                                    }
                                  />
                                </td>
                                <td className={`${t.td} whitespace-nowrap`}>{data(p.data)}</td>
                                <td className={t.td}>
                                  {p.descricao}
                                  {p.documento && <span className="text-xs text-slate-500"> · {p.documento}</span>}
                                </td>
                                <td className={cx(t.td, "whitespace-nowrap text-right tabular-nums", marcavel && (p.centavos > 0 ? "text-emerald-700" : "text-red-700"))}>
                                  {moeda(p.centavos)}
                                </td>
                                <td className={t.td} title={e.dica}>
                                  <Etiqueta tom={e.tom}>{e.rotulo}</Etiqueta>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500">
              {resumo ? "" : lido ? `${[...marcadas].filter((c) => marcaveis.some((p) => p.chave === c)).length} marcadas para importar` : "Importar não cria lançamentos nem muda saldos."}
            </p>
            {resumo ? (
              <Botao type="button" onClick={() => dialogo.current?.close()}>
                Fechar
              </Botao>
            ) : (
              <Botao type="button" onClick={importar} disabled={!lido || ocupado}>
                {ocupado && lido ? "Importando…" : "Importar marcadas"}
              </Botao>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
