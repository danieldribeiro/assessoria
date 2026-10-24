import { AlertTriangle, CalendarClock, ChevronRight, CircleCheck, CreditCard } from "lucide-react";
import Link from "next/link";
import { PainelLateral } from "@/components/painel-lateral";
import { CabecalhoCartao, Cartao, Etiqueta, Vazio, classeBotao, cx, classeTabela as t } from "@/components/ui";
import { formatarData, formatarMes, formatarValor, hoje } from "@/lib/datas";
import { agruparContas, diasDeAtraso, limiteContas, MESES_A_FRENTE, type ChaveGrupo, type ItemConta } from "@/lib/financeiro/apagar";
import { carregarFaturasPorId, carregarPrevistos } from "@/lib/financeiro/consultas";
import { somarDiasData } from "@/lib/financeiro/periodo";
import type { Cartao as CartaoCredito, ContaCaixa, ContaPlano, Contraparte } from "@/lib/financeiro/dominio";
import { liquidarLancamento } from "@/server/financeiro";
import { CamposLiquidacao } from "./campos";

const moeda = (v: number) => formatarValor(v, "R$")!;

function tituloGrupo(chave: ChaveGrupo, dia: string) {
  if (chave === "vencidas") return "Vencidas";
  if (chave === "semana") return "Próximos 7 dias";
  if (chave === "mes") return `Até o fim de ${formatarMes(dia)}`;
  return formatarMes(chave.slice(4));
}

