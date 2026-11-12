"use client";

import { CircleCheck } from "lucide-react";
import { useActionState } from "react";
import { CamposCadastro } from "@/components/cadastro";
import { Botao, Campo, Cartao, Entrada } from "@/components/ui";
import type { DadosEmpresaCentral } from "@/lib/central";
import { salvarDadosEmpresa } from "@/server/central";

// Cadastro da empresa preenchido pelo cliente: os mesmos campos que a equipe usa, mais o responsável.
export function FormularioDados({ dados }: { dados: DadosEmpresaCentral }) {
  const [estado, acao, pendente] = useActionState(salvarDadosEmpresa.bind(null, dados.id), undefined);
  const r = dados.responsavel;

  return (
    <Cartao className="p-5 sm:p-6">
      <form action={acao} className="space-y-6">
        {/* O nome fantasia da Receita não entra: o nome da empresa no AXIS fica com a assessoria. */}
        <CamposCadastro valores={dados} campoNome="nome_fantasia_receita" ladoALado />

        <fieldset className="space-y-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Responsável</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <Entrada name="responsavel_nome" defaultValue={r?.nome ?? ""} autoComplete="name" />
            </Campo>
            <Campo rotulo="Cargo">
              <Entrada name="responsavel_cargo" defaultValue={r?.cargo ?? ""} placeholder="Ex.: sócia, gerente" />
            </Campo>
            <Campo rotulo="Telefone / WhatsApp">
              <Entrada name="responsavel_telefone" defaultValue={r?.telefone ?? ""} inputMode="tel" autoComplete="tel" />
            </Campo>
            <Campo rotulo="E-mail">
              <Entrada name="responsavel_email" type="email" defaultValue={r?.email ?? ""} autoComplete="email" />
            </Campo>
          </div>
        </fieldset>

        {estado?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>}
        {estado?.ok && !pendente && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CircleCheck className="size-4" />
            Dados salvos. Obrigado! A assessoria já consegue ver.
          </p>
        )}
        <div className="flex justify-end">
          <Botao type="submit" className="h-11 w-full sm:w-auto" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar dados"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
