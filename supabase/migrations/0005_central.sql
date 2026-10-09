-- Central da clínica: o dono da clínica entra no sistema e vê só a própria empresa.
-- A partir daqui, "logado" não basta: só quem tem papel 'equipe' lê e edita as tabelas.
-- O cliente nunca lê as tabelas direto; a central busca os dados pelas funções central_*.

-- ---------------------------------------------------------------------------
-- Papel de cada pessoa
-- ---------------------------------------------------------------------------

alter table public.perfis
  add column if not exists papel text not null default 'cliente' check (papel in ('equipe', 'cliente'));

-- Todo mundo que já existe hoje é da equipe.
update public.perfis set papel = 'equipe';

create or replace function public.eh_equipe()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'equipe');
$$;

-- E-mail de quem está logado, em minúsculas (vem do login por link, já confirmado).
create or replace function public.email_atual()
returns text language sql stable set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- ---------------------------------------------------------------------------
-- Regras das tabelas: só a equipe
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['perfis', 'empresas', 'contatos', 'diagnosticos', 'solicitacoes',
                           'indicadores', 'achados', 'oportunidades', 'acoes', 'assessoria']
  loop
    execute format('drop policy if exists equipe on public.%I', t);
    execute format(
      'create policy equipe on public.%I for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe())', t);
  end loop;
end;
$$;

-- Cada pessoa lê o próprio perfil (o cliente precisa do nome para a saudação).
create policy proprio on public.perfis for select to authenticated using (id = auth.uid());

-- Ninguém muda o próprio papel pela API: só pela função definir_papel.
revoke insert, update on public.perfis from authenticated, anon;
grant update (nome, cargo, telefone, foto_url) on public.perfis to authenticated;

-- Só a equipe envia fotos e logos.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  execute 'drop policy if exists "equipe envia imagens" on storage.objects';
  execute $p$create policy "equipe envia imagens" on storage.objects
    for insert to authenticated with check (bucket_id = 'imagens' and public.eh_equipe())$p$;
end $$;

-- ---------------------------------------------------------------------------
-- Quem pode entrar na central de cada clínica
-- ---------------------------------------------------------------------------

create table if not exists public.acessos_central (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  email text not null check (email = lower(email)),
  nome text,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null,
  unique (empresa_id, email)
);
create index if not exists acessos_central_email_idx on public.acessos_central (email);

alter table public.acessos_central enable row level security;
create policy equipe on public.acessos_central for all to authenticated
  using (public.eh_equipe()) with check (public.eh_equipe());

-- ---------------------------------------------------------------------------
-- Publicação e semáforo
-- ---------------------------------------------------------------------------

alter table public.diagnosticos
  add column if not exists publicado_em timestamptz,
  add column if not exists recado text;

alter table public.indicadores
  add column if not exists ref_min numeric,
  add column if not exists ref_max numeric,
  add column if not exists tolerancia numeric check (tolerancia between 0 and 100),
  add column if not exists significado text,
  add column if not exists cor_manual text check (cor_manual in ('bom', 'atencao', 'ruim'));

-- Faixas dos indicadores que já existem, pelo nome (as mesmas do modelo de odontologia).
update public.indicadores i
set ref_min = f.ref_min, ref_max = f.ref_max, significado = coalesce(i.significado, f.significado)
from (values
  ('Custos variáveis sobre faturamento', null::numeric, 40::numeric,
   'De cada R$ 100 faturados, quanto vai para repasses, materiais, laboratório e taxas de cartão.'),
  ('Margem de contribuição', 60, null,
   'De cada R$ 100 faturados, quanto sobra para pagar as despesas fixas e gerar lucro.'),
  ('Margem líquida', 10, null, 'De cada R$ 100 faturados, quanto vira lucro depois de pagar tudo.'),
  ('Inadimplência', null, 3, 'Parte do que foi vendido e não foi pago no prazo.'),
  ('Parcelas de dívidas sobre faturamento', null, 5,
   'De cada R$ 100 faturados, quanto vai para pagar empréstimos e financiamentos.'),
  ('Taxa de ocupação da agenda', 85, null, 'Parte dos horários disponíveis que foram de fato atendidos.'),
  ('Taxa de faltas', null, 10, 'Parte dos pacientes agendados que não apareceram nem avisaram.'),
  ('Custo de materiais sobre faturamento', null, 8, 'De cada R$ 100 faturados, quanto é gasto com materiais.'),
  ('Taxa de aceitação de orçamentos', 55, null, 'De cada 10 orçamentos apresentados, quantos os pacientes aprovam.'),
  ('Folha de pagamento sobre faturamento', null, 25,
   'De cada R$ 100 faturados, quanto vai para salários e encargos da equipe.')
) as f (nome, ref_min, ref_max, significado)
where i.nome = f.nome and i.ref_min is null and i.ref_max is null;

-- ---------------------------------------------------------------------------
-- Leitura da central (security definer: confere o acesso e devolve só o que o cliente vê)
-- ---------------------------------------------------------------------------

create or replace function public.pode_ver_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_equipe()
      or exists (select 1 from public.acessos_central a
                 where a.empresa_id = p_empresa and a.email = public.email_atual());
