"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { EntradaMoeda } from "@/components/entrada-moeda";
import { Campo, Entrada, Selecao } from "@/components/ui";
import { UNIDADES } from "@/lib/dominio";
import { colarMoeda, mascararMoeda, moedaParaCampo } from "@/lib/moeda";
import { FORMATOS_ACEITOS, paraCampoBR } from "@/lib/numeros";

// Os campos de número do indicador (valor, mínimo e máximo) ganham a máscara de reais quando a unidade é R$.
const Unidade = createContext<{ unidade: string; mudar: (u: string) => void }>({ unidade: "", mudar: () => {} });

export function UnidadeIndicador({ inicial, children }: { inicial: string; children: ReactNode }) {
  const [unidade, mudar] = useState(inicial);
  return <Unidade.Provider value={{ unidade, mudar }}>{children}</Unidade.Provider>;
}

export function SeletorUnidade() {
  const { unidade, mudar } = useContext(Unidade);
  return <Selecao name="unidade" opcoes={UNIDADES} vazio="—" value={unidade} onChange={(e) => mudar(e.target.value)} />;
}

export function CampoNumeroIndicador({
  rotulo,
  name,
  valor,
  dica,
  className,
  autoFocus,
}: {
  rotulo: string;
  name: string;
  valor: number | null | undefined;
  dica?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  const moeda = useContext(Unidade).unidade === "R$";
  const [texto, setTexto] = useState(() => (moeda ? moedaParaCampo(valor) : paraCampoBR(valor)));
  const [eraMoeda, setEraMoeda] = useState(moeda);
  // Ao trocar para R$, o que já foi digitado passa para o formato com máscara.
  if (moeda !== eraMoeda) {
    setEraMoeda(moeda);
    if (moeda) setTexto(colarMoeda(texto, true) ?? mascararMoeda(texto, "", true));
  }

  return (
    <Campo rotulo={rotulo} className={className} dica={dica ? (moeda ? "Digite só os números: os centavos entram sozinhos. “-” troca o sinal." : FORMATOS_ACEITOS) : undefined}>
      {moeda ? (
        <EntradaMoeda name={name} negativo value={texto} onChange={setTexto} autoFocus={autoFocus} />
      ) : (
        <Entrada name={name} inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus={autoFocus} />
      )}
    </Campo>
  );
}
