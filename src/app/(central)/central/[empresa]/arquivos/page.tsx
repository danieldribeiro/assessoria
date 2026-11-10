import { notFound } from "next/navigation";
import { ListaDeEnvios, SeletorDeMes, SemLista } from "@/components/envios";
import { LogoEmpresa } from "@/components/ui";
import { empresaDaCentral, financeiroNaCentral, perfilAtual } from "@/lib/central";
import { hoje as hojeLocal } from "@/lib/datas";
import { competenciaPadrao, lerMes, somarMeses } from "@/lib/envios";
import { carregarEnvios } from "@/lib/envios-consultas";
import { AbasCentral } from "../abas";

// Envio de arquivos pela clínica: a lista do mês, o que é só uma vez e os avulsos (boletos, notas).
export const metadata = { title: "Enviar arquivos" };

export default async function PaginaCentralArquivos({ params, searchParams }: PageProps<"/central/[empresa]/arquivos">) {
  const { empresa: empresaId } = await params;
  const { mes } = await searchParams;
  const perfil = await perfilAtual();
  if (!perfil) notFound();
  const [empresa, comFinanceiro, dados] = await Promise.all([
    empresaDaCentral(empresaId, perfil.papel),
    financeiroNaCentral(empresaId, perfil.papel),
    carregarEnvios(empresaId),
  ]);
  if (!empresa) notFound();

  const hoje = hojeLocal();
  const padrao = competenciaPadrao(hoje);
  const meses = [0, 1, 2, 3].map((i) => somarMeses(padrao, -i));
  const pedido = lerMes(typeof mes === "string" ? mes : undefined);
  const competencia = pedido && meses.includes(pedido) ? pedido : padrao;
  const temLista = dados.itens.some((i) => i.ativo);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <LogoEmpresa nome={empresa.nome} logo={empresa.logo_url} largo className="size-14 text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{empresa.nome}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mande aqui os arquivos do mês. Só a sua clínica e a assessoria veem o que você envia.
          </p>
        </div>
      </div>
      <AbasCentral empresaId={empresaId} atual="arquivos" financeiro={comFinanceiro} />

      {!dados.disponivel || !temLista ? (
        <SemLista>A assessoria ainda está montando a sua lista de arquivos. Ela aparece aqui assim que estiver pronta.</SemLista>
      ) : (
        <>
          <SeletorDeMes meses={meses} atual={competencia} href={(m) => `/central/${empresaId}/arquivos?mes=${m.slice(0, 7)}`} />
          <ListaDeEnvios
            empresaId={empresaId}
            competencia={competencia}
            hoje={hoje}
            itens={dados.itens}
            arquivos={dados.arquivos}
            dispensas={dados.dispensas}
          />
          <p className="mt-6 text-xs text-slate-500">
            Formatos aceitos: OFX, PDF, CSV, XLS, XLSX, JPG e PNG, até 20 MB cada. Nunca mande senhas. Se enviou algo errado,
            avise a assessoria.
          </p>
        </>
      )}
    </>
  );
}
