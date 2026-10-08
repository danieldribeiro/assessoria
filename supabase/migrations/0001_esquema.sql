-- Esquema do sistema interno de diagnóstico.
-- Rodar uma vez no SQL Editor do Supabase (ou via `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------

create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- Prioridade a partir das notas 1–3: Impacto + Urgência + (4 − Esforço), de 3 a 9.
create or replace function public.calcular_prioridade(impacto int, urgencia int, esforco int)
returns text language sql immutable as $$
  select case
    when impacto + urgencia + (4 - esforco) >= 7 then 'Alta'
    when impacto + urgencia + (4 - esforco) >= 5 then 'Média'
    else 'Baixa'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Equipe (espelha auth.users)
-- ---------------------------------------------------------------------------

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null
);

create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- ---------------------------------------------------------------------------
-- Empresas e contatos
-- ---------------------------------------------------------------------------

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  segmento text not null default 'Odontologia',
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);

create table public.contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  cargo text,
  telefone text,
  email text,
  responsavel boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
create index on public.contatos (empresa_id);

-- ---------------------------------------------------------------------------
-- Diagnósticos
-- ---------------------------------------------------------------------------

create table public.diagnosticos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null,
  data_inicio date not null default current_date,
  data_prevista date,
  status text not null default 'Coleta'
    check (status in ('Coleta', 'Em análise', 'Revisão', 'Apresentação', 'Concluído')),
  responsavel_id uuid references public.perfis (id) on delete set null,
  pasta_url text,
  situacao_atual text,
  recomendacoes text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null,
  check (periodo_fim >= periodo_inicio)
);
create index on public.diagnosticos (empresa_id);
create index on public.diagnosticos (status);

create table public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  categoria text not null
    check (categoria in ('Financeiro', 'Operacional', 'Comercial', 'Pessoas', 'Geral')),
  item text not null,
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Solicitado', 'Recebido', 'Não disponível')),
  data_solicitacao date,
  data_recebimento date,
  link text,
  observacao text,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
create index on public.solicitacoes (diagnostico_id);

create table public.indicadores (
  id uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  categoria text not null
    check (categoria in ('Financeiro', 'Operacional', 'Comercial', 'Pessoas', 'Geral')),
  nome text not null,
  valor numeric,
  unidade text check (unidade in ('R$', '%', 'qtd', 'dias', 'horas')),
  periodo text,
  referencia text,
  observacao text,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
create index on public.indicadores (diagnostico_id);

create table public.achados (
  id uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  categoria text not null
    check (categoria in ('Financeiro', 'Operacional', 'Comercial', 'Pessoas', 'Geral')),
  titulo text not null,
  descricao text,
  evidencia text,
  causa_provavel text,
  impacto text,
  nota_impacto smallint not null default 2 check (nota_impacto between 1 and 3),
  nota_urgencia smallint not null default 2 check (nota_urgencia between 1 and 3),
  nota_esforco smallint not null default 2 check (nota_esforco between 1 and 3),
  prioridade_manual text check (prioridade_manual in ('Alta', 'Média', 'Baixa')),
  prioridade text generated always as (
    coalesce(prioridade_manual, public.calcular_prioridade(nota_impacto, nota_urgencia, nota_esforco))
  ) stored,
  status text not null default 'Aberto'
    check (status in ('Aberto', 'Endereçado no plano', 'Resolvido', 'Descartado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
create index on public.achados (diagnostico_id);

create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  categoria text not null
    check (categoria in ('Financeiro', 'Operacional', 'Comercial', 'Pessoas', 'Geral')),
  titulo text not null,
  descricao text,
  potencial_impacto text,
  esforco_estimado text,
  nota_impacto smallint not null default 2 check (nota_impacto between 1 and 3),
  nota_urgencia smallint not null default 2 check (nota_urgencia between 1 and 3),
  nota_esforco smallint not null default 2 check (nota_esforco between 1 and 3),
  prioridade_manual text check (prioridade_manual in ('Alta', 'Média', 'Baixa')),
  prioridade text generated always as (
    coalesce(prioridade_manual, public.calcular_prioridade(nota_impacto, nota_urgencia, nota_esforco))
  ) stored,
  status text not null default 'Aberta'
    check (status in ('Aberta', 'Endereçada no plano', 'Capturada', 'Descartada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null
);
create index on public.oportunidades (diagnostico_id);

create table public.acoes (
  id uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references public.diagnosticos (id) on delete cascade,
  acao text not null,
  achado_id uuid references public.achados (id) on delete set null,
  oportunidade_id uuid references public.oportunidades (id) on delete set null,
  responsavel text,
  prazo date,
  prioridade text not null default 'Média' check (prioridade in ('Alta', 'Média', 'Baixa')),
  status text not null default 'A fazer'
    check (status in ('A fazer', 'Em andamento', 'Concluída', 'Cancelada')),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null,
  check (achado_id is null or oportunidade_id is null)
);
create index on public.acoes (diagnostico_id);

-- ---------------------------------------------------------------------------
-- atualizado_em automático
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['empresas', 'contatos', 'diagnosticos', 'solicitacoes',
                           'indicadores', 'achados', 'oportunidades', 'acoes']
  loop
    execute format(
      'create trigger tocar_atualizado_em before update on public.%I
         for each row execute function public.tocar_atualizado_em()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acesso: só usuários autenticados (a equipe). Todos veem e editam tudo.
-- Novos cadastros devem ficar desativados no Supabase (ver README).
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['perfis', 'empresas', 'contatos', 'diagnosticos', 'solicitacoes',
                           'indicadores', 'achados', 'oportunidades', 'acoes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy equipe on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;
