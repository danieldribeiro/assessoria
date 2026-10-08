import { Plus } from "lucide-react";
import { BotaoExcluir, SeletorImediato } from "@/components/controles";
import { EtiquetaPrioridade } from "@/components/etiquetas";
import { CamposAcao, CamposAchado, CamposOportunidade } from "@/components/formularios";
import { PainelLateral } from "@/components/painel-lateral";
import { Cartao, Etiqueta, Vazio, classeBotao } from "@/components/ui";
import { NOTAS, STATUS_ACHADO, STATUS_OPORTUNIDADE, type Achado, type Oportunidade } from "@/lib/dominio";
import { filtrarPorResponsavel } from "@/lib/consultas";
import { BarraFiltro, ResponsavelDoItem, type PropsAba } from "./responsaveis";
import {
  excluirAchado,
  excluirOportunidade,
  mudarStatusAchado,
  mudarStatusOportunidade,
  salvarAchado,
  salvarOportunidade,
} from "@/server/analise";
import { salvarAcao } from "@/server/plano";

function Notas({ item }: { item: Achado | Oportunidade }) {
  const notas = [
    ["Impacto", NOTAS.impacto[item.nota_impacto - 1]],
    ["Urgência", NOTAS.urgencia[item.nota_urgencia - 1]],
    ["Esforço", NOTAS.esforco[item.nota_esforco - 1]],
  ];
  return (
    <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
      {notas.map(([rotulo, valor]) => (
        <span key={rotulo} className="rounded bg-slate-50 px-1.5 py-0.5 ring-1 ring-inset ring-slate-200">
          {rotulo} <span className="font-medium text-slate-700">{valor}</span>
        </span>
      ))}
    </div>
  );
}

function Detalhe({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{rotulo}</dt>
      <dd className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{texto}</dd>
    </div>
  );
}

function ResumoPrioridades({ itens }: { itens: (Achado | Oportunidade)[] }) {
  const n = (p: string) => itens.filter((i) => i.prioridade === p).length;
  return (
    <div className="flex items-center gap-3 text-sm text-slate-500">
      {(["Alta", "Média", "Baixa"] as const).map((p) => (
        <span key={p} className="flex items-center gap-1.5">
          <EtiquetaPrioridade prioridade={p} />
          <span className="tabular-nums font-medium text-slate-700">{n(p)}</span>
        </span>
      ))}
    </div>
  );
}

export function AbaAchados({ d, de, usuarioId }: PropsAba) {
  const lista = filtrarPorResponsavel(d.achados, d.responsaveis_area, de);
  return (
    <div className="space-y-4">
      <BarraFiltro d={d} de={de} usuarioId={usuarioId} aba="achados" itens={d.achados} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResumoPrioridades itens={lista} />
        <PainelLateral
          titulo="Novo achado"
          gatilho={
            <>
              <Plus />
              Novo achado
            </>
          }
          classeGatilho={classeBotao("primario")}
          acao={salvarAchado.bind(null, d.id, null)}
        >
          <CamposAchado equipe={d.equipe} areas={d.responsaveis_area} />
        </PainelLateral>
      </div>

      {lista.length === 0 && (
        <Cartao>
          <Vazio>
            Nenhum achado ainda. Registre cada problema que a análise revelar, com a evidência, a causa provável
            e o impacto.
          </Vazio>
        </Cartao>
      )}

      {lista.map((a) => (
        <Cartao key={a.id} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <EtiquetaPrioridade prioridade={a.prioridade} manual={!!a.prioridade_manual} />
              <Etiqueta>{a.categoria}</Etiqueta>
              <ResponsavelDoItem d={d} item={a} />
            </div>
            <div className="flex items-center gap-2">
              <SeletorImediato
                key={a.status}
                etiqueta
                rotulo="Status"
                valor={a.status}
                opcoes={STATUS_ACHADO}
                acao={mudarStatusAchado.bind(null, a.id)}
              />
              <PainelLateral
                titulo="Nova ação"
                gatilho={
            <>
              <Plus />
              Ação
            </>
          }
                classeGatilho={classeBotao("secundario", true)}
                acao={salvarAcao.bind(null, d.id, null)}
                aviso="Ação criada no plano"
              >
                <CamposAcao
                  achados={d.achados}
                  oportunidades={d.oportunidades}
                  relacionadoPadrao={`achado:${a.id}`}
                  prioridadePadrao={a.prioridade}
                />
              </PainelLateral>
            </div>
          </div>
          <PainelLateral
            titulo="Achado"
            gatilho={a.titulo}
            classeGatilho="mt-2 text-left text-base font-semibold text-slate-900 hover:text-marca-700"
            acao={salvarAchado.bind(null, d.id, a.id)}
            rodape={<BotaoExcluir acao={excluirAchado.bind(null, a.id)} pergunta={`Excluir “${a.titulo}”?`} />}
          >
            <CamposAchado achado={a} equipe={d.equipe} areas={d.responsaveis_area} />
          </PainelLateral>
          {a.descricao && <p className="mt-0.5 text-sm text-slate-600">{a.descricao}</p>}
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Detalhe rotulo="Evidência" texto={a.evidencia} />
            <Detalhe rotulo="Causa provável" texto={a.causa_provavel} />
            <Detalhe rotulo="Impacto" texto={a.impacto} />
          </dl>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Notas item={a} />
            <AcoesVinculadas n={d.acoes.filter((x) => x.achado_id === a.id).length} />
          </div>
        </Cartao>
      ))}
    </div>
  );
}

