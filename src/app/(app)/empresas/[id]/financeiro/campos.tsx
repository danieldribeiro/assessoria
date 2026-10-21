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
  type Contraparte,
  type Lancamento,
} from "@/lib/financeiro/dominio";
import { emCentavos } from "@/lib/financeiro/rateio";
import { moedaParaCampo } from "@/lib/moeda";
import { lerNumeroBR } from "@/lib/numeros";

type Opcao = { valor: string; rotulo: string };

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
// Com `fixo`, é o lançamento criado a partir de uma movimentação do extrato.
export function CamposLancamento({
  caixas,
  contas,
  lancamento: l0,
  contrapartes,
  fixo,
}: {
  caixas: Opcao[];
  contas: Opcao[];
  lancamento?: Lancamento;
  contrapartes?: Opcao[] | null;
  fixo?: MovimentoFixo;
}) {
  const [situacao, setSituacao] = useState<string>(l0?.situacao === "previsto" ? "previsto" : "realizado");
  const [total, setTotal] = useState(() => moedaParaCampo(fixo ? fixo.valor : l0?.valor_total));
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    l0?.rateios.length
      ? l0.rateios.map((r, i) => ({ chave: i, conta: r.conta_id, valor: moedaParaCampo(r.valor) }))
      : [{ chave: 0, conta: "", valor: "" }],
  );
  const totalC = centavosDe(total);
  const somaC = linhas.reduce((a, l) => a + (centavosDe(l.valor) ?? 0), 0);
  const varias = linhas.length > 1;
  const falta = totalC !== null && varias ? totalC - somaC : null;

  function mudar(chave: number, campo: "conta" | "valor", valor: string) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

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

  const rateio = (
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
        Ex.: parcela de empréstimo = amortização + juros. Com uma conta só, o valor da linha é o total.
      </p>
    </fieldset>
  );

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
          <Campo rotulo="Competência" dica="Dia ou mês a que se refere. Vazio = data do banco">
            <Entrada name="data_competencia" type="date" />
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
        <Campo rotulo="Situação">
          <Selecao
            name="situacao"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
            opcoes={[{ valor: "realizado", rotulo: "Realizado (já saiu ou entrou)" }, { valor: "previsto", rotulo: "Previsto (a pagar ou receber)" }]}
          />
        </Campo>
      </div>
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
        <Campo rotulo="Competência" dica="Dia ou mês a que se refere. Vazio = mesma data">
          <Entrada name="data_competencia" type="date" defaultValue={l0?.data_competencia} />
        </Campo>
      </div>
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
