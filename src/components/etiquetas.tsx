import { Etiqueta, type Tom } from "@/components/ui";
import { NOME_COR, type Cor, type Prioridade } from "@/lib/dominio";

const TOM_STATUS: Record<string, Tom> = {
  // diagnóstico
  Coleta: "ambar",
  "Em análise": "azul",
  Revisão: "roxo",
  Apresentação: "roxo",
  Concluído: "verde",
  // solicitação
  Pendente: "cinza",
  Solicitado: "ambar",
  Recebido: "verde",
  "Não disponível": "vermelho",
  // achado / oportunidade
  Aberto: "ambar",
  Aberta: "ambar",
  "Endereçado no plano": "azul",
  "Endereçada no plano": "azul",
  Resolvido: "verde",
  Capturada: "verde",
  Descartado: "cinza",
  Descartada: "cinza",
  // ação
  "A fazer": "cinza",
  "Em andamento": "azul",
  Concluída: "verde",
  Cancelada: "cinza",
};

export function tomDoStatus(status: string): Tom {
  return TOM_STATUS[status] ?? "cinza";
}

export function EtiquetaStatus({ status }: { status: string }) {
  return <Etiqueta tom={tomDoStatus(status)}>{status}</Etiqueta>;
}

const TOM_PRIORIDADE: Record<Prioridade, Tom> = { Alta: "vermelho", Média: "ambar", Baixa: "cinza" };

export function EtiquetaPrioridade({
  prioridade,
  manual,
}: {
  prioridade: Prioridade;
  manual?: boolean;
}) {
  return (
    <Etiqueta
      tom={TOM_PRIORIDADE[prioridade]}
      title={manual ? "Prioridade ajustada manualmente" : undefined}
    >
      <span
        className={
          prioridade === "Alta"
            ? "size-1.5 rounded-full bg-red-500"
            : prioridade === "Média"
              ? "size-1.5 rounded-full bg-amber-500"
              : "size-1.5 rounded-full bg-slate-400"
        }
      />
      {prioridade}
      {manual && <span aria-hidden>*</span>}
    </Etiqueta>
  );
}

const ESTILO_COR: Record<Cor, { ponto: string; tom: Tom }> = {
  bom: { ponto: "bg-emerald-500", tom: "verde" },
  atencao: { ponto: "bg-amber-500", tom: "ambar" },
  ruim: { ponto: "bg-red-500", tom: "vermelho" },
};

// Bolinha do semáforo ao lado do valor do indicador.
export function PontoCor({ cor, className }: { cor: Cor | null; className?: string }) {
  if (!cor) return null;
  return (
    <span
      title={NOME_COR[cor]}
      className={`inline-block size-2 shrink-0 rounded-full ${ESTILO_COR[cor].ponto} ${className ?? ""}`}
    />
  );
}

export function EtiquetaCor({ cor }: { cor: Cor }) {
  return (
    <Etiqueta tom={ESTILO_COR[cor].tom}>
      <span className={`size-1.5 rounded-full ${ESTILO_COR[cor].ponto}`} />
      {NOME_COR[cor]}
    </Etiqueta>
  );
}
