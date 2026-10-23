"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { EntradaMoeda } from "@/components/entrada-moeda";
import { AreaTexto, Campo, Entrada, Selecao } from "@/components/ui";
import { hoje } from "@/lib/datas";
import {
  CLASSIFICACOES,
  NOME_CAIXA,
  NOME_NATUREZA,
  SECOES_DRE,
  TIPOS_CAIXA,
  TIPOS_CONTA,
  ehClassificacao,
  nomeSecaoDre,
  TIPOS_CONTRAPARTE,
  formatarDocumento,
  type ContaCaixa,
  type ContaPlano,
  type Cartao,
  type Contraparte,
  type Lancamento,
} from "@/lib/financeiro/dominio";
import { referenciaDaCompra } from "@/lib/financeiro/cartao";
import { emCentavos } from "@/lib/financeiro/rateio";
import { somarMeses } from "@/lib/financeiro/periodo";
import { moedaParaCampo } from "@/lib/moeda";
import { lerNumeroBR } from "@/lib/numeros";

type Opcao = { valor: string; rotulo: string };

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Competência por mês e ano. O banco guarda uma data: vai o dia 1 do mês escolhido, mas, se o mês
// não mudou na edição, a data que já estava fica como está.
function CampoCompetencia({ original }: { original?: string }) {
  const [mes, setMes] = useState(original?.slice(0, 7) ?? "");
  const anoAtual = Number(hoje().slice(0, 4));
  // Do fim do ano que vem até três anos atrás, mais recente primeiro; o mês já gravado entra mesmo fora disso.
  const meses = Array.from({ length: 60 }, (_, i) => {
    const total = (anoAtual + 1) * 12 + 11 - i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
  if (mes && !meses.includes(mes)) meses.push(mes);
  const valor = !mes ? "" : original?.startsWith(mes) ? original : `${mes}-01`;
  return (
    <>
      <input type="hidden" name="data_competencia" value={valor} />
      <Selecao
        aria-label="Mês da competência"
        value={mes}
        onChange={(e) => setMes(e.target.value)}
        vazio="—"
        opcoes={meses.map((m) => ({ valor: m, rotulo: `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` }))}
      />
    </>
  );
}

const DICA_MOEDA = "Digite só os números: os centavos entram sozinhos.";

// Conta do plano. A classificação define a natureza e a seção da DRE (matriz de coerência);
// o caixa só oferece as opções permitidas para ela.
export function CamposConta({ conta, grupos, usada }: { conta?: ContaPlano; grupos: Opcao[]; usada?: boolean }) {
  const [tipo, setTipo] = useState<string>(conta?.tipo ?? "analitica");
  const [classificacao, setClassificacao] = useState<string>(conta?.classificacao ?? "");
  const regra = ehClassificacao(classificacao) ? CLASSIFICACOES[classificacao] : null;
  const [caixa, setCaixa] = useState<string>(conta?.comportamento_caixa ?? "");
  const caixaValido = regra && (regra.caixa as readonly string[]).includes(caixa) ? caixa : (regra?.caixa[0] ?? "");

  return (
    <>
      {usada && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Esta conta já tem lançamentos: código, nome, grupo e ordem podem mudar, mas tipo, classificação, caixa e DRE
          ficam fixos. Para outra classificação, crie uma conta nova.
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Código">
          <Entrada name="codigo" required defaultValue={conta?.codigo ?? ""} placeholder="6.03.01" />
        </Campo>
        <Campo rotulo="Nome" className="col-span-2">
          <Entrada name="nome" required defaultValue={conta?.nome ?? ""} />
        </Campo>
      </div>
      <Campo rotulo="Dentro do grupo">
        <Selecao name="conta_pai_id" vazio="(nenhum: conta principal)" opcoes={grupos} defaultValue={conta?.conta_pai_id ?? ""} />
      </Campo>
      <Campo rotulo="Tipo">
        <Selecao name="tipo" opcoes={TIPOS_CONTA} value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={usada} />
        {usada && <input type="hidden" name="tipo" value={tipo} />}
      </Campo>
      {tipo === "grupo" ? (
        <Campo rotulo="Seção da DRE que o grupo reúne" dica="Opcional. Só para organizar; quem vai para a DRE são as contas analíticas.">
          <Selecao
            name="dre_secao"
            vazio="(nenhuma)"
            opcoes={SECOES_DRE.filter((s) => s.recebe).map((s) => ({ valor: String(s.numero), rotulo: `${s.numero}. ${s.nome}` }))}
            defaultValue={conta?.dre_secao ? String(conta.dre_secao) : ""}
          />
        </Campo>
      ) : (
        <fieldset disabled={usada} className="space-y-4">
          <Campo rotulo="Classificação">
            <Selecao
              name="classificacao"
              required
              vazio="Escolha…"
              opcoes={Object.entries(CLASSIFICACOES).map(([valor, c]) => ({ valor, rotulo: c.rotulo }))}
              value={classificacao}
              onChange={(e) => setClassificacao(e.target.value)}
            />
          </Campo>
          {regra && (
            <>
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Natureza: {NOME_NATUREZA[regra.natureza]} · DRE: {regra.dre ? `${regra.dre}. ${nomeSecaoDre(regra.dre)}` : "fora da DRE"}
              </p>
              <Campo
                rotulo="Comportamento no caixa"
                dica="“Sem caixa” (depreciação, consumo de estoque, desconto) não recebe lançamento de caixa."
              >
                <Selecao
                  name="comportamento_caixa"
                  opcoes={regra.caixa.map((c) => ({ valor: c, rotulo: NOME_CAIXA[c] }))}
                  value={caixaValido}
                  onChange={(e) => setCaixa(e.target.value)}
                />
              </Campo>
              {classificacao === "custo_direto_variavel" && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="custo_cmv" defaultChecked={conta?.custo_cmv} />
                  É CMV/CSV (custo da mercadoria ou do serviço vendido)
                </label>
              )}
            </>
          )}
        </fieldset>
      )}
      {usada && tipo === "analitica" && (
        <>
          <input type="hidden" name="classificacao" value={classificacao} />
          <input type="hidden" name="comportamento_caixa" value={caixaValido} />
          {conta?.custo_cmv && <input type="hidden" name="custo_cmv" value="on" />}
        </>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Ordem" dica="Menor vem antes">
          <Entrada name="ordem" type="number" defaultValue={conta?.ordem ?? 0} />
        </Campo>
      </div>
      <Campo rotulo="Descrição">
        <AreaTexto name="descricao" defaultValue={conta?.descricao ?? ""} rows={2} />
      </Campo>
    </>
  );
}

export function CamposContaCaixa({ caixa }: { caixa?: ContaCaixa }) {
  return (
    <>
      <Campo rotulo="Nome">
        <Entrada name="nome" required defaultValue={caixa?.nome ?? ""} placeholder="Banco do Brasil, Caixa da recepção…" />
      </Campo>
      <Campo rotulo="Tipo">
        <Selecao name="tipo" opcoes={TIPOS_CAIXA} defaultValue={caixa?.tipo ?? "banco"} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Saldo inicial" dica={`${DICA_MOEDA} Digite “-” se estava negativo.`}>
          <EntradaMoeda name="saldo_inicial" required negativo defaultValue={caixa?.saldo_inicial ?? null} />
        </Campo>
        <Campo rotulo="Data do saldo inicial" dica="Saldo no começo deste dia">
          <Entrada name="data_saldo_inicial" type="date" required defaultValue={caixa?.data_saldo_inicial ?? ""} />
        </Campo>
      </div>
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Movimentos realizados antes dessa data são recusados, porque já estão contidos no saldo informado.
      </p>
      <Campo rotulo="Ordem">
        <Entrada name="ordem" type="number" defaultValue={caixa?.ordem ?? 0} />
      </Campo>
    </>
  );
}

type Linha = { chave: number; conta: string; valor: string };

// Movimentação do extrato que vira lançamento: valor, sentido, conta de caixa e data vêm do banco e não mudam.
export type MovimentoFixo = { direcao: "entrada" | "saida"; valor: number; data: string; descricao: string; documento: string | null };

// Lançamento com rateio: cada linha é uma conta do plano; a soma precisa bater com o valor total.
// Com `lancamento`, o formulário vem preenchido para a edição. Com `contrapartes` (lista, mesmo vazia), mostra os
// campos de fornecedor ou cliente e observações (migration 0009); sem a lista, eles ficam de fora.
// Com `fixo`, é o lançamento criado a partir de uma movimentação do extrato. Com `cartao` (texto sobre a fatura),
// é a edição de uma compra no cartão: situação, conta de caixa e datas vêm da fatura e não mudam aqui.
export function CamposLancamento({
  caixas,
  contas,
  lancamento: l0,
  contrapartes,
  fixo,
  cartao,
}: {
  caixas: Opcao[];
  contas: Opcao[];
  lancamento?: Lancamento;
  contrapartes?: Opcao[] | null;
  fixo?: MovimentoFixo;
  cartao?: string;
}) {
  const [situacao, setSituacao] = useState<string>(l0?.situacao === "previsto" ? "previsto" : "realizado");
  const [total, setTotal] = useState(() => moedaParaCampo(fixo ? fixo.valor : l0?.valor_total));
  const totalC = centavosDe(total);

  const fornecedor = contrapartes ? (
    <Campo rotulo="Fornecedor ou cliente" dica="Opcional. Despesas de fornecedores diferentes ficam em lançamentos separados.">
      <Selecao name="contraparte_id" vazio="(nenhum)" opcoes={contrapartes} defaultValue={l0?.contraparte_id ?? ""} />
    </Campo>
  ) : null;
  const observacoes = contrapartes ? (
    <Campo rotulo="Observações">
      <AreaTexto name="observacoes" rows={2} defaultValue={l0?.observacoes ?? ""} />
    </Campo>
  ) : null;

  const rateio = <BlocoRateio contas={contas} totalC={totalC} inicial={l0?.rateios} />;

  const juros = (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" name="juros_nao_segregados" className="mt-1" defaultChecked={l0?.juros_nao_segregados} />
      <span>
        Juros não segregados
        <span className="block text-xs text-slate-500">
          Parcela de dívida sem a separação entre principal e juros. O Axis não estima os juros.
        </span>
      </span>
    </label>
  );

  if (fixo) {
    return (
      <>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{fixo.descricao}</p>
          <p className="text-xs text-slate-500">
            {fixo.direcao === "entrada" ? "Entrada" : "Saída"} de {formatar(Math.round(fixo.valor * 100))} em{" "}
            {fixo.data.split("-").reverse().join("/")}, como veio do banco. Valor, sentido, conta de caixa e data não mudam.
          </p>
        </div>
        <input type="hidden" name="valor_total" value={total} />
        <Campo rotulo="Descrição">
          <Entrada name="descricao" required defaultValue={fixo.descricao} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Competência" dica="Mês a que se refere. Vazio = mês da data do banco">
            <CampoCompetencia />
          </Campo>
          <Campo rotulo="Documento" dica="Nota, boleto, recibo (opcional)">
            <Entrada name="documento" defaultValue={fixo.documento ?? ""} />
          </Campo>
        </div>
        {fornecedor}
        {rateio}
        {observacoes}
        {juros}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Tipo">
          <Selecao
            name="direcao"
            defaultValue={l0?.direcao}
            opcoes={[{ valor: "saida", rotulo: "Saída (pagamento)" }, { valor: "entrada", rotulo: "Entrada (recebimento)" }]}
          />
        </Campo>
        {cartao ? (
          <Campo rotulo="Competência" dica="Mês da compra: é nele que entra no Resultado">
            <CampoCompetencia original={l0?.data_competencia} />
          </Campo>
        ) : (
          <Campo rotulo="Situação">
            <Selecao
              name="situacao"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value)}
              opcoes={[{ valor: "realizado", rotulo: "Realizado (já saiu ou entrou)" }, { valor: "previsto", rotulo: "Previsto (a pagar ou receber)" }]}
            />
          </Campo>
        )}
      </div>
      {cartao && l0 ? (
        <>
          <input type="hidden" name="situacao" value={l0.situacao === "realizado" ? "realizado" : "previsto"} />
          <input type="hidden" name="conta_caixa_id" value={l0.conta_caixa_id} />
          <input type="hidden" name="data" value={(l0.situacao === "realizado" ? l0.data_liquidacao : l0.data_vencimento) ?? ""} />
          <p className="rounded-md bg-marca-50 px-3 py-2 text-xs text-marca-800">
            {cartao} A situação, a conta de caixa e as datas seguem a fatura: mudam pela aba Cartões (Pagar fatura ou
            Ajustar datas).
          </p>
        </>
      ) : (
        <>
          <Campo rotulo="Conta de caixa">
            <Selecao name="conta_caixa_id" required vazio="Escolha…" opcoes={caixas} defaultValue={l0?.conta_caixa_id} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo={situacao === "realizado" ? "Data do pagamento ou recebimento" : "Vencimento"}>
              <Entrada
                name="data"
                type="date"
                required
                defaultValue={(l0?.situacao === "previsto" ? l0.data_vencimento : l0?.data_liquidacao) ?? hoje()}
              />
            </Campo>
            <Campo rotulo="Competência" dica="Mês a que se refere. Vazio = mês da data ao lado">
              <CampoCompetencia original={l0?.data_competencia} />
            </Campo>
          </div>
        </>
      )}
      <Campo rotulo="Descrição">
        <Entrada name="descricao" required placeholder="Aluguel de outubro" defaultValue={l0?.descricao} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor total" dica={DICA_MOEDA}>
          <EntradaMoeda name="valor_total" required value={total} onChange={setTotal} />
        </Campo>
        <Campo rotulo="Documento" dica="Nota, boleto, recibo (opcional)">
          <Entrada name="documento" defaultValue={l0?.documento ?? ""} />
        </Campo>
      </div>
      {fornecedor}
      {rateio}
      {observacoes}
      {juros}
    </>
  );
}

// Linhas do rateio: cada uma é uma conta do plano; com mais de uma, mostra quanto falta para fechar o total.
function BlocoRateio({ contas, totalC, inicial, dica }: { contas: Opcao[]; totalC: number | null; inicial?: { conta_id: string; valor: number }[]; dica?: string }) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial?.length
      ? inicial.map((r, i) => ({ chave: i, conta: r.conta_id, valor: moedaParaCampo(r.valor) }))
      : [{ chave: 0, conta: "", valor: "" }],
  );
  const somaC = linhas.reduce((a, l) => a + (centavosDe(l.valor) ?? 0), 0);
  const varias = linhas.length > 1;
  const falta = totalC !== null && varias ? totalC - somaC : null;

  function mudar(chave: number, campo: "conta" | "valor", valor: string) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">Contas do plano (rateio)</legend>
      {linhas.map((l, i) => (
        <div key={l.chave} className="flex items-start gap-2">
          <Selecao
            name="rateio_conta"
            aria-label={`Conta da linha ${i + 1}`}
            vazio="Escolha a conta…"
            opcoes={contas}
            value={l.conta}
            onChange={(e) => mudar(l.chave, "conta", e.target.value)}
            className="min-w-0 flex-1"
          />
          <EntradaMoeda
            name="rateio_valor"
            aria-label={`Valor da linha ${i + 1}`}
            placeholder={varias ? "0,00" : "= total"}
            value={l.valor}
            onChange={(texto) => mudar(l.chave, "valor", texto)}
            className="w-36"
          />
          {varias && (
            <button
              type="button"
              onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
              className="mt-1.5 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              aria-label={`Tirar a linha ${i + 1}`}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setLinhas((ls) => [...ls, { chave: Math.max(...ls.map((x) => x.chave)) + 1, conta: "", valor: "" }])}
          className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline"
        >
          <Plus className="size-3.5" />
          Dividir em mais uma conta
        </button>
        {falta !== null && (
          <span className={falta === 0 ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>
            {falta === 0 ? "Soma confere" : `${falta > 0 ? "Faltam" : "Sobram"} ${formatar(Math.abs(falta))}`}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {dica ?? "Ex.: parcela de empréstimo = amortização + juros. Com uma conta só, o valor da linha é o total."}
      </p>
    </fieldset>
  );
}

// Fornecedor ou cliente (0009). CPF/CNPJ pode vir com ou sem pontuação; o servidor guarda só os dígitos.
export function CamposContraparte({ contraparte }: { contraparte?: Contraparte }) {
  return (
    <>
      <Campo rotulo="Nome">
        <Entrada name="nome" required defaultValue={contraparte?.nome ?? ""} placeholder="Dental Cremer, Laboratório Sorriso…" />
      </Campo>
      <Campo rotulo="Tipo">
        <Selecao name="tipo" opcoes={TIPOS_CONTRAPARTE} defaultValue={contraparte?.tipo ?? "fornecedor"} />
      </Campo>
      <Campo rotulo="CPF ou CNPJ" dica="Opcional">
        <Entrada name="documento" inputMode="numeric" defaultValue={formatarDocumento(contraparte?.documento ?? null) ?? ""} />
      </Campo>
    </>
  );
}

export function CamposTransferencia({ caixas }: { caixas: Opcao[] }) {
  return (
    <>
      <p className="rounded-md bg-marca-50 px-3 py-2 text-sm text-marca-800">
        Dinheiro que passa de uma conta da empresa para outra. Muda o saldo de cada conta, mas não é entrada nem saída
        do fluxo de caixa.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="De">
          <Selecao name="conta_origem_id" required vazio="Escolha…" opcoes={caixas} />
        </Campo>
        <Campo rotulo="Para">
          <Selecao name="conta_destino_id" required vazio="Escolha…" opcoes={caixas} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor" dica={DICA_MOEDA}>
          <EntradaMoeda name="valor" required />
        </Campo>
        <Campo rotulo="Data">
          <Entrada name="data" type="date" required defaultValue={hoje()} />
        </Campo>
      </div>
      <Campo rotulo="Descrição">
        <Entrada name="descricao" placeholder="Reserva para impostos" />
      </Campo>
    </>
  );
}

// Cartão de crédito (0011): a conta de caixa é a que paga a fatura; os dias decidem em que fatura cada compra cai.
export function CamposCartao({ cartao, caixas, comFaturas }: { cartao?: Cartao; caixas: Opcao[]; comFaturas?: boolean }) {
  return (
    <>
      <Campo rotulo="Nome">
        <Entrada name="nome" required defaultValue={cartao?.nome ?? ""} placeholder="Itaú Visa empresa" />
      </Campo>
      <Campo rotulo="Conta de caixa que paga a fatura" dica={comFaturas ? "Não muda depois da primeira fatura." : undefined}>
        <Selecao name="conta_caixa_id" required vazio="Escolha…" opcoes={caixas} defaultValue={cartao?.conta_caixa_id} disabled={comFaturas} />
        {comFaturas && <input type="hidden" name="conta_caixa_id" value={cartao?.conta_caixa_id} />}
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Dia do fechamento" dica="Compra neste dia ou depois vai para a fatura seguinte">
          <Entrada name="dia_fechamento" type="number" min={1} max={31} required defaultValue={cartao?.dia_fechamento ?? ""} />
        </Campo>
        <Campo rotulo="Dia do vencimento">
          <Entrada name="dia_vencimento" type="number" min={1} max={31} required defaultValue={cartao?.dia_vencimento ?? ""} />
        </Campo>
      </div>
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Mudar os dias vale para as faturas que ainda vão ser criadas. Para uma fatura que já existe, use Ajustar datas.
      </p>
    </>
  );
}

export type OpcaoCartao = Opcao & Pick<Cartao, "dia_fechamento" | "dia_vencimento">;

// Compra no cartão: cada parcela vira um lançamento previsto na fatura do mês, com a competência da compra. A
// fatura da primeira parcela sai do dia de fechamento, mas pode ser escolhida (compra lançada atrasada, por exemplo).
export function CamposCompraCartao({ cartoes, contas, contrapartes }: { cartoes: OpcaoCartao[]; contas: Opcao[]; contrapartes?: Opcao[] | null }) {
  const [cartao, setCartao] = useState(cartoes.length === 1 ? cartoes[0].valor : "");
  const [dataCompra, setDataCompra] = useState(hoje());
  const [parcelas, setParcelas] = useState("1");
  const [primeira, setPrimeira] = useState("");
  const [direcao, setDirecao] = useState("saida");
  const [total, setTotal] = useState("");
  const totalC = centavosDe(total);
  const escolhido = cartoes.find((c) => c.valor === cartao);
  const automatica = escolhido && /^\d{4}-\d{2}-\d{2}$/.test(dataCompra) ? referenciaDaCompra(escolhido, dataCompra) : null;
  const n = direcao === "entrada" ? 1 : Math.max(1, Math.min(48, Number(parcelas) || 1));
  const inicio = primeira || automatica;
  const nomeMes = (m: string) => `${MESES[Number(m.slice(5)) - 1].toLowerCase()}/${m.slice(0, 4)}`;
  const curto = (m: string) => `${MESES[Number(m.slice(5)) - 1].slice(0, 3).toLowerCase()}/${m.slice(0, 4)}`;
  const meses = automatica ? Array.from({ length: 7 }, (_, i) => somarMeses(automatica, i - 2)) : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Cartão">
          <Selecao name="cartao_id" required vazio="Escolha…" opcoes={cartoes} value={cartao} onChange={(e) => (setCartao(e.target.value), setPrimeira(""))} />
        </Campo>
        <Campo rotulo="Tipo">
          <Selecao
            name="direcao"
            value={direcao}
            onChange={(e) => setDirecao(e.target.value)}
            opcoes={[{ valor: "saida", rotulo: "Compra" }, { valor: "entrada", rotulo: "Estorno ou crédito" }]}
          />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data da compra" dica="É a competência: entra no Resultado deste mês">
          <Entrada name="data_compra" type="date" required value={dataCompra} onChange={(e) => (setDataCompra(e.target.value), setPrimeira(""))} />
        </Campo>
        <Campo rotulo="Valor total" dica={DICA_MOEDA}>
          <EntradaMoeda name="valor_total" required value={total} onChange={setTotal} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {direcao === "saida" ? (
          <Campo rotulo="Parcelas">
            <Entrada name="parcelas" type="number" min={1} max={48} required value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
          </Campo>
        ) : (
          <input type="hidden" name="parcelas" value="1" />
        )}
        <Campo rotulo={n > 1 ? "Fatura da 1ª parcela" : "Fatura"} dica="Automática: pelo dia de fechamento">
          <Selecao
            name="primeira_fatura"
            value={primeira}
            onChange={(e) => setPrimeira(e.target.value)}
            vazio={automatica ? `Automática: ${curto(automatica)}` : "Escolha o cartão e a data"}
            opcoes={meses.filter((m) => m !== automatica).map((m) => ({ valor: m, rotulo: `Vence em ${curto(m)}` }))}
          />
        </Campo>
      </div>
      {inicio && totalC !== null && totalC >= n && (
        <p className="rounded-md bg-marca-50 px-3 py-2 text-xs text-marca-800">
          {n === 1
            ? `Entra na fatura que vence em ${nomeMes(inicio)}`
            : `${n} parcelas de ${formatar(Math.floor(totalC / n))}${totalC % n ? ` (a primeira, ${formatar(Math.floor(totalC / n) + (totalC % n))})` : ""}, nas faturas de ${nomeMes(inicio)} a ${nomeMes(somarMeses(inicio, n - 1))}`}
          . Fica prevista até a fatura ser paga; o Resultado mostra o valor cheio no mês da compra.
        </p>
      )}
      <Campo rotulo="Descrição" dica={n > 1 ? "Cada parcela recebe (1/3), (2/3)… no fim" : undefined}>
        <Entrada name="descricao" required placeholder="Material de escritório (Kalunga)" />
      </Campo>
      <Campo rotulo="Documento" dica="Nota fiscal ou recibo (opcional)">
        <Entrada name="documento" />
      </Campo>
      {contrapartes && (
        <Campo rotulo="Fornecedor" dica="Opcional">
          <Selecao name="contraparte_id" vazio="(nenhum)" opcoes={contrapartes} />
        </Campo>
      )}
      <BlocoRateio
        contas={contas}
        totalC={totalC}
        dica={n > 1 ? "Divida o valor total da compra; cada parcela leva a mesma proporção." : "Com uma conta só, o valor da linha é o total."}
      />
      {contrapartes && (
        <Campo rotulo="Observações">
          <AreaTexto name="observacoes" rows={2} />
        </Campo>
      )}
    </>
  );
}

export function CamposPagamentoFatura({ total, vencimento }: { total: number; vencimento: string }) {
  return (
    <>
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Todas as compras desta fatura passam a realizadas na data do pagamento. O saldo da conta cai uma vez, em{" "}
        {formatar(Math.round(total * 100))}, e o Fluxo de caixa mostra a saída nessa data, separada pelas categorias das compras.
      </p>
      <Campo rotulo="Data do pagamento">
        <Entrada name="data_pagamento" type="date" required defaultValue={vencimento < hoje() ? vencimento : hoje()} />
      </Campo>
      <p className="text-xs text-slate-500">Só o pagamento total, nesta versão. Pode ser desfeito enquanto não estiver conciliado com o extrato.</p>
    </>
  );
}

export function CamposDatasFatura({ fechamento, vencimento }: { fechamento: string; vencimento: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Fechamento">
          <Entrada name="data_fechamento" type="date" required defaultValue={fechamento} />
        </Campo>
        <Campo rotulo="Vencimento">
          <Entrada name="data_vencimento" type="date" required defaultValue={vencimento} />
        </Campo>
      </div>
      <p className="text-xs text-slate-500">As compras previstas da fatura passam a vencer na nova data.</p>
    </>
  );
}

export function CamposLiquidacao() {
  return (
    <Campo rotulo="Data do pagamento ou recebimento">
      <Entrada name="data_liquidacao" type="date" required defaultValue={hoje()} />
    </Campo>
  );
}

function centavosDe(texto: string) {
  const l = lerNumeroBR(texto);
  return l.estado === "valido" ? emCentavos(l.valor) : null;
}

function formatar(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
