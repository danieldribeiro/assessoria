// Campos dos formulários. O <form> e o botão Salvar vêm do PainelLateral.

import { Building2 } from "lucide-react";
import { CamposCadastro, SeletorImagem } from "@/components/cadastro";
import { PriorizacaoAoVivo } from "@/components/controles";
import { AreaTexto, Campo, Entrada, Selecao, classeInput } from "@/components/ui";
import {
  CATEGORIAS,
  CORES,
  NOME_COR,
  PRIORIDADES,
  TOLERANCIA_PADRAO,
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
  type ResponsaveisArea,
  type Solicitacao,
} from "@/lib/dominio";
import { hoje, somarDiasUteis } from "@/lib/datas";

const decimal = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

// Responsável do item: em branco, segue o responsável da área no diagnóstico.
function CampoResponsavel({
  equipe,
  areas,
  valor,
}: {
  equipe: Perfil[];
  areas: ResponsaveisArea;
  valor?: string | null;
}) {
  const nome = (id?: string) => equipe.find((p) => p.id === id)?.nome.split(" ")[0];
  const resumo = CATEGORIAS.filter((c) => areas[c])
    .map((c) => `${c}: ${nome(areas[c])}`)
    .join(" · ");
  return (
    <Campo
      rotulo="Responsável"
      dica={resumo ? `Em branco, segue a área (${resumo})` : "Em branco, segue o responsável da área"}
    >
      <Selecao
        name="responsavel_id"
        vazio="Responsável da área"
        opcoes={equipe.map((p) => ({ valor: p.id, rotulo: p.nome }))}
        defaultValue={valor ?? ""}
      />
    </Campo>
  );
}

type Equipe = { equipe: Perfil[]; areas: ResponsaveisArea };

export function CamposEmpresa({ empresa }: { empresa?: Empresa }) {
  return (
    <>
      <SeletorImagem
        nome="logo"
        tipo="logo"
        valor={empresa?.logo_url}
        substituto={<Building2 className="size-6 text-slate-400" />}
      />
      <Campo rotulo="Nome" dica="Como a clínica é conhecida; aparece nas telas e no relatório.">
        <Entrada name="nome" defaultValue={empresa?.nome} required autoFocus />
      </Campo>
      <Campo rotulo="Segmento">
        <Selecao name="segmento" opcoes={SEGMENTOS} defaultValue={empresa?.segmento} />
      </Campo>
      <CamposCadastro valores={empresa} campoNome="nome" />
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
  areasPadrao,
}: {
  diagnostico?: Diagnostico;
  equipe: Perfil[];
  usuarioId?: string;
  areasPadrao?: ResponsaveisArea;
}) {
  const areas = diagnostico?.responsaveis_area ?? areasPadrao ?? {};
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
      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <legend className="sr-only">Responsáveis por área</legend>
        <div>
          <p className="text-sm font-semibold text-slate-900">Responsáveis por área</p>
          <p className="text-xs text-slate-500">
            Cada item de coleta, indicador, achado e oportunidade fica com quem cuida da sua área. Dá para trocar item a
            item.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIAS.map((c) => (
            <Campo key={c} rotulo={c}>
              <Selecao
                name={`area_${c}`}
                vazio="—"
                opcoes={equipe.map((p) => ({ valor: p.id, rotulo: p.nome }))}
                defaultValue={areas[c] ?? ""}
              />
            </Campo>
          ))}
        </div>
      </fieldset>
      <Campo rotulo="Coordenação do diagnóstico" dica="Quem responde pelo prazo e pela entrega final">
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

export function CamposSolicitacao({ solicitacao, equipe, areas }: { solicitacao?: Solicitacao } & Equipe) {
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
      <CampoResponsavel equipe={equipe} areas={areas} valor={solicitacao?.responsavel_id} />
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

export function CamposIndicador({ indicador, equipe, areas }: { indicador?: Indicador } & Equipe) {
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
      <CampoResponsavel equipe={equipe} areas={areas} valor={indicador?.responsavel_id} />
      <Campo rotulo="Referência" dica="Como aparece no relatório. Ex.: até 10%, 55% a 65%">
        <Entrada name="referencia" defaultValue={indicador?.referencia ?? ""} />
      </Campo>
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Semáforo da central
        </legend>
        <div className="grid grid-cols-3 gap-3">
          <Campo rotulo="Mínimo">
            <Entrada name="ref_min" inputMode="decimal" defaultValue={decimal(indicador?.ref_min)} />
          </Campo>
          <Campo rotulo="Máximo">
            <Entrada name="ref_max" inputMode="decimal" defaultValue={decimal(indicador?.ref_max)} />
          </Campo>
          <Campo rotulo="Folga (%)">
            <Entrada
              name="tolerancia"
              inputMode="decimal"
              placeholder={String(TOLERANCIA_PADRAO)}
              defaultValue={decimal(indicador?.tolerancia)}
            />
          </Campo>
        </div>
        <p className="text-xs text-slate-500">
          Dentro da faixa fica verde. Fora dela até a folga, amarelo; além disso, vermelho. Deixe só uma ponta para
          “até” ou “pelo menos”.
        </p>
        <Campo rotulo="Cor fixa" dica="Use quando o número engana. Explique no campo Análise.">
          <Selecao
            name="cor_manual"
            opcoes={CORES.map((c) => ({ valor: c, rotulo: NOME_COR[c] }))}
            vazio="Calcular pela faixa"
            defaultValue={indicador?.cor_manual ?? ""}
          />
        </Campo>
        <Campo rotulo="O que significa, para o dono" dica="Uma frase simples que aparece na central.">
          <AreaTexto name="significado" defaultValue={indicador?.significado ?? ""} rows={2} />
        </Campo>
      </fieldset>
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

export function CamposAchado({ achado, equipe, areas }: { achado?: Achado } & Equipe) {
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
      <CampoResponsavel equipe={equipe} areas={areas} valor={achado?.responsavel_id} />
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

export function CamposOportunidade({ oportunidade, equipe, areas }: { oportunidade?: Oportunidade } & Equipe) {
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
      <CampoResponsavel equipe={equipe} areas={areas} valor={oportunidade?.responsavel_id} />
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