$$;

-- Clínicas que a pessoa logada pode ver na central. Registra o acesso do cliente.
create or replace function public.central_empresas()
returns table (id uuid, nome text, logo_url text)
language plpgsql security definer set search_path = public as $$
begin
  update public.acessos_central set ultimo_acesso = now()
  where email = public.email_atual() and email <> '';
  return query
    select e.id, e.nome, e.logo_url from public.empresas e
    where e.id in (select a.empresa_id from public.acessos_central a where a.email = public.email_atual())
    order by e.nome;
end;
$$;

-- Diagnósticos publicados de uma clínica, do mais recente para o mais antigo.
create or replace function public.central_diagnosticos(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'periodo_inicio', d.periodo_inicio, 'periodo_fim', d.periodo_fim,
           'publicado_em', d.publicado_em, 'status', d.status) order by d.periodo_fim desc), '[]'::jsonb)
  from public.diagnosticos d
  where d.empresa_id = p_empresa and d.publicado_em is not null and public.pode_ver_empresa(p_empresa);
$$;

-- Um diagnóstico publicado, no formato do relatório, sem as anotações internas da equipe.
create or replace function public.central_diagnostico(p_diagnostico uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select (to_jsonb(d) - 'observacoes' - 'pasta_url' - 'criado_por') || jsonb_build_object(
    'empresa', (select jsonb_build_object('id', e.id, 'nome', e.nome, 'segmento', e.segmento,
                                          'cnpj', e.cnpj, 'logo_url', e.logo_url)
                from public.empresas e where e.id = d.empresa_id),
    'responsavel', (select jsonb_build_object('nome', p.nome, 'foto_url', p.foto_url)
                    from public.perfis p where p.id = d.responsavel_id),
    'donos_area', (select coalesce(jsonb_object_agg(a.key, jsonb_build_object('nome', p.nome, 'foto_url', p.foto_url)), '{}'::jsonb)
                   from jsonb_each_text(d.responsaveis_area) a join public.perfis p on p.id::text = a.value),
    'solicitacoes', '[]'::jsonb,
    'indicadores', coalesce((select jsonb_agg(to_jsonb(i) - 'criado_por' - 'responsavel_id' order by i.ordem)
                             from public.indicadores i where i.diagnostico_id = d.id), '[]'::jsonb),
    'achados', coalesce((select jsonb_agg(to_jsonb(a) - 'criado_por' - 'responsavel_id')
                         from public.achados a where a.diagnostico_id = d.id and a.status <> 'Descartado'), '[]'::jsonb),
    'oportunidades', coalesce((select jsonb_agg(to_jsonb(o) - 'criado_por' - 'responsavel_id')
                               from public.oportunidades o where o.diagnostico_id = d.id and o.status <> 'Descartada'), '[]'::jsonb),
    'acoes', coalesce((select jsonb_agg(to_jsonb(c) - 'criado_por' - 'observacoes')
                       from public.acoes c where c.diagnostico_id = d.id and c.status <> 'Cancelada'), '[]'::jsonb)
  )
  from public.diagnosticos d
  where d.id = p_diagnostico and d.publicado_em is not null and public.pode_ver_empresa(d.empresa_id);
$$;

-- Dados públicos da assessoria (logo e nome no topo da central e no relatório).
create or replace function public.central_assessoria()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('razao_social', razao_social, 'nome_fantasia', nome_fantasia, 'cnpj', cnpj,
                            'email', email, 'site', site, 'telefone', telefone, 'logo_url', logo_url)
  from public.assessoria limit 1;
$$;

-- A tela de login só manda o link para e-mails liberados (da equipe ou de alguma clínica).
create or replace function public.pode_receber_link(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.acessos_central where email = lower(trim(p_email)))
      or exists (select 1 from public.perfis where lower(email) = lower(trim(p_email)) and papel = 'equipe');
$$;

-- Promover alguém à equipe (ou tirar). Só a equipe faz, e ninguém muda o próprio papel.
create or replace function public.definir_papel(p_perfil uuid, p_papel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe() then raise exception 'Só a equipe muda papéis.'; end if;
  if p_perfil = auth.uid() then raise exception 'Você não pode mudar o próprio papel.'; end if;
  if p_papel not in ('equipe', 'cliente') then raise exception 'Papel inválido.'; end if;
  update public.perfis set papel = p_papel where id = p_perfil;
end;
$$;

revoke execute on function public.eh_equipe(), public.pode_ver_empresa(uuid), public.central_empresas(),
  public.central_diagnosticos(uuid), public.central_diagnostico(uuid), public.central_assessoria(),
  public.definir_papel(uuid, text), public.pode_receber_link(text)
  from public, anon;
grant execute on function public.eh_equipe(), public.pode_ver_empresa(uuid), public.central_empresas(),
  public.central_diagnosticos(uuid), public.central_diagnostico(uuid), public.central_assessoria(),
  public.definir_papel(uuid, text)
  to authenticated;
grant execute on function public.pode_receber_link(text) to anon, authenticated;
