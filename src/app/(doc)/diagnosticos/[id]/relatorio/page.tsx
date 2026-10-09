import { redirect } from "next/navigation";
import { DocumentoRelatorio } from "@/components/relatorio";
import { perfilAtual } from "@/lib/central";
import { carregarAssessoria, carregarDiagnostico } from "@/lib/consultas";

export async function generateMetadata({ params }: PageProps<"/diagnosticos/[id]/relatorio">) {
  const { id } = await params;
  if ((await perfilAtual())?.papel === "cliente") return { title: "Relatório" };
  const d = await carregarDiagnostico(id);
  return { title: `Relatório ${d.empresa.nome}` };
}

export default async function Relatorio({ params }: PageProps<"/diagnosticos/[id]/relatorio">) {
  const { id } = await params;
  // O dono da clínica vê o relatório pela central.
  if ((await perfilAtual())?.papel === "cliente") redirect(`/central/relatorio/${id}`);
  const [d, assessoria] = await Promise.all([carregarDiagnostico(id), carregarAssessoria()]);
  return (
    <DocumentoRelatorio
      d={d}
      assessoria={assessoria}
      voltar={{ href: `/diagnosticos/${d.id}`, rotulo: "Voltar ao diagnóstico" }}
    />
  );
}
