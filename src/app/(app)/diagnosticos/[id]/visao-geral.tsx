import { Eye, MonitorSmartphone, Send } from "lucide-react";
import Link from "next/link";
import { BotaoAcao } from "@/components/controles";
import { EtiquetaPrioridade, EtiquetaStatus } from "@/components/etiquetas";
import { PainelLateral } from "@/components/painel-lateral";
import { AreaTexto, CabecalhoCartao, Campo, Cartao, Etiqueta, Vazio, classeBotao, cx } from "@/components/ui";
import { atrasada, formatarData } from "@/lib/datas";
import type { DiagnosticoCompleto } from "@/lib/consultas";
import { despublicarDiagnostico, publicarDiagnostico, salvarRecado } from "@/server/central";
import { salvarConclusoes } from "@/server/diagnosticos";

// Publicação na central da clínica: o que o dono vê, o recado e o atalho para conferir.
function CartaoCentral({ d }: { d: DiagnosticoCompleto }) {
  const publicado = Boolean(d.publicado_em);
  return (
    <Cartao className={cx(publicado && "border-emerald-200")}>
      <CabecalhoCartao titulo="Central da clínica" icone={<MonitorSmartphone />}>
        {publicado ? <Etiqueta tom="verde">Publicado</Etiqueta> : <Etiqueta tom="cinza">Não publicado</Etiqueta>}
      </CabecalhoCartao>
      <div className="space-y-4 px-5 py-4 text-sm">
        <p className="text-slate-600">
          {publicado
            ? `O dono vê este diagnóstico desde ${formatarData(d.publicado_em!.slice(0, 10))}. O que vocês mudarem aparece na hora.`
            : "O dono da clínica só vê o resumo e o relatório depois que vocês publicarem."}
        </p>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recado para o cliente</span>
            <PainelLateral
              titulo="Recado para o cliente"
              gatilho={d.recado ? "Editar" : "Escrever"}
              classeGatilho="text-xs font-medium text-marca-700 hover:underline"
              acao={salvarRecado.bind(null, d.id)}
              aviso="Recado salvo"
            >
              <Campo rotulo="Recado" dica="Duas ou três frases que abrem a central. Fale como falaria com o dono.">
                <AreaTexto name="recado" defaultValue={d.recado ?? ""} rows={6} />
              </Campo>
            </PainelLateral>
          </div>
          <Texto texto={d.recado} vazio="Sem recado." />
        </div>
        <div className="flex flex-wrap gap-2">
          {publicado ? (
            <BotaoAcao
              acao={despublicarDiagnostico.bind(null, d.id)}
              className={classeBotao("secundario", true)}
              aviso="Diagnóstico retirado da central"
              pergunta="Tirar este diagnóstico da central? O dono deixa de vê-lo."
            >
              Tirar da central
            </BotaoAcao>
          ) : (
            <BotaoAcao
              acao={publicarDiagnostico.bind(null, d.id)}
              className={classeBotao("primario", true)}
              aviso="Publicado na central"
              pergunta="Publicar este diagnóstico? O dono da clínica passa a ver o resumo e o relatório."
            >
              <Send />
              Publicar na central
            </BotaoAcao>
          )}
          <Link href={`/central/${d.empresa.id}?d=${d.id}`} className={classeBotao("fantasma", true)}>
            <Eye />
            Ver como o cliente
          </Link>
        </div>
      </div>
    </Cartao>
  );
}

function Texto({ texto, vazio }: { texto: string | null; vazio: string }) {
  return texto ? (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{texto}</p>
  ) : (
    <p className="text-sm text-slate-400">{vazio}</p>
  );
}