export function AbaOportunidades({ d, de, usuarioId }: PropsAba) {
  const lista = filtrarPorResponsavel(d.oportunidades, d.responsaveis_area, de);
  return (
    <div className="space-y-4">
      <BarraFiltro d={d} de={de} usuarioId={usuarioId} aba="oportunidades" itens={d.oportunidades} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResumoPrioridades itens={lista} />
        <PainelLateral
          titulo="Nova oportunidade"
          gatilho={
            <>
              <Plus />
              Nova oportunidade
            </>
          }
          classeGatilho={classeBotao("primario")}
          acao={salvarOportunidade.bind(null, d.id, null)}
        >
          <CamposOportunidade equipe={d.equipe} areas={d.responsaveis_area} />
        </PainelLateral>
      </div>

      {lista.length === 0 && (
        <Cartao>
          <Vazio>
            Nenhuma oportunidade ainda. Registre o que pode gerar ganho para o cliente, mesmo sem um problema por
            trás.
          </Vazio>
        </Cartao>
      )}

      {lista.map((o) => (
        <Cartao key={o.id} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <EtiquetaPrioridade prioridade={o.prioridade} manual={!!o.prioridade_manual} />
              <Etiqueta>{o.categoria}</Etiqueta>
              <ResponsavelDoItem d={d} item={o} />
            </div>
            <div className="flex items-center gap-2">
              <SeletorImediato
                key={o.status}
                etiqueta
                rotulo="Status"
                valor={o.status}
                opcoes={STATUS_OPORTUNIDADE}
                acao={mudarStatusOportunidade.bind(null, o.id)}
              />
              <PainelLateral
                titulo="Nova ação"
                gatilho={
            <>
              <Plus />
              Ação
            </>
          }
                classeGatilho={classeBotao("secundario", true)}
                acao={salvarAcao.bind(null, d.id, null)}
                aviso="Ação criada no plano"
              >
                <CamposAcao
                  achados={d.achados}
                  oportunidades={d.oportunidades}
                  relacionadoPadrao={`oportunidade:${o.id}`}
                  prioridadePadrao={o.prioridade}
                />
              </PainelLateral>
            </div>
          </div>
          <PainelLateral
            titulo="Oportunidade"
            gatilho={o.titulo}
            classeGatilho="mt-2 text-left text-base font-semibold text-slate-900 hover:text-marca-700"
            acao={salvarOportunidade.bind(null, d.id, o.id)}
            rodape={<BotaoExcluir acao={excluirOportunidade.bind(null, o.id)} pergunta={`Excluir “${o.titulo}”?`} />}
          >
            <CamposOportunidade oportunidade={o} equipe={d.equipe} areas={d.responsaveis_area} />
          </PainelLateral>
          {o.descricao && <p className="mt-0.5 text-sm text-slate-600">{o.descricao}</p>}
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Detalhe rotulo="Potencial impacto" texto={o.potencial_impacto} />
            <Detalhe rotulo="Esforço estimado" texto={o.esforco_estimado} />
          </dl>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Notas item={o} />
            <AcoesVinculadas n={d.acoes.filter((x) => x.oportunidade_id === o.id).length} />
          </div>
        </Cartao>
      ))}
    </div>
  );
}

function AcoesVinculadas({ n }: { n: number }) {
  return (
    <span className="text-xs text-slate-500">
      {n === 0 ? "Sem ações no plano" : `${n} ${n > 1 ? "ações" : "ação"} no plano`}
    </span>
  );
}
