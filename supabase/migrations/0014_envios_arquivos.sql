-- Envio de arquivos pelo cliente na central da clínica (kit de entrada de dados).
-- Cada clínica tem uma lista do que manda: itens "uma vez" (no início do contrato) e "mensal" (até o dia 5,
-- referentes ao mês anterior). O cliente anexa o arquivo de cada item; a equipe vê o que chegou, baixa e pode
-- dispensar um item num mês (ex.: conta sem movimento).
-- Arquivos ficam no armazenamento privado "envios", numa pasta por clínica: <empresa_id>/<arquivo>.
-- O cliente só vê e envia arquivos da clínica a que tem acesso, e não apaga nem troca o que já enviou.
-- Não muda nenhuma tabela nem dado existente; a lista de cada clínica nasce vazia e a equipe a ativa.

create table public.envios_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  dica text,                       -- formato e como tirar o arquivo, para o cliente
  frequencia text not null check (frequencia in ('unica', 'mensal')),
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null,
  unique (empresa_id, id)
);
create index envios_itens_empresa_idx on public.envios_itens (empresa_id, ordem);

create table public.envios_arquivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  item_id uuid,
  competencia date check (competencia = date_trunc('month', competencia)::date), -- mês a que o arquivo se refere; vazio nos itens "uma vez"
  caminho text not null unique,    -- no armazenamento "envios": <empresa_id>/<nome>
  nome_arquivo text not null,
  tamanho bigint,
  enviado_por uuid default auth.uid() references public.perfis (id) on delete set null,
  enviado_em timestamptz not null default now(),
  constraint envios_arquivos_item foreign key (empresa_id, item_id) references public.envios_itens (empresa_id, id),
  constraint envios_arquivos_caminho check (split_part(caminho, '/', 1) = empresa_id::text)
);
create index envios_arquivos_empresa_idx on public.envios_arquivos (empresa_id, competencia);

create table public.envios_dispensas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  item_id uuid not null,
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  motivo text,
  por uuid default auth.uid() references public.perfis (id) on delete set null,
  em timestamptz not null default now(),
  unique (item_id, competencia),
  constraint envios_dispensas_item foreign key (empresa_id, item_id) references public.envios_itens (empresa_id, id) on delete cascade
);

alter table public.envios_itens enable row level security;
alter table public.envios_arquivos enable row level security;
alter table public.envios_dispensas enable row level security;

-- Itens e dispensas: a clínica lê; só a equipe mexe.
create policy ler on public.envios_itens for select to authenticated using (public.pode_ver_empresa(empresa_id));
create policy equipe on public.envios_itens for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy ler on public.envios_dispensas for select to authenticated using (public.pode_ver_empresa(empresa_id));
create policy equipe on public.envios_dispensas for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Arquivos: a clínica lê e registra os próprios envios; apagar ou corrigir, só a equipe.
create policy ler on public.envios_arquivos for select to authenticated using (public.pode_ver_empresa(empresa_id));
create policy enviar on public.envios_arquivos for insert to authenticated
  with check (public.pode_ver_empresa(empresa_id) and enviado_por = auth.uid());
create policy equipe_altera on public.envios_arquivos for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy equipe_apaga on public.envios_arquivos for delete to authenticated using (public.eh_equipe());

-- O item precisa estar ativo para receber arquivo novo, e o mensal precisa do mês.
create function public.envios_arquivos_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_freq text; v_ativo boolean;
begin
  if new.item_id is not null then
    select frequencia, ativo into v_freq, v_ativo from envios_itens where id = new.item_id and empresa_id = new.empresa_id;
    if tg_op = 'INSERT' and not v_ativo then
      raise exception 'Este item não está mais na lista.' using errcode = 'check_violation', constraint = 'envios_item_ativo';
    end if;
    if v_freq = 'mensal' and new.competencia is null then
      raise exception 'Informe o mês a que o arquivo se refere.' using errcode = 'check_violation', constraint = 'envios_competencia';
    end if;
  end if;
  return new;
end;
$$;
create trigger envios_arquivos_validar before insert or update on public.envios_arquivos
  for each row execute function public.envios_arquivos_validar();

-- Mesma regra do histórico (0013) para as três tabelas novas.
do $$
declare t text;
begin
  foreach t in array array['envios_itens', 'envios_arquivos', 'envios_dispensas'] loop
    execute format('create trigger registrar_historico after insert or update or delete on public.%I
                    for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- A clínica dona de um caminho do armazenamento "envios" (primeira pasta), ou vazio se não for um id.
create function public.envios_empresa_do_caminho(p_caminho text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(p_caminho, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_caminho, '/', 1)::uuid end;
$$;
revoke execute on function public.envios_arquivos_validar() from public, anon, authenticated;

-- Armazenamento privado, até 20 MB por arquivo. Só onde existe o storage do Supabase.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('envios', 'envios', false, 20971520)
  on conflict (id) do nothing;
  execute $p$create policy "envios: clinica le" on storage.objects for select to authenticated
    using (bucket_id = 'envios' and public.pode_ver_empresa(public.envios_empresa_do_caminho(name)))$p$;
  execute $p$create policy "envios: clinica envia" on storage.objects for insert to authenticated
    with check (bucket_id = 'envios' and public.pode_ver_empresa(public.envios_empresa_do_caminho(name))
                and lower(name) ~ '\.(ofx|pdf|csv|xls|xlsx|jpg|jpeg|png)$')$p$;
  execute $p$create policy "envios: equipe apaga" on storage.objects for delete to authenticated
    using (bucket_id = 'envios' and public.eh_equipe())$p$;
end $$;