export function AbaVisaoGeral({ d }: { d: DiagnosticoCompleto }) {
  const problemas = d.achados.filter((a) => a.status !== "Descartado" && a.status !== "Resolvido").slice(0, 5);
  const oportunidades = d.oportunidades
    .filter((o) => o.status !== "Descartada" && o.status !== "Capturada")
    .slice(0, 5);
  const acoes = d.acoes.filter((a) => a.status === "A fazer" || a.status === "Em andamento").slice(0, 5);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Cartao>
          <CabecalhoCartao titulo="Conclusões do diagnóstico">
            <PainelLateral
              titulo="Conclusões do diagnóstico"
              gatilho="Editar"
              classeGatilho={classeBotao("fantasma", true)}
              acao={salvarConclusoes.bind(null, d.id)}
            >
              <Campo rotulo="Situação atual da empresa" dica="Resumo objetivo que abre o relatório final">
                <AreaTexto name="situacao_atual" defaultValue={d.situacao_atual ?? ""} rows={10} />
              </Campo>
              <Campo rotulo="Recomendações gerais">
                <AreaTexto name="recomendacoes" defaultValue={d.recomendacoes ?? ""} rows={10} />
              </Campo>
            </PainelLateral>
          </CabecalhoCartao>
          <div className="space-y-5 px-5 py-5">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Situação atual</h3>
              <Texto texto={d.situacao_atual} vazio="Ainda não escrita. Vai para o início do relatório final." />
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Recomendações</h3>
              <Texto texto={d.recomendacoes} vazio="Ainda não escritas." />
            </div>
          </div>
        </Cartao>

        <div className="grid gap-6 md:grid-cols-2">
          <ListaDestaques
            titulo="Principais problemas"
            href={`/diagnosticos/${d.id}?aba=achados`}
            itens={problemas.map((a) => ({ id: a.id, titulo: a.titulo, prioridade: a.prioridade }))}
            vazio="Nenhum problema em aberto."
          />
          <ListaDestaques
            titulo="Principais oportunidades"
            href={`/diagnosticos/${d.id}?aba=oportunidades`}
            itens={oportunidades.map((o) => ({ id: o.id, titulo: o.titulo, prioridade: o.prioridade }))}
            vazio="Nenhuma oportunidade em aberto."
          />
        </div>
      </div>

      <div className="space-y-6">
        <CartaoCentral d={d} />
        <Cartao>
          <CabecalhoCartao titulo="Próximas ações">
            <Link href={`/diagnosticos/${d.id}?aba=plano`} className="text-xs text-marca-700 hover:underline">
              Ver plano
            </Link>
          </CabecalhoCartao>
          {acoes.length === 0 ? (
            <Vazio>Nenhuma ação pendente.</Vazio>
          ) : (
            <ul className="divide-y divide-slate-100">
              {acoes.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="text-sm text-slate-900">{a.acao}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <EtiquetaStatus status={a.status} />
                    <span className={cx(atrasada(a.prazo, a.status) && "font-medium text-red-600")}>
                      {formatarData(a.prazo)}
                    </span>
                    {a.responsavel && <span>· {a.responsavel}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="Observações internas" />
          <div className="px-5 py-3">
            <Texto texto={d.observacoes} vazio="Nenhuma. Edite o diagnóstico para registrar." />
          </div>
        </Cartao>
      </div>
    </div>
  );
}

function ListaDestaques({
  titulo,
  href,
  itens,
  vazio,
}: {
  titulo: string;
  href: string;
  itens: { id: string; titulo: string; prioridade: "Alta" | "Média" | "Baixa" }[];
  vazio: string;
}) {
  return (
    <Cartao>
      <CabecalhoCartao titulo={titulo}>
        <Link href={href} className="text-xs text-marca-700 hover:underline">
          Ver todos
        </Link>
      </CabecalhoCartao>
      {itens.length === 0 ? (
        <Vazio>{vazio}</Vazio>
      ) : (
        <ul className="divide-y divide-slate-100">
          {itens.map((i) => (
            <li key={i.id} className="flex items-start gap-2 px-5 py-2.5">
              <EtiquetaPrioridade prioridade={i.prioridade} />
              <span className="text-sm text-slate-800">{i.titulo}</span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
