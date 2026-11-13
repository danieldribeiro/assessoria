-- Testes da 0017. Só leitura: confere quem pode chamar pode_receber_link e que a função continua
-- respondendo certo para o servidor. Devolve uma linha por caso com ok = true/false.
select caso, ok from (values
  ('sem login (anon) não chama',        not has_function_privilege('anon', 'public.pode_receber_link(text)', 'execute')),
  ('logado (authenticated) não chama',  not has_function_privilege('authenticated', 'public.pode_receber_link(text)', 'execute')),
  ('servidor (service_role) chama',     has_function_privilege('service_role', 'public.pode_receber_link(text)', 'execute')),
  ('PUBLIC não tem permissão',          not exists (select 1 from information_schema.routine_privileges
                                                    where routine_schema = 'public' and routine_name = 'pode_receber_link'
                                                      and grantee = 'PUBLIC')),
  ('e-mail desconhecido = não',         not public.pode_receber_link('ninguem@nao-existe.invalid')),
  ('e-mail da equipe de teste = sim',   public.pode_receber_link('equipe@teste.local')),
  ('e-mail com acesso à central = sim', public.pode_receber_link('cliente.a@teste.local')),
  ('cliente sem acesso à central = não', not public.pode_receber_link('cliente.b@teste.local')),
  ('ignora maiúsculas e espaços',       public.pode_receber_link('  EQUIPE@teste.local '))
) as t(caso, ok);
