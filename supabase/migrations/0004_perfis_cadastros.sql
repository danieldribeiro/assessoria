-- Perfis, dados da assessoria e cadastro completo das empresas (base para emissão de notas).

-- Perfil de cada pessoa da equipe.
alter table public.perfis
  add column if not exists cargo text,
  add column if not exists telefone text,
  add column if not exists foto_url text;

-- Dados cadastrais da assessoria: uma linha só.
create table if not exists public.assessoria (
  id boolean primary key default true check (id),
  razao_social text,
  nome_fantasia text,
  cnpj text,
  inscricao_municipal text,
  inscricao_estadual text,
  regime_tributario text,
  email text,
  telefone text,
  site text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  codigo_municipio text,
  logo_url text,
  atualizado_em timestamptz not null default now()
);
insert into public.assessoria (id) values (true) on conflict do nothing;

alter table public.assessoria enable row level security;
drop policy if exists equipe on public.assessoria;
create policy equipe on public.assessoria for all to authenticated using (true) with check (true);

drop trigger if exists tocar_atualizado_em on public.assessoria;
create trigger tocar_atualizado_em before update on public.assessoria
  for each row execute function public.tocar_atualizado_em();

-- Empresas clientes: razão social, inscrições, endereço e e-mail para a nota.
alter table public.empresas
  add column if not exists razao_social text,
  add column if not exists inscricao_municipal text,
  add column if not exists inscricao_estadual text,
  add column if not exists email text,
  add column if not exists telefone text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists codigo_municipio text,
  add column if not exists logo_url text;

-- Fotos e logos: bucket público para leitura; só a equipe envia.
-- Sem política de leitura em storage.objects, ninguém lista o bucket; as imagens abrem pelo link público.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('imagens', 'imagens', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
  on conflict (id) do nothing;

  execute 'drop policy if exists "equipe envia imagens" on storage.objects';
  execute $p$create policy "equipe envia imagens" on storage.objects
    for insert to authenticated with check (bucket_id = 'imagens')$p$;
end $$;