// Contas a pagar e a receber: os previstos por vencimento, dos vencidos até MESES_A_FRENTE meses à frente.
export async function AbaAPagar({
  empresa,
  contas,
  caixas,
  contrapartes,
  cartoes,
  recursos,
}: {
  empresa: { id: string };
  contas: ContaPlano[];
  caixas: ContaCaixa[];
  contrapartes: Contraparte[];
  cartoes: CartaoCredito[];
  recursos: { cartoes: boolean };
}) {
  const dia = hoje();
  const previstos = await carregarPrevistos(empresa.id, limiteContas(dia));
  const idsFaturas = recursos.cartoes ? [...new Set(previstos.map((l) => l.fatura_id).filter((id): id is string => !!id))] : [];
  const faturas = await carregarFaturasPorId(empresa.id, idsFaturas);
  const grupos = agruparContas(previstos, faturas, dia);

  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
  const nomeCaixa = new Map(caixas.map((c) => [c.id, c.nome]));
  const nomeContraparte = new Map(contrapartes.map((c) => [c.id, c.nome]));
  const cartaoPorId = new Map(cartoes.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        Lançamentos previstos, pela data de vencimento, até {formatarData(limiteContas(dia))} ({MESES_A_FRENTE} meses à frente).
        Compras no cartão aparecem pela fatura, com o total e o vencimento dela. Nada daqui entra no saldo de caixa até ser
        marcado como realizado.
      </p>

      {grupos.length === 0 ? (
        <Cartao>
          <Vazio icone={<CalendarClock />}>
            Nenhuma conta prevista. Contas a pagar e a receber aparecem aqui quando um lançamento é registrado como previsto.
          </Vazio>
        </Cartao>
      ) : (
        grupos.map((g) => (
          <Cartao key={g.chave} className={cx(g.chave === "vencidas" && "border-red-200")}>
            <CabecalhoCartao titulo={tituloGrupo(g.chave, dia)} contagem={g.itens.length}>
              <span className="text-xs text-slate-500">
                {g.pagar > 0 && (
                  <>
                    a pagar <span className="font-medium tabular-nums text-red-700">{moeda(g.pagar)}</span>
                  </>
                )}
                {g.pagar > 0 && g.receber > 0 && " · "}
                {g.receber > 0 && (
                  <>
                    a receber <span className="font-medium tabular-nums text-emerald-700">{moeda(g.receber)}</span>
                  </>
                )}
              </span>
            </CabecalhoCartao>
            <div className="overflow-x-auto">
              <table className={t.tabela}>
                <thead className={t.cabeca}>
                  <tr>
                    <th className={t.th}>Vencimento</th>
                    <th className={t.th}>Descrição</th>
                    <th className={`${t.th} hidden md:table-cell`}>Conta de caixa</th>
                    <th className={`${t.th} text-right`}>Valor</th>
                    <th className={t.th} />
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map((item) => (
                    <Linha
                      key={`${item.tipo}:${item.id}`}
                      item={item}
                      dia={dia}
                      nomeConta={nomeConta}
                      nomeCaixa={nomeCaixa}
                      nomeContraparte={nomeContraparte}
                      cartaoPorId={cartaoPorId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        ))
      )}
    </div>
  );
}

function Linha({
  item,
  dia,
  nomeConta,
  nomeCaixa,
  nomeContraparte,
  cartaoPorId,
}: {
  item: ItemConta;
  dia: string;
  nomeConta: Map<string, string>;
  nomeCaixa: Map<string, string>;
  nomeContraparte: Map<string, string>;
  cartaoPorId: Map<string, CartaoCredito>;
}) {
  const atraso = diasDeAtraso(item.vencimento, dia);
  const sinal = item.direcao === "saida" ? -1 : 1;
  const cartao = item.tipo === "fatura" ? cartaoPorId.get(item.fatura.cartao_id) : undefined;
  const caixa = item.tipo === "fatura" ? cartao?.conta_caixa_id : item.lancamento.conta_caixa_id;
  const mes = item.vencimento.slice(0, 7);

  return (
    <tr className={t.linha}>
      <td className={`${t.td} whitespace-nowrap`}>
        {formatarData(item.vencimento)}
        {atraso > 0 && (
          <Etiqueta tom="vermelho" className="mt-1 flex w-fit">
            {atraso} {atraso === 1 ? "dia" : "dias"} de atraso
          </Etiqueta>
        )}
        {atraso === 0 && item.vencimento === dia && (
          <Etiqueta tom="ambar" className="mt-1 flex w-fit">
            vence hoje
          </Etiqueta>
        )}
      </td>
      {/* max-w-0 + w-full: descrições longas são cortadas com "…", sem rolagem lateral */}
      <td className={`${t.td} w-full max-w-0`}>
        {item.tipo === "fatura" ? (
          <>
            <Link
              href={`?${new URLSearchParams({ aba: "cartoes", de: mes, ate: mes, cartao: item.fatura.cartao_id })}`}
              className="group flex items-center gap-1.5 font-medium text-slate-900 hover:text-marca-700"
            >
              <CreditCard className="size-4 shrink-0 text-slate-400" />
              <span className="truncate">
                Fatura {cartao?.nome ?? "do cartão"} · {formatarMes(item.fatura.referencia)}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
            </Link>
            <span className="block text-xs text-slate-500">
              {item.compras.length} {item.compras.length === 1 ? "compra" : "compras"} · fatura aberta
            </span>
          </>
        ) : (
          <>
            <span className="block truncate font-medium text-slate-900" title={item.lancamento.descricao}>
              {item.lancamento.descricao}
            </span>
            {item.lancamento.contraparte_id && (
              <span className="block truncate text-xs font-medium text-slate-600">
                {nomeContraparte.get(item.lancamento.contraparte_id) ?? "fornecedor ou cliente"}
              </span>
            )}
            <span className="block truncate text-xs text-slate-500">
              {item.lancamento.rateios.map((r) => nomeConta.get(r.conta_id) ?? "conta").join(" · ")}
            </span>
          </>
        )}
      </td>
      <td className={`${t.td} hidden whitespace-nowrap text-slate-600 md:table-cell`}>{caixa ? nomeCaixa.get(caixa) : "—"}</td>
      <td className={cx(t.td, "whitespace-nowrap text-right font-medium tabular-nums", sinal > 0 ? "text-emerald-700" : "text-red-700")}>
        {moeda(sinal * item.valor)}
      </td>
      <td className={`${t.td} whitespace-nowrap text-right`}>
        {item.tipo === "lancamento" && !item.lancamento.fatura_id && (
          <PainelLateral
            titulo={`Marcar como realizado: ${item.lancamento.descricao}`}
            gatilho={
              <>
                <CircleCheck />
                Realizar
              </>
            }
            classeGatilho={classeBotao("fantasma", true)}
            acao={liquidarLancamento.bind(null, item.lancamento.id)}
            rotuloSalvar="Marcar como realizado"
            aviso="Lançamento realizado"
          >
            <CamposLiquidacao />
          </PainelLateral>
        )}
      </td>
    </tr>
  );
}

// Aviso do painel: contas vencidas e ainda previstas, com link para a aba. Não depende do período escolhido.
export async function AvisoVencidas({ empresa, recursos }: { empresa: { id: string }; recursos: { cartoes: boolean } }) {
  const dia = hoje();
  const previstos = await carregarPrevistos(empresa.id, somarDiasData(dia, -1));
  const idsFaturas = recursos.cartoes ? [...new Set(previstos.map((l) => l.fatura_id).filter((id): id is string => !!id))] : [];
  const faturas = await carregarFaturasPorId(empresa.id, idsFaturas);
  const vencidas = agruparContas(previstos, faturas, dia).find((g) => g.chave === "vencidas");
  if (!vencidas) return null;
  const n = vencidas.itens.length;
  const partes = [vencidas.pagar > 0 && `${moeda(vencidas.pagar)} a pagar`, vencidas.receber > 0 && `${moeda(vencidas.receber)} a receber`].filter(Boolean);
  return (
    <Link
      href={`?${new URLSearchParams({ aba: "apagar" })}`}
      className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100"
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {n} {n === 1 ? "conta vencida" : "contas vencidas"}
        </span>{" "}
        ainda {n === 1 ? "prevista" : "previstas"}: {partes.join(" e ")}.
      </span>
      <span className="flex shrink-0 items-center gap-1 font-medium">
        Ver contas
        <ChevronRight className="size-3.5" />
      </span>
    </Link>
  );
}
