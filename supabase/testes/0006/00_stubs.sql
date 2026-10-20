-- Stubs mínimos do Supabase para reproduzir o esquema localmente.
do $$ begin if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin; end if; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
