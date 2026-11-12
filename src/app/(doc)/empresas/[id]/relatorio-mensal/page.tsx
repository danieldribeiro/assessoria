import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { GraficoMensal } from "@/components/graficos";
import { cx } from "@/components/ui";
import { perfilAtual } from "@/lib/central";
import { carregarAssessoria } from "@/lib/consultas";
import { formatarData, formatarValor, hoje } from "@/lib/datas";
import { itensContas } from "@/lib/financeiro/apagar";
import {
  carregarBaseFinanceira,
  carregarFaturas,
  carregarFaturasPorId,
  carregarLancamentos,
  carregarPrevistos,
  carregarPrimeiroRealizado,
  carregarSaldos,
} from "@/lib/financeiro/consultas";
import { diaAnterior, ultimoDiaDoMes } from "@/lib/financeiro/fluxo";
import {
  despesasPorContraparte,
  montarDre,
  parcelas,
  resumir,
  seriesMensais,
  variacao,
  type LinhaDre,
} from "@/lib/financeiro/painel";
import { somarDiasData, somarMeses } from "@/lib/financeiro/periodo";
import { DIAS_MEDIA, HORIZONTES, janelaMedia, operacaoDaJanela, projetarDiario, resumirProjecao } from "@/lib/financeiro/projecao";
import {
  altasDeDespesa,
  blocosDaEmpresa,
  caixaDoMes,
  custosReferencia,
  despesasPorGrupo,
  dozeMeses,
  mesDoRelatorio,
  mesesComDados,
  previstosNoMes,
  principaisGrupos,
  proximos,
  type IdBloco,
  type LinhaReferencia,
  type SaldoAcumulado,
} from "@/lib/financeiro/relatorio-mensal";
import { BlocoRelatorio, Folha, Montagem, NotaExtra, Recado, VersaoDre, type OpcaoBloco } from "./montagem";

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const curtoMes = (iso: string) => `${NOMES_MES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}/${iso.slice(2, 4)}`;
const moeda = (v: number) => formatarValor(v, "R$")!;
const numero = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valor = (v: number) => (Math.round(v * 100) === 0 ? "0,00" : numero.format(v).replace("-", "−"));
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export async function generateMetadata({ params }: PageProps<"/empresas/[id]/relatorio-mensal">) {
  const { id } = await params;
  if ((await perfilAtual())?.papel !== "equipe") return { title: "Relatório do mês" };
  const { empresa } = await carregarBaseFinanceira(id);
  return { title: `Relatório do mês · ${empresa.nome}` };
}

