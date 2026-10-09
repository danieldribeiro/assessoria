import { DocumentoRelatorio } from "@/components/relatorio";
import { assessoriaDaCentral, diagnosticoDaCentral } from "@/lib/central";

export async function generateMetadata({ params }: PageProps<"/central/relatorio/[id]">) {
  const { id } = await params;
  const d = await diagnosticoDaCentral(id);
  return { title: `Relatório ${d.empresa.nome}` };
}

// Relatório de um diagnóstico publicado, como o dono da clínica vê.
export default async function RelatorioDaCentral({ params }: PageProps<"/central/relatorio/[id]">) {
  const { id } = await params;
  const [d, assessoria] = await Promise.all([diagnosticoDaCentral(id), assessoriaDaCentral()]);
  return (
    <DocumentoRelatorio
      d={d}
      assessoria={assessoria}
      voltar={{ href: `/central/${d.empresa.id}`, rotulo: "Voltar à central" }}
    />
  );
}
