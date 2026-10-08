// Campos dos formulários. O <form> e o botão Salvar vêm do PainelLateral.

import { PriorizacaoAoVivo } from "@/components/controles";
import { AreaTexto, Campo, Entrada, Selecao, classeInput } from "@/components/ui";
import {
  CATEGORIAS,
  PRIORIDADES,
  SEGMENTOS,
  STATUS_ACAO,
  STATUS_ACHADO,
  STATUS_OPORTUNIDADE,
  STATUS_SOLICITACAO,
  UNIDADES,
  type Acao,
  type Achado,
  type Contato,
  type Diagnostico,
  type Empresa,
  type Indicador,
  type Oportunidade,
  type Perfil,
  type Solicitacao,
} from "@/lib/dominio";
import { hoje, somarDiasUteis } from "@/lib/datas";

export function CamposEmpresa({ empresa }: { empresa?: Empresa }) {
  return (
    <>
      <Campo rotulo="Nome">
        <Entrada name="nome" defaultValue={empresa?.nome} required autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="CNPJ">
          <Entrada name="cnpj" defaultValue={empresa?.cnpj ?? ""} placeholder="00.000.000/0000-00" />
        </Campo>
        <Campo rotulo="Segmento">
          <Selecao name="segmento" opcoes={SEGMENTOS} defaultValue={empresa?.segmento} />
        </Campo>
      </div>
      <Campo rotulo="Observações">
        <AreaTexto name="observacoes" defaultValue={empresa?.observacoes ?? ""} rows={4} />
      </Campo>
    </>
  );
}

export function CamposContato({ contato }: { contato?: Contato }) {
  return (
    <>
      <Campo rotulo="Nome">
        <Entrada name="nome" defaultValue={contato?.nome} required autoFocus />
      </Campo>
      <Campo rotulo="Cargo / papel" dica="Ex.: sócio, gerente, secretária">
        <Entrada name="cargo" defaultValue={contato?.cargo ?? ""} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Telefone">
          <Entrada name="telefone" defaultValue={contato?.telefone ?? ""} />
        </Campo>
        <Campo rotulo="E-mail">
          <Entrada name="email" type="email" defaultValue={contato?.email ?? ""} />
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="responsavel"
          defaultChecked={contato?.responsavel}
          className="size-4 rounded border-slate-300"
        />
        Responsável pela empresa
      </label>
    </>
  );
}

export function CamposDiagnostico({
  diagnostico,
  equipe,
  usuarioId,
}: {
  diagnostico?: Diagnostico;
  equipe: Perfil[];
  usuarioId?: string;
}) {
  const inicio = diagnostico?.data_inicio ?? hoje();
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Período analisado: de">
          <Entrada
            type="month"
            name="periodo_inicio"
            defaultValue={diagnostico?.periodo_inicio.slice(0, 7)}
            required
          />
        </Campo>
        <Campo rotulo="até">
          <Entrada
            type="month"
            name="periodo_fim"
            defaultValue={diagnostico?.periodo_fim.slice(0, 7)}
            required
          />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data de início">
          <Entrada type="date" name="data_inicio" defaultValue={inicio} required />
        </Campo>
        <Campo
          rotulo="Entrega prevista"
          dica={diagnostico ? undefined : "Sugestão: 5 dias úteis; ajuste quando a coleta terminar"}
        >
          <Entrada
            type="date"
            name="data_prevista"
            defaultValue={diagnostico ? (diagnostico.data_prevista ?? "") : somarDiasUteis(inicio, 5)}
          />
        </Campo>
      </div>
      <Campo rotulo="Responsável">
        <Selecao
          name="responsavel_id"
          vazio="—"
          opcoes={equipe.map((p) => ({ valor: p.id, rotulo: p.nome }))}
          defaultValue={diagnostico ? (diagnostico.responsavel_id ?? "") : usuarioId}
        />
      </Campo>
      <Campo rotulo="Pasta de documentos" dica="Link da pasta do cliente (Drive, Dropbox...)">
        <Entrada type="url" name="pasta_url" defaultValue={diagnostico?.pasta_url ?? ""} placeholder="https://" />
      </Campo>
      <Campo rotulo="Observações internas">
        <AreaTexto name="observacoes" defaultValue={diagnostico?.observacoes ?? ""} />
      </Campo>
    </>
  );
}

