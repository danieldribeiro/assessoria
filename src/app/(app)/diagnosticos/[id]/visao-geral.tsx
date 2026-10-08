import Link from "next/link";
import { EtiquetaPrioridade, EtiquetaStatus } from "@/components/etiquetas";
import { PainelLateral } from "@/components/painel-lateral";
import { AreaTexto, CabecalhoCartao, Campo, Cartao, Vazio, classeBotao, cx } from "@/components/ui";
import { atrasada, formatarData } from "@/lib/datas";
import type { DiagnosticoCompleto } from "@/lib/consultas";
import { salvarConclusoes } from "@/server/diagnosticos";

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
