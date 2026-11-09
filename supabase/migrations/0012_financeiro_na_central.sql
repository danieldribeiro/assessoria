-- Financeiro na central da clínica, só para ver.
-- A equipe liga, empresa por empresa, uma chave que deixa quem tem acesso à central dessa empresa
-- ler o financeiro dela. O cliente nunca lança, edita, cancela, importa nem classifica: as regras de
-- gravação continuam pedindo 'lancar' ou 'administrar', que só a equipe tem.
-- Não muda nenhum dado: a chave nasce desligada em todas as empresas.

alter table public.empresas
  add column if not exists financeiro_na_central boolean not null default false;

-- O cliente logado vê o financeiro desta empresa? Precisa das duas coisas: acesso à central dela
-- e a chave ligada. Roda como dono porque o cliente não lê empresas nem acessos_central.
create or replace function public.cliente_ve_financeiro(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.acessos_central a
    join public.empresas e on e.id = a.empresa_id
    where a.empresa_id = p_empresa
      and a.email = public.email_atual()
      and a.email <> ''
      and e.financeiro_na_central
  );
$$;

-- Permissão única do financeiro (F1): a equipe faz tudo; o cliente com a chave ligada só lê.
create or replace function public.pode_usar_financeiro(p_empresa uuid, p_acao text)
returns boolean language sql stable set search_path = public as $$
  select p_empresa is not null
     and p_acao in ('ler', 'lancar', 'administrar')
     and (public.eh_equipe() or (p_acao = 'ler' and public.cliente_ve_financeiro(p_empresa)));
$$;

-- As 12 linhas fixas da DRE: a equipe e quem vê o financeiro de alguma empresa.
create or replace function public.cliente_ve_algum_financeiro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.acessos_central a
    join public.empresas e on e.id = a.empresa_id
    where a.email = public.email_atual() and a.email <> '' and e.financeiro_na_central
  );
$$;

drop policy if exists ler on public.fin_dre_secoes;
create policy ler on public.fin_dre_secoes for select to authenticated
  using (public.eh_equipe() or public.cliente_ve_algum_financeiro());

-- Nome da empresa para a tela do financeiro na central (o cliente não lê a tabela empresas).
-- Volta vazio se a pessoa não pode ver o financeiro desta empresa.
create or replace function public.central_financeiro_empresa(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'nome', e.nome, 'segmento', e.segmento)
  from public.empresas e
  where e.id = p_empresa and public.pode_usar_financeiro(p_empresa, 'ler');
$$;

revoke execute on function public.cliente_ve_financeiro(uuid), public.cliente_ve_algum_financeiro(), public.central_financeiro_empresa(uuid)
  from public, anon;
grant execute on function public.cliente_ve_financeiro(uuid), public.cliente_ve_algum_financeiro(), public.central_financeiro_empresa(uuid)
  to authenticated;