export function CamposSolicitacao({ solicitacao }: { solicitacao?: Solicitacao }) {
  return (
    <>
      <Campo rotulo="Item solicitado">
        <Entrada name="item" defaultValue={solicitacao?.item} required autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Categoria">
          <Selecao name="categoria" opcoes={CATEGORIAS} defaultValue={solicitacao?.categoria} />
        </Campo>
        <Campo rotulo="Status">
          <Selecao name="status" opcoes={STATUS_SOLICITACAO} defaultValue={solicitacao?.status} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data de solicitação">
          <Entrada type="date" name="data_solicitacao" defaultValue={solicitacao?.data_solicitacao ?? ""} />
        </Campo>
        <Campo rotulo="Data de recebimento">
          <Entrada type="date" name="data_recebimento" defaultValue={solicitacao?.data_recebimento ?? ""} />
        </Campo>
      </div>
      <Campo rotulo="Link do arquivo">
        <Entrada type="url" name="link" defaultValue={solicitacao?.link ?? ""} placeholder="https://" />
      </Campo>
      <Campo rotulo="Observação">
        <AreaTexto name="observacao" defaultValue={solicitacao?.observacao ?? ""} />
      </Campo>
    </>
  );
}

export function CamposIndicador({ indicador }: { indicador?: Indicador }) {
  return (
    <>
      <Campo rotulo="Indicador">
        <Entrada name="nome" defaultValue={indicador?.nome} required />
      </Campo>
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Valor" className="col-span-2">
          <Entrada
            name="valor"
            inputMode="decimal"
            defaultValue={indicador?.valor?.toString().replace(".", ",") ?? ""}
            autoFocus
          />
        </Campo>
        <Campo rotulo="Unidade">
          <Selecao name="unidade" opcoes={UNIDADES} vazio="—" defaultValue={indicador?.unidade ?? ""} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Categoria">
          <Selecao name="categoria" opcoes={CATEGORIAS} defaultValue={indicador?.categoria} />
        </Campo>
        <Campo rotulo="Período">
          <Entrada name="periodo" defaultValue={indicador?.periodo ?? ""} placeholder="Ex.: média jan–jun/26" />
        </Campo>
      </div>
      <Campo rotulo="Referência" dica="Meta, valor de mercado ou período anterior para comparação">
        <Entrada name="referencia" defaultValue={indicador?.referencia ?? ""} />
      </Campo>
      <Campo rotulo="Análise">
        <AreaTexto name="observacao" defaultValue={indicador?.observacao ?? ""} rows={4} />
      </Campo>
    </>
  );
}

function CamposPriorizacao({
  item,
}: {
  item?: { nota_impacto: number; nota_urgencia: number; nota_esforco: number; prioridade_manual: string | null };
}) {
  return <PriorizacaoAoVivo item={item} />;
}

export function CamposAchado({ achado }: { achado?: Achado }) {
  return (
    <>
      <Campo rotulo="Título">
        <Entrada name="titulo" defaultValue={achado?.titulo} required autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Categoria">
          <Selecao name="categoria" opcoes={CATEGORIAS} defaultValue={achado?.categoria} />
        </Campo>
        <Campo rotulo="Status">
          <Selecao name="status" opcoes={STATUS_ACHADO} defaultValue={achado?.status} />
        </Campo>
      </div>
      <Campo rotulo="Descrição">
        <AreaTexto name="descricao" defaultValue={achado?.descricao ?? ""} />
      </Campo>
      <Campo rotulo="Evidência" dica="Dados ou indicadores que mostram o problema">
        <AreaTexto name="evidencia" defaultValue={achado?.evidencia ?? ""} />
      </Campo>
      <Campo rotulo="Causa provável">
        <AreaTexto name="causa_provavel" defaultValue={achado?.causa_provavel ?? ""} />
      </Campo>
      <Campo rotulo="Impacto" dica="Ex.: perda estimada de R$ 8 mil/mês">
        <AreaTexto name="impacto" defaultValue={achado?.impacto ?? ""} rows={2} />
      </Campo>
      <CamposPriorizacao item={achado} />
    </>
  );
}

