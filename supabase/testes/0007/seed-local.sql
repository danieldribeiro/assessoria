-- Pessoas e empresas fictícias do Postgres local, com os mesmos ids do projeto axis-testes
-- (supabase/testes/0006/seed-supabase.sql). Só inserções.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'equipe@teste.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'cliente.b@teste.local');
update public.perfis set papel = case when id = '00000000-0000-0000-0000-0000000000a1' then 'equipe' else 'cliente' end;
insert into public.empresas (id, nome) values
  ('00000000-0000-0000-0000-0000000000e1', 'Clínica Teste A'), ('00000000-0000-0000-0000-0000000000e2', 'Clínica Teste B')
on conflict (id) do nothing;
insert into public.acessos_central (empresa_id, email, nome) values
  ('00000000-0000-0000-0000-0000000000e1', 'cliente.a@teste.local', 'Cliente A (fictício)');
