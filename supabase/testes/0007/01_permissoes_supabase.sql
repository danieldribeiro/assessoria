-- Só no Postgres local: reproduz as permissões padrão que o Supabase dá aos papéis anon e authenticated
-- (as regras de acesso das tabelas é que restringem o que cada um vê e grava).
grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