export function CamposOportunidade({ oportunidade }: { oportunidade?: Oportunidade }) {
  return (
    <>
      <Campo rotulo="Título">
        <Entrada name="titulo" defaultValue={oportunidade?.titulo} required autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Categoria">
          <Selecao name="categoria" opcoes={CATEGORIAS} defaultValue={oportunidade?.categoria} />
        </Campo>
        <Campo rotulo="Status">
          <Selecao name="status" opcoes={STATUS_OPORTUNIDADE} defaultValue={oportunidade?.status} />
        </Campo>
      </div>
      <Campo rotulo="Descrição">
        <AreaTexto name="descricao" defaultValue={oportunidade?.descricao ?? ""} />
      </Campo>
      <Campo rotulo="Potencial impacto" dica="Ex.: +15% de aceitação de orçamentos">
        <AreaTexto name="potencial_impacto" defaultValue={oportunidade?.potencial_impacto ?? ""} rows={2} />
      </Campo>
      <Campo rotulo="Esforço estimado" dica="O que é preciso para capturar">
        <AreaTexto name="esforco_estimado" defaultValue={oportunidade?.esforco_estimado ?? ""} rows={2} />
      </Campo>
      <CamposPriorizacao item={oportunidade} />
    </>
  );
}

export function CamposAcao({
  acao,
  achados,
  oportunidades,
  relacionadoPadrao,
  prioridadePadrao,
}: {
  acao?: Acao;
  achados: Pick<Achado, "id" | "titulo">[];
  oportunidades: Pick<Oportunidade, "id" | "titulo">[];
  relacionadoPadrao?: string;
  prioridadePadrao?: string;
}) {
  const relacionado = acao
    ? acao.achado_id
      ? `achado:${acao.achado_id}`
      : acao.oportunidade_id
        ? `oportunidade:${acao.oportunidade_id}`
        : ""
    : (relacionadoPadrao ?? "");

  return (
    <>
      <Campo rotulo="Ação">
        <AreaTexto name="acao" defaultValue={acao?.acao} required autoFocus rows={2} />
      </Campo>
      <Campo rotulo="Relacionada a">
        <select name="relacionado" defaultValue={relacionado} className={classeInput}>
          <option value="">Nenhum item</option>
          {achados.length > 0 && (
            <optgroup label="Achados">
              {achados.map((a) => (
                <option key={a.id} value={`achado:${a.id}`}>
                  {a.titulo}
                </option>
              ))}
            </optgroup>
          )}
          {oportunidades.length > 0 && (
            <optgroup label="Oportunidades">
              {oportunidades.map((o) => (
                <option key={o.id} value={`oportunidade:${o.id}`}>
                  {o.titulo}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Responsável" dica="Normalmente alguém da clínica">
          <Entrada name="responsavel" defaultValue={acao?.responsavel ?? ""} />
        </Campo>
        <Campo rotulo="Prazo">
          <Entrada type="date" name="prazo" defaultValue={acao?.prazo ?? ""} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Prioridade">
          <Selecao name="prioridade" opcoes={PRIORIDADES} defaultValue={acao?.prioridade ?? prioridadePadrao ?? "Média"} />
        </Campo>
        <Campo rotulo="Status">
          <Selecao name="status" opcoes={STATUS_ACAO} defaultValue={acao?.status} />
        </Campo>
      </div>
      <Campo rotulo="Observações">
        <AreaTexto name="observacoes" defaultValue={acao?.observacoes ?? ""} />
      </Campo>
    </>
  );
}