export default async function RelatorioMensal({ params, searchParams }: PageProps<"/empresas/[id]/relatorio-mensal">) {
  const { id } = await params;
  const busca = await searchParams;
  // Nesta etapa só a equipe monta o relatório; publicar na central é a etapa B.
  if ((await perfilAtual())?.papel !== "equipe") redirect("/central");

  const dia = hoje();
  const mes = mesDoRelatorio(typeof busca.mes === "string" ? busca.mes : undefined, dia);
  const inicio = `${mes}-01`;
  const fim = ultimoDiaDoMes(mes);
  const mesAnterior = somarMeses(mes, -1);
  const meses12 = dozeMeses(mes);
  const horizonteMaximo = somarDiasData(dia, Math.max(...HORIZONTES));
  const janela = janelaMedia(dia);

  const [dados, assessoria] = await Promise.all([carregarBaseFinanceira(id), carregarAssessoria()]);
  const { empresa, contas, caixas, contrapartes, cartoes, recursos } = dados;

  const [lancamentos, saldosAntes, saldosFim, previstos, saldosHoje, realizadosJanela, primeiro, faturasMes] = await Promise.all([
    carregarLancamentos(id, meses12[0], fim, "competencia"),
    carregarSaldos(id, diaAnterior(inicio)),
    carregarSaldos(id, fim),
    carregarPrevistos(id, horizonteMaximo),
    carregarSaldos(id, dia),
    carregarLancamentos(id, janela.inicio, janela.fim),
    carregarPrimeiroRealizado(id),
    recursos.cartoes ? carregarFaturas(id, inicio, fim) : Promise.resolve([]),
  ]);
  const idsFaturas = recursos.cartoes ? [...new Set(previstos.map((l) => l.fatura_id).filter((f): f is string => !!f))] : [];
  const faturasAbertas = await carregarFaturasPorId(id, idsFaturas);

  // --- Números ------------------------------------------------------------------------------------------------
  const todas = parcelas(lancamentos, contas, "competencia", {}, meses12[0], fim);
  const doMes = todas.filter((p) => p.mes === inicio);
  const doAnterior = todas.filter((p) => p.mes === `${mesAnterior}-01`);
  const r = resumir(doMes);
  const ra = resumir(doAnterior);
  const caixa = caixaDoMes(saldosAntes as SaldoAcumulado[], saldosFim as SaldoAcumulado[]);
  const dre = montarDre([...doAnterior, ...doMes], [`${mesAnterior}-01`, inicio], contas);
  const serie = seriesMensais(todas, meses12);
  const comDados = mesesComDados(todas);
  const grupos = principaisGrupos(despesasPorGrupo(doMes, contas), 5);
  const totalGrupos = grupos.reduce((a, g) => a + g.centavos, 0);
  const fornecedores = recursos.fornecedores
    ? despesasPorContraparte(doMes, new Map(contrapartes.map((c) => [c.id, c.nome])), 5).filter((f) => f.id !== "sem" && !f.nome.startsWith("Outros"))
    : [];
  const altas = altasDeDespesa(todas, contas, mes);
  const previstosMes = previstosNoMes(todas, mes);
  const referencia = custosReferencia(doMes, contas, r.faturamento);
  const clinica = (empresa.segmento ?? "").trim().toLowerCase() === "odontologia";
  const acimaDaReferencia = clinica && r.faturamento > 0 ? [...referencia.linhas, referencia.total].filter((l) => l.situacao === "acima") : [];

  const itens = itensContas(previstos, faturasAbertas);
  const prox = proximos(itens, dia);
  const saldoHoje = saldosHoje.reduce((a, s) => a + (s.saldo ?? 0), 0);
  const operacao28 = operacaoDaJanela(realizadosJanela, contas, primeiro, dia);
  const projecoes = HORIZONTES.map((h) => ({ horizonte: h, ...resumirProjecao(saldoHoje, itens, dia, somarDiasData(dia, h), operacao28) }));
  const menor30 = Math.min(...projetarDiario(saldoHoje, itens, dia, 30, operacao28).map((p) => p.comOperacao ?? p.soContas));

  const cartoesAtivos = cartoes.filter((c) => c.ativo);
  const linhasCartao = cartoesAtivos.map((c) => {
    const pagas = faturasMes.filter((f) => f.cartao_id === c.id && f.situacao === "paga" && f.data_pagamento && f.data_pagamento >= inicio && f.data_pagamento <= fim);
    const proxima = itens
      .filter((i) => i.tipo === "fatura" && i.fatura.cartao_id === c.id)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    return { cartao: c, pago: pagas.reduce((a, f) => a + Math.round((f.valor_pago ?? 0) * 100), 0) / 100, proxima };
  });

  // --- O que cada bloco tem para mostrar ------------------------------------------------------------------------
  const prejuizo = r.resultadoOperacional < 0;
  const temAtencao = prejuizo || acimaDaReferencia.length > 0 || prox.quantasVencidas > 0 || menor30 < 0 || altas.length > 0;
  const disponivel: Partial<Record<IdBloco, { ok: boolean; motivo?: string }>> = {
    recado: { ok: true },
    atencao: { ok: temAtencao, motivo: "nada a apontar neste mês." },
    meses: { ok: meses12.filter((m) => comDados.has(m)).length >= 3, motivo: "menos de 3 meses com lançamentos." },
    grupos: { ok: grupos.length > 0, motivo: "nenhuma despesa no mês." },
    referencias: { ok: r.faturamento > 0, motivo: "sem faturamento no mês." },
    fornecedores: {
      ok: fornecedores.length > 0,
      motivo: recursos.fornecedores ? "nenhuma despesa do mês tem fornecedor." : "cadastro de fornecedores ainda não instalado.",
    },
    proximos: { ok: prox.pagar + prox.receber + prox.vencidas > 0, motivo: "nenhuma conta prevista para os próximos 30 dias." },
    projecao: {
      ok: operacao28 !== null,
      motivo: primeiro ? `aparece a partir de ${formatarData(somarDiasData(primeiro, DIAS_MEDIA))}.` : "ainda não há lançamentos realizados.",
    },
    cartoes: { ok: recursos.cartoes && cartoesAtivos.length > 0, motivo: "a empresa não tem cartão cadastrado." },
  };
  const opcoes: OpcaoBloco[] = blocosDaEmpresa(empresa.segmento).map((b) => ({
    ...b,
    disponivel: disponivel[b.id]?.ok ?? true,
    motivo: disponivel[b.id]?.motivo,
  }));
  const mostraProjecao = disponivel.projecao!.ok;
  const ligadoReferencia = disponivel.referencias!.ok;

  const opcoesMes = Array.from({ length: 24 }, (_, i) => somarMeses(dia.slice(0, 7), -i)).map((m) => ({ valor: m, rotulo: nomeMes(m) }));
  const nomeAssessoria = assessoria?.nome_fantasia || assessoria?.razao_social || "Assessoria";
  const vazio = contas.length === 0 || caixas.length === 0;

  const cabecalho = (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-3">
      {assessoria?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assessoria.logo_url} alt={nomeAssessoria} className="h-9 max-w-40 object-contain" />
      ) : (
        <span className="text-sm font-semibold tracking-wide text-slate-900">{nomeAssessoria}</span>
      )}
      <span className="text-right text-sm text-slate-600">
        {empresa.nome} · {nomeMes(mes)}
      </span>
    </header>
  );

  const rodape = (folha: string) => (
    <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
      <span>{folha}</span>
      <span>Gerado em {formatarData(dia)}</span>
    </footer>
  );

  return (
    <Montagem empresaId={empresa.id} mes={mes} meses={opcoesMes} opcoes={opcoes} voltar={`/empresas/${empresa.id}/financeiro`}>
      {vazio ? (
        <Folha primeira>
          <p className="text-sm text-slate-600">
            O financeiro desta empresa ainda não tem {contas.length === 0 ? "plano de contas" : "contas de caixa"}. O relatório do mês sai
            depois que os lançamentos começarem.
          </p>
        </Folha>
      ) : (
        <>
          {/* Folha 1: resumo */}
          <Folha primeira>
            <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-4">
              {assessoria?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assessoria.logo_url} alt={nomeAssessoria} className="h-11 max-w-48 object-contain" />
              ) : (
                <span className="text-base font-semibold tracking-wide text-slate-900">{nomeAssessoria}</span>
              )}
              <div className="text-right">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">{empresa.nome}</h1>
                <p className="text-sm text-slate-600">Relatório de {nomeMes(mes)}</p>
              </div>
            </header>

            <BlocoRelatorio id="numeros">
              <Titulo>O mês em quatro números</Titulo>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
                <Numero rotulo="Faturamento" valor={r.faturamento} anterior={ra.faturamento} mesAnterior={mesAnterior} />
                <Numero rotulo="Despesas" valor={r.despesas} anterior={ra.despesas} mesAnterior={mesAnterior} subirEhBom={false} />
                <Numero
                  rotulo="Resultado operacional"
                  valor={r.resultadoOperacional}
                  anterior={ra.resultadoOperacional}
                  mesAnterior={mesAnterior}
                  extra={r.faturamento > 0 ? `${pct.format(r.resultadoOperacional / r.faturamento)} do faturamento` : undefined}
                />
                <Numero rotulo={`Saldo em caixa em ${formatarData(fim).slice(0, 5)}`} valor={caixa.total.final} anterior={caixa.total.inicial} textoAnterior="no mês" />
              </div>
            </BlocoRelatorio>

            <Recado />

            <BlocoRelatorio id="atencao">
              <Titulo>Pontos de atenção</Titulo>
              <ul className="space-y-1.5 text-sm text-slate-800">
                {prejuizo && (
                  <Ponto grave>
                    Resultado operacional negativo: as despesas passaram o faturamento em{" "}
                    <strong className="tabular-nums">{moeda(-r.resultadoOperacional)}</strong>.
                  </Ponto>
                )}
                {acimaDaReferencia.map((l) => (
                  <Ponto grave key={l.id}>
                    {l.nome}: <strong className="tabular-nums">{pct.format(l.percentual!)}</strong> do faturamento, acima da referência da
                    assessoria ({faixa(l)}).
                  </Ponto>
                ))}
                {prox.quantasVencidas > 0 && (
                  <Ponto grave>
                    {prox.quantasVencidas === 1 ? "1 conta vencida e não paga" : `${prox.quantasVencidas} contas vencidas e não pagas`}:{" "}
                    <strong className="tabular-nums">{moeda(prox.vencidas)}</strong> (situação em {formatarData(dia)}).
                  </Ponto>
                )}
                {menor30 < 0 && (
                  <Ponto grave>
                    O saldo projetado fica negativo nos próximos 30 dias, chegando a <strong className="tabular-nums">{moeda(menor30)}</strong>.
                  </Ponto>
                )}
                {altas.map((a) => (
                  <Ponto key={a.nome}>
                    {a.nome}: <strong className="tabular-nums">{moeda(a.atual)}</strong>,{" "}
                    <strong>{pct.format(a.percentual)}</strong> acima da média dos 3 meses anteriores ({moeda(a.media)}).
                  </Ponto>
                ))}
              </ul>
            </BlocoRelatorio>

            <BlocoRelatorio id="meses">
              <Titulo>Últimos 12 meses</Titulo>
              <GraficoMensal
                descricao="Faturamento e despesas dos últimos 12 meses"
                rotulos={serie.map((s) => curtoMes(s.mes))}
                series={[
                  { nome: "Faturamento", forma: "coluna", cor: 1, valores: serie.map((s) => s.faturamento) },
                  { nome: "Despesas", forma: "coluna", cor: 2, valores: serie.map((s) => s.despesas) },
                ]}
              />
            </BlocoRelatorio>

            {rodape("Visão por competência: o mês em que a receita ou a despesa aconteceu, com previstos e realizados.")}
          </Folha>

          {/* Folha 2: resultado */}
          <Folha>
            {cabecalho}
            <BlocoRelatorio id="dre">
              <Titulo>Resultado do mês (DRE)</Titulo>
              <VersaoDre aberta={false}>
                <TabelaDre linhas={dre.linhas} mesAnterior={mesAnterior} mes={mes} faturamento={r.faturamento} aberta={false} />
              </VersaoDre>
              <VersaoDre aberta>
                <TabelaDre linhas={dre.linhas} mesAnterior={mesAnterior} mes={mes} faturamento={r.faturamento} aberta />
              </VersaoDre>
            </BlocoRelatorio>

            <BlocoRelatorio id="grupos">
              <Titulo>Para onde foi o dinheiro</Titulo>
              <div className="grid items-center gap-6 sm:grid-cols-[11rem_minmax(0,1fr)] print:grid-cols-[11rem_minmax(0,1fr)]">
                <Rosca
                  fatias={grupos.map((g) => g.centavos)}
                  centro={`R$ ${compacto.format(totalGrupos / 100)}`}
                  legenda="em despesas"
                />
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-3 font-medium">Grupo</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Valor</th>
                      <th className="py-1.5 pr-3 text-right font-medium">% das despesas</th>
                      <th className="py-1.5 text-right font-medium">% do fat.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g, i) => (
                      <tr key={g.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-3 text-slate-800">
                          <span className="flex items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: corFatia(i, grupos.length), printColorAdjust: "exact" }} />
                            <span className="min-w-0 truncate" title={g.nome}>
                              {g.nome}
                            </span>
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-900">{valor(g.centavos / 100)}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">{pct.format(totalGrupos ? g.centavos / totalGrupos : 0)}</td>
                        <td className="py-1.5 text-right text-slate-600">{r.faturamento > 0 ? pct.format(g.centavos / 100 / r.faturamento) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlocoRelatorio>

            <BlocoRelatorio id="referencias">
              <Titulo>Custos x referência da assessoria</Titulo>
              <ul className="space-y-2.5">
                {[...referencia.linhas, referencia.total].map((l) => (
                  <BarraReferencia key={l.id} linha={l} destaque={l.id === "total"} />
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Em % do faturamento do mês. A faixa sombreada é a referência da assessoria para clínicas odontológicas. Pró-labore dos sócios
                não entra; o custo total não inclui deduções nem tributos sobre o faturamento.
              </p>
            </BlocoRelatorio>

            <BlocoRelatorio id="fornecedores">
              <Titulo>Maiores fornecedores</Titulo>
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {fornecedores.map((f) => (
                    <tr key={f.id ?? f.nome} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 text-slate-700">{f.nome}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-900">{valor(f.valor)}</td>
                      <td className="py-1.5 text-right text-xs text-slate-500">{r.faturamento > 0 ? `${pct.format(f.valor / r.faturamento)} do fat.` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BlocoRelatorio>
            {rodape("Valores em reais. Despesas = deduções, tributos sobre o faturamento, custos e despesas variáveis e despesas operacionais.")}
          </Folha>

          {/* Folha 3: caixa e notas */}
          <Folha>
            {cabecalho}
            <BlocoRelatorio id="caixa">
              <Titulo>Dinheiro em caixa no mês</Titulo>
              <TabelaCaixa caixa={caixa} inicio={inicio} fim={fim} />
              <p className="mt-2 text-xs text-slate-500">Só o que foi pago ou recebido de verdade, pela data do pagamento.</p>
            </BlocoRelatorio>

            <div className="grid gap-7 md:grid-cols-2 print:grid-cols-2">
              <BlocoRelatorio id="proximos">
                <Titulo>Próximos 30 dias</Titulo>
                <table className="w-full text-sm tabular-nums">
                  <tbody>
                    <Linha rotulo="A receber" valor={prox.receber} />
                    <Linha rotulo="A pagar" valor={-prox.pagar} />
                    {prox.quantasVencidas > 0 && <Linha rotulo="Já vencidas, a pagar" valor={-prox.vencidas} />}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-500">
                  Contas lançadas como previstas, de {formatarData(dia)} a {formatarData(prox.ate)}.
                </p>
              </BlocoRelatorio>

              <BlocoRelatorio id="projecao">
                <Titulo>Saldo projetado</Titulo>
                <table className="w-full text-sm tabular-nums">
                  <tbody>
                    <Linha rotulo={`Hoje, ${formatarData(dia)}`} valor={saldoHoje} />
                    {projecoes.map((p) => (
                      <Linha key={p.horizonte} rotulo={`Em ${p.horizonte} dias (${formatarData(p.ate)})`} valor={p.projetado ?? p.soContas} />
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-500">Contas previstas mais a média de vendas e custos variáveis dos últimos {DIAS_MEDIA} dias.</p>
              </BlocoRelatorio>
            </div>

            <BlocoRelatorio id="cartoes">
              <Titulo>Cartões de crédito</Titulo>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">Cartão</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Pago em {NOMES_MES[Number(mes.slice(5, 7)) - 1]}</th>
                    <th className="py-1.5 text-right font-medium">Próxima fatura</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasCartao.map((l) => (
                    <tr key={l.cartao.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 text-slate-700">{l.cartao.nome}</td>
                      <td className="py-1.5 pr-3 text-right">{valor(l.pago)}</td>
                      <td className="py-1.5 text-right">{l.proxima ? `${valor(l.proxima.valor)} · vence ${formatarData(l.proxima.vencimento)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BlocoRelatorio>

            <BlocoRelatorio id="notas" className="text-xs text-slate-600">
              <Titulo>Notas sobre os números</Titulo>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  O resultado (DRE) é pela competência: conta cada receita e despesa no mês em que aconteceu, mesmo que o pagamento seja em outro
                  mês. O caixa é pela data do pagamento.
                </li>
                {(previstosMes.receitas > 0 || previstosMes.despesas > 0) && (
                  <li>
                    O resultado de {NOMES_MES[Number(mes.slice(5, 7)) - 1]} inclui lançamentos previstos que ainda não foram pagos ou recebidos
                    {previstosMes.receitas > 0 && `: ${moeda(previstosMes.receitas)} em receitas`}
                    {previstosMes.despesas > 0 && `${previstosMes.receitas > 0 ? " e" : ":"} ${moeda(previstosMes.despesas)} em despesas`}.
                  </li>
                )}
                <li>Transferências entre contas da própria empresa, investimentos, empréstimos e retiradas dos sócios não entram como receita nem como despesa.</li>
                <li>
                  Vendas no cartão: pelo valor bruto, com a taxa da maquininha separada, quando há o relatório da operadora; sem ele, pelo valor
                  líquido que caiu no banco. A taxa nunca é estimada.
                </li>
                {clinica && ligadoReferencia && (
                  <li>
                    A referência de custos é da assessoria, a partir de faixas usadas por consultorias odontológicas. Não é uma média oficial do
                    setor no Brasil.
                  </li>
                )}
                {mostraProjecao && <li>O saldo projetado é uma estimativa, não uma garantia.</li>}
                <li>Contas a pagar, vencidas e projeção mostram a situação em {formatarData(dia)}, quando este relatório foi gerado.</li>
                <NotaExtra />
              </ol>
            </BlocoRelatorio>
            {rodape(`${nomeAssessoria} · relatório gerencial, não substitui as demonstrações do contador.`)}
          </Folha>
        </>
      )}
    </Montagem>
  );
}

// Cores das fatias: as quatro do sistema de gráficos, mais duas; "Outras" (a última, quando existe) sempre em cinza.
const CORES_FATIA = ["var(--grafico-1)", "var(--grafico-2)", "var(--grafico-3)", "var(--grafico-4)", "var(--grafico-5)"];
function corFatia(i: number, total: number) {
  return i === total - 1 && total > CORES_FATIA.length ? "var(--grafico-outras)" : CORES_FATIA[i % CORES_FATIA.length];
}

// Gráfico de rosca em SVG, desenhado no servidor (sai igual na tela e no PDF).
function Rosca({ fatias, centro, legenda }: { fatias: number[]; centro: string; legenda: string }) {
  const total = fatias.reduce((a, b) => a + b, 0);
  const raio = 42;
  const volta = 2 * Math.PI * raio;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="Distribuição das despesas por grupo" className="mx-auto w-full max-w-44">
      <circle cx="60" cy="60" r={raio} fill="none" stroke="var(--grafico-grade)" strokeWidth="16" />
      {total > 0 &&
        fatias.map((v, i) => {
          const tamanho = (v / total) * volta;
          const el = (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={raio}
              fill="none"
              stroke={corFatia(i, fatias.length)}
              strokeWidth="16"
              strokeDasharray={`${Math.max(0, tamanho - 1)} ${volta}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 60 60)"
              style={{ printColorAdjust: "exact" }}
            />
          );
          acumulado += tamanho;
          return el;
        })}
      <text x="60" y="58" textAnchor="middle" className="fill-slate-900 text-[10px] font-semibold tabular-nums">
        {centro}
      </text>
      <text x="60" y="71" textAnchor="middle" className="fill-slate-500 text-[7.5px]">
        {legenda}
      </text>
    </svg>
  );
}

const pct0 = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const faixa = (l: { min: number; max: number }) => `${pct0.format(l.min).replace("%", "")} a ${pct0.format(l.max)}`;

const SITUACAO: Record<LinhaReferencia["situacao"], { texto: string; classe: string; cor: string }> = {
  acima: { texto: "Acima", classe: "bg-red-50 text-red-700 ring-red-200", cor: "var(--grafico-negativo)" },
  dentro: { texto: "Na faixa", classe: "bg-emerald-50 text-emerald-700 ring-emerald-200", cor: "var(--grafico-3)" },
  abaixo: { texto: "Abaixo", classe: "bg-slate-100 text-slate-700 ring-slate-200", cor: "var(--grafico-1)" },
  sem_faturamento: { texto: "—", classe: "bg-slate-100 text-slate-500 ring-slate-200", cor: "var(--grafico-outras)" },
};

// Barra com a faixa de referência sombreada e um ponto no valor do mês.
function BarraReferencia({ linha: l, destaque }: { linha: LinhaReferencia; destaque?: boolean }) {
  const p = l.percentual ?? 0;
  const escala = Math.max(l.max * 1.6, p * 1.1, 0.01);
  const x = (v: number) => `${Math.min(100, (v / escala) * 100)}%`;
  const s = SITUACAO[l.situacao];
  return (
    <li className={cx("grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm", destaque && "border-t border-slate-200 pt-2.5 font-medium")}>
      <span className="truncate text-slate-800">{l.nome}</span>
      <span className="relative h-3 rounded-full bg-slate-100" style={{ printColorAdjust: "exact" }}>
        <span
          className="absolute inset-y-0 rounded-full"
          style={{ left: x(l.min), width: `calc(${x(l.max)} - ${x(l.min)})`, background: "color-mix(in srgb, var(--grafico-3) 28%, transparent)", printColorAdjust: "exact" }}
        />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--color-superficie)]"
          style={{ left: x(p), background: s.cor, printColorAdjust: "exact" }}
        />
      </span>
      <span className="flex items-center justify-end gap-2 tabular-nums">
        <span className="w-12 text-right text-slate-900">{l.percentual === null ? "—" : pct.format(p)}</span>
        <span className="w-20 text-right text-xs text-slate-500">ref. {faixa(l)}</span>
        <span className={cx("w-16 rounded-full px-2 py-0.5 text-center text-xs font-medium ring-1 ring-inset", s.classe)}>{s.texto}</span>
      </span>
    </li>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-slate-900">{children}</h2>;
}

function Numero({
  rotulo,
  valor: v,
  anterior,
  mesAnterior,
  textoAnterior,
  subirEhBom = true,
  extra,
}: {
  rotulo: string;
  valor: number;
  anterior: number;
  mesAnterior?: string;
  textoAnterior?: string;
  subirEhBom?: boolean;
  extra?: string;
}) {
  const { diferenca, percentual } = variacao(v, anterior);
  const sobe = diferenca > 0;
  const bom = diferenca === 0 ? null : sobe === subirEhBom;
  const comparacao = textoAnterior ?? `vs ${NOMES_MES[Number(mesAnterior!.slice(5, 7)) - 1]}`;
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={cx("mt-0.5 text-lg font-semibold tabular-nums", v < 0 ? "text-red-700" : "text-slate-900")}>{moeda(v)}</p>
      <p className="text-xs text-slate-600">
        {diferenca === 0 ? (
          `igual ${textoAnterior ? "no início do mês" : comparacao.replace("vs ", "a ")}`
        ) : (
          <>
            <span className={cx("font-medium", bom ? "text-emerald-700" : "text-red-700")}>
              {sobe ? "▲" : "▼"} {textoAnterior || percentual === null ? moeda(Math.abs(diferenca)) : pct.format(Math.abs(percentual))}
            </span>{" "}
            {comparacao}
          </>
        )}
      </p>
      {extra && <p className="text-xs text-slate-500">{extra}</p>}
    </div>
  );
}

function Ponto({ grave, children }: { grave?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className={cx("size-2 shrink-0 translate-y-[-1px] rounded-full", grave ? "bg-red-500" : "bg-amber-500")} style={{ printColorAdjust: "exact" }} />
      <span>{children}</span>
    </li>
  );
}

function Linha({ rotulo, valor: v }: { rotulo: string; valor: number }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1.5 pr-3 text-slate-700">{rotulo}</td>
      <td className={cx("py-1.5 text-right", v < 0 ? "text-red-700" : "text-slate-900")}>{valor(v)}</td>
    </tr>
  );
}

function TabelaDre({
  linhas,
  mes,
  mesAnterior,
  faturamento,
  aberta,
}: {
  linhas: LinhaDre[];
  mes: string;
  mesAnterior: string;
  faturamento: number;
  aberta: boolean;
}) {
  const parte = (v: number) => (faturamento ? pct.format(Math.abs(v) / faturamento) : "—");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3 font-medium">Linha</th>
            <th className="py-1.5 pr-3 text-right font-medium">{NOMES_MES[Number(mes.slice(5, 7)) - 1]}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{NOMES_MES[Number(mesAnterior.slice(5, 7)) - 1]}</th>
            <th className="py-1.5 text-right font-medium">% do fat.</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const final = l.numero === 12;
            return (
              <FragmentoDre key={l.numero}>
                <tr
                  className={cx(
                    "border-b border-slate-100",
                    l.calculada && "bg-slate-50 font-semibold",
                    final && "border-t-2 border-t-slate-900 bg-transparent",
                  )}
                >
                  <td className="py-1.5 pr-3 text-slate-800">
                    {l.numero}. {l.nome}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{valor(l.valores[1])}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-600">{valor(l.valores[0])}</td>
                  <td className="py-1.5 text-right text-slate-600">{parte(l.valores[1])}</td>
                </tr>
                {aberta &&
                  !l.calculada &&
                  l.itens.flatMap((item) => {
                    const linha = (id: string, nome: string, v: number[], recuo: string, forte = false) => (
                      <tr key={id} className="border-b border-slate-50 text-xs">
                        <td className={cx("py-1 pr-3 text-slate-600", recuo, forte && "font-medium text-slate-700")}>{nome}</td>
                        <td className="py-1 pr-3 text-right text-slate-700">{valor(v[1])}</td>
                        <td className="py-1 pr-3 text-right text-slate-500">{valor(v[0])}</td>
                        <td className="py-1 text-right text-slate-500">{parte(v[1])}</td>
                      </tr>
                    );
                    return item.tipo === "subgrupo"
                      ? [linha(item.id, item.nome, item.valores, "pl-4", true), ...item.contas.map((c) => linha(c.id, c.nome, c.valores, "pl-8"))]
                      : [linha(item.id, item.nome, item.valores, "pl-4")];
                  })}
              </FragmentoDre>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentoDre({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function TabelaCaixa({ caixa, inicio, fim }: { caixa: ReturnType<typeof caixaDoMes>; inicio: string; fim: string }) {
  const comTransferencias = caixa.linhas.some((l) => Math.round(l.transferencias * 100) !== 0);
  const linhas = caixa.linhas.length > 1 ? [...caixa.linhas, caixa.total] : caixa.linhas;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3 font-medium">Conta</th>
            <th className="py-1.5 pr-3 text-right font-medium">Saldo {formatarData(inicio).slice(0, 5)}</th>
            <th className="py-1.5 pr-3 text-right font-medium">Entradas</th>
            <th className="py-1.5 pr-3 text-right font-medium">Saídas</th>
            {comTransferencias && <th className="py-1.5 pr-3 text-right font-medium">Transferências</th>}
            <th className="py-1.5 text-right font-medium">Saldo {formatarData(fim).slice(0, 5)}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className={cx("border-b border-slate-100", l.id === "total" && "border-t-2 border-t-slate-900 font-semibold")}>
              <td className="py-1.5 pr-3 text-slate-800">{l.nome}</td>
              <td className="py-1.5 pr-3 text-right">{valor(l.inicial)}</td>
              <td className="py-1.5 pr-3 text-right">{valor(l.entradas)}</td>
              <td className="py-1.5 pr-3 text-right">{valor(-l.saidas)}</td>
              {comTransferencias && <td className="py-1.5 pr-3 text-right">{valor(l.transferencias)}</td>}
              <td className="py-1.5 text-right">{valor(l.final)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {comTransferencias && <p className="mt-1 text-xs text-slate-500">Transferências: dinheiro que passou de uma conta da empresa para outra.</p>}
    </div>
  );
}
