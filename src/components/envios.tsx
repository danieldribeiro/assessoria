import { CalendarClock, Download, FolderUp, Pencil, Plus, Receipt, Repeat } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BotaoAcao, BotaoExcluir } from "@/components/controles";
import { EnviarArquivo } from "@/components/enviar-arquivo";
import { PainelLateral } from "@/components/painel-lateral";
import { AreaTexto, CabecalhoCartao, Campo, Cartao, Entrada, Etiqueta, Selecao, Vazio, classeBotao, cx, type Tom } from "@/components/ui";
import { formatarData } from "@/lib/datas";
import {
  arquivosDoItem,
  formatarTamanho,
  inicioDoMes,
  nomeDoMes,
  prazoDoMes,
  resumo,
  situacaoDoItem,
  type ArquivoEnvio,
  type DispensaEnvio,
  type ItemEnvio,
  type Situacao,
} from "@/lib/envios";
import { definirItemAtivo, desfazerDispensa, dispensarItem, excluirArquivo, salvarItem } from "@/server/envios";

const ETIQUETA: Record<Situacao, { tom: Tom; texto: string }> = {
  recebido: { tom: "verde", texto: "Recebido" },
  dispensado: { tom: "cinza", texto: "Dispensado" },
  pendente: { tom: "ambar", texto: "Pendente" },
  atrasado: { tom: "vermelho", texto: "Atrasado" },
};

type Props = {
  empresaId: string;
  competencia: string;
  hoje: string;
  itens: ItemEnvio[];
  arquivos: ArquivoEnvio[];
  dispensas: DispensaEnvio[];
  equipe?: boolean;
  nomes?: Record<string, string>;
};

