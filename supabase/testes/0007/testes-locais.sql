-- Casos que só rodam no Postgres local (rodar.sh, junto com testes.sql): tentativas de exclusão pela API.
-- A ferramenta que aplica SQL no Supabase nesta sessão para à espera de confirmação manual em qualquer
-- comando de exclusão, por isso estes casos ficam fora de testes.sql. No SQL Editor do axis-testes,
-- rode este arquivo e depois testes.sql na mesma janela.
create temp table if not exists _casos (n serial, caso text, esperado text, pessoa text, sql text, antes text);
insert into _casos (caso, esperado, pessoa, sql, antes) values
('equipe não exclui lançamento realizado (cancela)', '0', 'equipe',
  $q$with x as (delete from public.fin_lancamentos where id = '00000000-0000-0000-0000-00000000a101' returning 1) select count(*)::text from x$q$, null),
('equipe não exclui conta usada (desativa)', '0', 'equipe',
  $q$with x as (delete from public.fin_contas where id = '00000000-0000-0000-0000-00000000f102' returning 1) select count(*)::text from x$q$, null),
('equipe não exclui rateio', '0', 'equipe',
  $q$with x as (delete from public.fin_lancamento_rateios returning 1) select count(*)::text from x$q$, null),
('equipe não exclui transferência', '0', 'equipe',
  $q$with x as (delete from public.fin_transferencias returning 1) select count(*)::text from x$q$, null),
('equipe não exclui conta de caixa', '0', 'equipe',
  $q$with x as (delete from public.fin_contas_caixa returning 1) select count(*)::text from x$q$, null),
('cliente com central da A não exclui nada', '0', 'cliente_a',
  $q$with x as (delete from public.fin_lancamentos returning 1) select count(*)::text from x$q$, null),
('empresa com dados financeiros não é excluída por engano', 'recusado:fin_contas_empresa_id_fkey', null,
  $q$delete from public.empresas where id = '00000000-0000-0000-0000-0000000000e1'$q$, null);
