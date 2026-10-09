import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { CabecalhoPagina, Cartao, LogoEmpresa, Vazio } from "@/components/ui";
import { empresasDaCentral, perfilAtual } from "@/lib/central";

// Entrada da central: com uma clínica só, vai direto para ela.
export default async function PaginaCentral() {
  const [perfil, empresas] = await Promise.all([perfilAtual(), empresasDaCentral()]);
  if (empresas.length === 1) redirect(`/central/${empresas[0].id}`);

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${perfil?.nome.split(" ")[0] ?? ""}`}
        subtitulo="Escolha a clínica para ver o resumo."
      />
      {empresas.length === 0 ? (
        <Cartao>
          <Vazio icone={<Building2 />}>
            {perfil?.papel === "equipe"
              ? "Para ver a central de uma clínica, abra a clínica no sistema e use “Ver como o cliente”."
              : "Seu e-mail ainda não foi ligado a nenhuma clínica. Fale com a assessoria. Se você é da equipe, peça a um sócio para liberar seu acesso em Configurações."}
          </Vazio>
        </Cartao>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {empresas.map((e) => (
            <Link key={e.id} href={`/central/${e.id}`}>
              <Cartao className="flex items-center gap-3 p-4 transition-colors hover:border-marca-300">
                <LogoEmpresa nome={e.nome} logo={e.logo_url} />
                <span className="font-medium text-slate-900">{e.nome}</span>
              </Cartao>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