// Lista do mês para o cliente e, com `equipe`, a mesma lista com as ações da assessoria.
export function ListaDeEnvios({ empresaId, competencia, hoje, itens, arquivos, dispensas, equipe, nomes = {} }: Props) {
  const ativos = itens.filter((i) => i.ativo);
  const mensais = ativos.filter((i) => i.frequencia === "mensal");
  const unicos = ativos.filter((i) => i.frequencia === "unica");
  const foraDaLista = itens.filter((i) => !i.ativo);
  const avulsos = arquivos.filter((a) => !a.item_id).slice(0, 20);
  const situacao = (i: ItemEnvio) => situacaoDoItem(i, competencia, arquivos, dispensas, hoje);
  const doMes = resumo(mensais.map(situacao));
  const iniciais = resumo(unicos.map(situacao));
  const prazo = prazoDoMes(competencia);

  const linha = (i: ItemEnvio) => (
    <LinhaItem
      key={i.id}
      item={i}
      situacao={situacao(i)}
      arquivos={arquivosDoItem(i, competencia, arquivos)}
      dispensa={dispensas.find((d) => d.item_id === i.id && d.competencia === competencia)}
      empresaId={empresaId}
      competencia={competencia}
      equipe={equipe}
      nomes={nomes}
    />
  );

  return (
    <div className="space-y-6">
      {mensais.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo={`Todo mês: ${nomeDoMes(competencia)}`} icone={<Repeat />}>
            <span className="text-xs text-slate-500">
              {doMes.faltam === 0 ? "Tudo certo" : `Faltam ${doMes.faltam} de ${doMes.total}`}
            </span>
          </CabecalhoCartao>
          <p className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-xs text-slate-600">
            <CalendarClock className="size-3.5 shrink-0 text-slate-400" />
            Arquivos referentes a {nomeDoMes(competencia)}, até {formatarData(prazo)}.
          </p>
          <ul className="divide-y divide-slate-100">{mensais.map(linha)}</ul>
        </Cartao>
      )}

      {unicos.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Uma vez, no início" icone={<FolderUp />}>
            <span className="text-xs text-slate-500">
              {iniciais.faltam === 0 ? "Tudo certo" : `Faltam ${iniciais.faltam} de ${iniciais.total}`}
            </span>
          </CabecalhoCartao>
          <ul className="divide-y divide-slate-100">{unicos.map(linha)}</ul>
        </Cartao>
      )}

      <Cartao>
        <CabecalhoCartao titulo="Contas a pagar e outros arquivos" icone={<Receipt />}>
          <EnviarArquivo empresaId={empresaId} itemId={null} competencia={inicioDoMes(hoje)} rotulo="Enviar" />
        </CabecalhoCartao>
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-600">
          Boletos e notas que chegam ao longo do mês podem vir na hora, sem esperar o dia 5.
        </p>
        {avulsos.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Nenhum arquivo avulso enviado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {avulsos.map((a) => (
              <li key={a.id} className="px-5 py-2.5">
                <LinhaArquivo arquivo={a} equipe={equipe} nomes={nomes} />
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {equipe && foraDaLista.length > 0 && (
        <Cartao>
          <CabecalhoCartao titulo="Fora da lista" contagem={foraDaLista.length} />
          <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
            O cliente não vê estes itens. Os arquivos que já chegaram continuam guardados.
          </p>
          <ul className="divide-y divide-slate-100">
            {foraDaLista.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 text-slate-600">
                  {i.nome} <span className="text-xs text-slate-400">({i.frequencia === "mensal" ? "todo mês" : "uma vez"})</span>
                </span>
                <BotaoAcao
                  acao={definirItemAtivo.bind(null, i.id, true)}
                  aviso="Item de volta na lista"
                  className={classeBotao("fantasma", true)}
                >
                  Devolver à lista
                </BotaoAcao>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}

function LinhaItem({
  item,
  situacao,
  arquivos,
  dispensa,
  empresaId,
  competencia,
  equipe,
  nomes,
}: {
  item: ItemEnvio;
  situacao: Situacao;
  arquivos: ArquivoEnvio[];
  dispensa?: DispensaEnvio;
  empresaId: string;
  competencia: string;
  equipe?: boolean;
  nomes: Record<string, string>;
}) {
  const etiqueta = ETIQUETA[situacao];
  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-900">{item.nome}</span>
            <Etiqueta tom={etiqueta.tom}>{etiqueta.texto}</Etiqueta>
          </div>
          {item.dica && <p className="mt-0.5 text-xs text-slate-500">{item.dica}</p>}
          {dispensa && (
            <p className="mt-1 text-xs text-slate-500">
              Dispensado pela assessoria neste mês{dispensa.motivo ? `: ${dispensa.motivo}` : "."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {equipe && <AcoesDaEquipe item={item} situacao={situacao} dispensa={dispensa} empresaId={empresaId} competencia={competencia} />}
          <EnviarArquivo
            empresaId={empresaId}
            itemId={item.id}
            competencia={item.frequencia === "mensal" ? competencia : null}
            rotulo={arquivos.length ? "Mais um" : "Anexar"}
            variante={situacao === "pendente" || situacao === "atrasado" ? "primario" : "secundario"}
          />
        </div>
      </div>
      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {arquivos.map((a) => (
            <li key={a.id}>
              <LinhaArquivo arquivo={a} equipe={equipe} nomes={nomes} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function LinhaArquivo({ arquivo, equipe, nomes }: { arquivo: ArquivoEnvio; equipe?: boolean; nomes: Record<string, string> }) {
  const quem = arquivo.enviado_por ? nomes[arquivo.enviado_por] : undefined;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
      <Link
        href={`/api/envios/${arquivo.id}`}
        prefetch={false}
        className="flex min-w-0 items-center gap-1.5 font-medium text-marca-700 hover:underline"
      >
        <Download className="size-3.5 shrink-0" />
        <span className="truncate">{arquivo.nome_arquivo}</span>
      </Link>
      <span className="flex shrink-0 items-center gap-2 text-slate-500">
        <span>
          {formatarData(arquivo.enviado_em.slice(0, 10))}
          {arquivo.tamanho !== null && ` · ${formatarTamanho(arquivo.tamanho)}`}
          {equipe && quem && ` · ${quem}`}
        </span>
        {equipe && (
          <BotaoExcluir
            acao={excluirArquivo.bind(null, arquivo.id)}
            pergunta={`Apagar ${arquivo.nome_arquivo}? O arquivo some para a clínica também; o registro fica no histórico.`}
            rotulo="Apagar"
          />
        )}
      </span>
    </div>
  );
}

function AcoesDaEquipe({
  item,
  situacao,
  dispensa,
  empresaId,
  competencia,
}: {
  item: ItemEnvio;
  situacao: Situacao;
  dispensa?: DispensaEnvio;
  empresaId: string;
  competencia: string;
}) {
  return (
    <>
      {dispensa ? (
        <BotaoAcao acao={desfazerDispensa.bind(null, dispensa.id)} aviso="Dispensa desfeita" className={classeBotao("fantasma", true)}>
          Desfazer dispensa
        </BotaoAcao>
      ) : (
        item.frequencia === "mensal" &&
        situacao !== "recebido" && (
          <PainelLateral
            titulo={`Dispensar em ${nomeDoMes(competencia)}`}
            gatilho="Dispensar"
            classeGatilho={classeBotao("fantasma", true)}
            acao={dispensarItem.bind(null, empresaId, item.id, competencia)}
            rotuloSalvar="Dispensar"
            aviso="Item dispensado neste mês"
          >
            <p className="rounded-md bg-marca-50 px-3 py-2 text-sm text-marca-800">
              “{item.nome}” deixa de contar como pendente só em {nomeDoMes(competencia)}. Nos outros meses continua na lista.
            </p>
            <Campo rotulo="Motivo" dica="Aparece para o cliente. Ex.: conta sem movimento no mês.">
              <Entrada name="motivo" />
            </Campo>
          </PainelLateral>
        )
      )}
      <PainelLateral
        titulo="Editar item"
        gatilho={
          <>
            <Pencil />
            Editar
          </>
        }
        classeGatilho={classeBotao("fantasma", true)}
        acao={salvarItem.bind(null, empresaId, item.id)}
        rodape={
          <BotaoAcao
            acao={definirItemAtivo.bind(null, item.id, false)}
            aviso="Item tirado da lista"
            pergunta={`Tirar “${item.nome}” da lista do cliente? Os arquivos já enviados continuam guardados.`}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Tirar da lista
          </BotaoAcao>
        }
      >
        <CamposItem item={item} />
      </PainelLateral>
    </>
  );
}

export function CamposItem({ item }: { item?: ItemEnvio }) {
  return (
    <>
      <Campo rotulo="O quê">
        <Entrada name="nome" required defaultValue={item?.nome ?? ""} />
      </Campo>
      <Campo rotulo="Quando">
        <Selecao
          name="frequencia"
          defaultValue={item?.frequencia ?? "mensal"}
          opcoes={[
            { valor: "mensal", rotulo: "Todo mês, até o dia 5" },
            { valor: "unica", rotulo: "Uma vez, no início" },
          ]}
        />
      </Campo>
      <Campo rotulo="Como o cliente tira o arquivo" dica="Formato e caminho no banco ou no sistema. Aparece para o cliente.">
        <AreaTexto name="dica" defaultValue={item?.dica ?? ""} />
      </Campo>
    </>
  );
}

export function NovoItem({ empresaId }: { empresaId: string }) {
  return (
    <PainelLateral
      titulo="Novo item da lista"
      gatilho={
        <>
          <Plus />
          Novo item
        </>
      }
      classeGatilho={classeBotao("secundario")}
      acao={salvarItem.bind(null, empresaId, null)}
      rotuloSalvar="Adicionar"
      aviso="Item adicionado"
    >
      <CamposItem />
    </PainelLateral>
  );
}

// Escolha do mês: o que está sendo fechado primeiro, depois os anteriores.
export function SeletorDeMes({ meses, atual, href }: { meses: string[]; atual: string; href: (mes: string) => string }) {
  return (
    <nav aria-label="Mês de referência" className="mb-4 flex flex-wrap gap-1.5">
      {meses.map((m) => (
        <Link
          key={m}
          href={href(m)}
          aria-current={m === atual ? "true" : undefined}
          className={cx(
            "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
            m === atual ? "bg-marca-600 text-white ring-marca-600" : "bg-superficie text-slate-600 ring-slate-200 hover:bg-slate-50",
          )}
        >
          {nomeDoMes(m)}
        </Link>
      ))}
    </nav>
  );
}

export function SemLista({ children }: { children: ReactNode }) {
  return (
    <Cartao>
      <Vazio icone={<FolderUp />}>{children}</Vazio>
    </Cartao>
  );
}
