import { Building2 } from "lucide-react";
import { notFound } from "next/navigation";
import { Cartao, LogoEmpresa, Vazio } from "@/components/ui";
import { dadosDaEmpresa, empresaDaCentral, financeiroNaCentral, perfilAtual } from "@/lib/central";
import { AbasCentral } from "../abas";
import { FormularioDados } from "./formulario";

// Dados da empresa preenchidos pelo próprio cliente: CNPJ, inscrições, endereço e responsável (base para as notas).
export const metadata = { title: "Dados da empresa" };

export default async function PaginaCentralDados({ params }: PageProps<"/central/[empresa]/dados">) {
  const { empresa: empresaId } = await params;
  const perfil = await perfilAtual();
  if (!perfil) notFound();
  const [empresa, comFinanceiro, dados] = await Promise.all([
    empresaDaCentral(empresaId, perfil.papel),
    financeiroNaCentral(empresaId, perfil.papel),
    dadosDaEmpresa(empresaId),
  ]);
  if (!empresa) notFound();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <LogoEmpresa nome={empresa.nome} logo={empresa.logo_url} largo className="size-14 text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{empresa.nome}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Confira e complete os dados da sua empresa. A assessoria usa para as notas fiscais e os contatos.
          </p>
        </div>
      </div>
      <AbasCentral empresaId={empresaId} atual="dados" financeiro={comFinanceiro} />

      {dados ? (
        <FormularioDados dados={dados} />
      ) : (
        <Cartao>
          <Vazio icone={<Building2 />}>Esta tela ainda está sendo preparada. Volte em breve.</Vazio>
        </Cartao>
      )}
    </>
  );
}
