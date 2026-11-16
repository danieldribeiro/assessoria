-- Testes da 0018 (estoque e CMV). Roda no Postgres local (rodar.sh) e no projeto Supabase axis-testes, com as
-- pessoas e empresas fictícias. Tudo roda dentro de uma subtransação desfeita no fim. Devolve um JSON com passaram,
-- total e cada caso. Empresa A (e1) tem o estoque ligado só durante os testes; a B (e2) fica desligada.

create temp table if not exists _casos (n serial, caso text, esperado text, pessoa text, sql text, antes text);

-- Pessoas: equipe (a1), cliente com central da Clínica Teste A (c1), cliente sem acesso (c2) e sem login (anon).
create or replace function pg_temp.executar(p_pessoa text, p_sql text, p_antes text) returns text language plpgsql as $$
declare v text; v_id uuid;
begin
  begin
    if p_antes is not null then execute p_antes; end if;
    if p_pessoa is not null then
      v_id := case p_pessoa when 'equipe' then '00000000-0000-0000-0000-0000000000a1'
                            when 'cliente_a' then '00000000-0000-0000-0000-0000000000c1'
                            when 'cliente_b' then '00000000-0000-0000-0000-0000000000c2' end;
      perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', case when v_id is null then 'anon' else 'authenticated' end,
        'email', case p_pessoa when 'equipe' then 'equipe@teste.local' when 'cliente_a' then 'cliente.a@teste.local'
                               when 'cliente_b' then 'cliente.b@teste.local' else '' end)::text, true);
      perform set_config('request.jwt.claim.sub', coalesce(v_id::text, ''), true);
      perform set_config('role', case when v_id is null then 'anon' else 'authenticated' end, true);
    end if;
    if p_sql ~* '^\s*(select|with)\M' then
      execute p_sql into v;
      v := coalesce(v, 'nulo');
    else
      execute p_sql;
      v := 'aceito';
    end if;
    set constraints all immediate; -- confere a soma exata do rateio agora, sem esperar o fim da transação
    raise exception using errcode = 'P0001', message = '__desfazer__';
  exception
    when check_violation or unique_violation or foreign_key_violation then
      get stacked diagnostics v = constraint_name;
      v := 'recusado:' || v;
    when not_null_violation then
      get stacked diagnostics v = column_name;
      v := 'recusado:nulo:' || v;
    when insufficient_privilege then
      v := 'sem_permissao';
    when raise_exception then
      if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  return v;
end;
$$;

create or replace function pg_temp.id(p text) returns text language sql as $$ select '00000000-0000-0000-0000-00000000' || p $$;
create or replace function pg_temp.emp(p text) returns text language sql as $$ select '00000000-0000-0000-0000-0000000000' || p $$;

-- Importa uma contagem com dois itens (Leite integral e Detergente) na data dada.
create or replace function pg_temp.importar(p_data text, p_empresa text default 'e1', p_itens text default null) returns text language sql as $$
  select format('select (public.fin_estoque_importar_contagem(%L, %L, %L, %L::jsonb) is not null)::text',
    pg_temp.emp(p_empresa), p_data, 'contagem.xlsx',
    coalesce(p_itens, '[{"nome":"Leite integral","categoria":"Leite","unidade":"un","quantidade":10},{"nome":"Detergente","categoria":"Limpeza","unidade":"un","quantidade":2}]'));
$$;
-- Mesma importação, como comando que roda antes do caso (como dono, sem RLS).
create or replace function pg_temp.antes_importar(p_data text) returns text language sql as $$
  select format('perform public.fin_estoque_importar_contagem(%L, %L, %L, %L::jsonb)', pg_temp.emp('e1'), p_data, 'contagem.xlsx',
    '[{"nome":"Leite integral","categoria":"Leite","unidade":"un","quantidade":10},{"nome":"Detergente","categoria":"Limpeza","unidade":"un","quantidade":2}]');
$$;
create or replace function pg_temp.contagem(p_data text) returns text language sql as $$
  select format('(select id from public.fin_estoque_contagens where empresa_id = %L and data = %L)', pg_temp.emp('e1'), p_data);
$$;
-- Custo no leite e detergente fora do CMV: depois disso a contagem pode fechar.
create or replace function pg_temp.custos() returns text language sql as $$
  select format($f$update public.fin_estoque_itens set custo_unitario = 3.69 where empresa_id = %L and nome = 'Leite integral';
                   update public.fin_estoque_itens set fora_do_cmv = true where empresa_id = %L and nome = 'Detergente'$f$, pg_temp.emp('e1'), pg_temp.emp('e1'));
$$;
create or replace function pg_temp.fechada(p_data text) returns text language sql as $$
  select pg_temp.antes_importar(p_data) || '; ' || pg_temp.custos() || '; perform public.fin_estoque_fechar_contagem(' || pg_temp.contagem(p_data) || ')';
$$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
-- Chave por empresa
('empresa nasce com o estoque desligado', 'false', 'equipe', $q$select estoque_ativo::text from public.empresas where id = '00000000-0000-0000-0000-0000000000e3'$q$,
  $q$insert into public.empresas (id, nome) values ('00000000-0000-0000-0000-0000000000e3', 'Empresa nova')$q$),
('importar com o estoque desligado é recusado', 'recusado:fin_estoque_desligado', 'equipe', pg_temp.importar('2026-10-31', 'e2'), null),
('equipe não cadastra insumo em empresa com estoque desligado', 'sem_permissao', 'equipe',
  $q$insert into public.fin_estoque_itens (empresa_id, nome, unidade) values ('00000000-0000-0000-0000-0000000000e2', 'Café', 'kg')$q$, null),

-- Importação
('equipe importa a contagem', 'true', 'equipe', pg_temp.importar('2026-10-31'), null),
('a importação cria um insumo por nome e guarda as linhas', '2|2', 'equipe',
  $q$select (select count(*) from public.fin_estoque_itens) || '|' || (select count(*) from public.fin_estoque_contagem_itens)$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),
('a segunda importação reaproveita os insumos (sem diferença de maiúsculas)', '2|4', 'equipe',
  $q$select (select count(*) from public.fin_estoque_itens) || '|' || (select count(*) from public.fin_estoque_contagem_itens)$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; perform public.fin_estoque_importar_contagem(''00000000-0000-0000-0000-0000000000e1'', ''2026-11-30'', null, ''[{"nome":"LEITE INTEGRAL","quantidade":5},{"nome":"detergente","quantidade":1}]''::jsonb); end $d$'),
('duas contagens na mesma data são recusadas', 'recusado:fin_estoque_contagens_data_unica', 'equipe', pg_temp.importar('2026-10-31'),
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),
('quantidade negativa é recusada', 'recusado:fin_estoque_contagem_itens_quantidade_valida', 'equipe',
  pg_temp.importar('2026-10-31', 'e1', '[{"nome":"Leite integral","quantidade":-1}]'), null),
('contagem sem itens é recusada', 'recusado:fin_estoque_contagem_vazia', 'equipe', pg_temp.importar('2026-10-31', 'e1', '[]'), null),
('insumo com nome repetido (maiúsculas) é recusado', 'recusado:fin_estoque_itens_nome_unico', 'equipe',
  $q$insert into public.fin_estoque_itens (empresa_id, nome, unidade) values ('00000000-0000-0000-0000-0000000000e1', 'LEITE INTEGRAL', 'un')$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),

-- Fechamento
('fechar com item contado sem custo é recusado', 'recusado:fin_estoque_contagem_sem_custo', 'equipe',
  'select public.fin_estoque_fechar_contagem(' || pg_temp.contagem('2026-10-31') || ')::text',
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),
('fechar direto pela tabela também exige custo', 'recusado:fin_estoque_contagem_sem_custo', 'equipe',
  $q$update public.fin_estoque_contagens set situacao = 'fechada', fechada_em = now() where data = '2026-10-31'$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),
('com custo e item fora do CMV, a contagem fecha', 'aceito', 'equipe',
  'do $d$ begin perform public.fin_estoque_fechar_contagem(' || pg_temp.contagem('2026-10-31') || $a$); if (select situacao from public.fin_estoque_contagens) <> 'fechada' then raise exception 'não fechou'; end if; end $d$$a$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; ' || pg_temp.custos() || '; end $d$'),
('o fechamento grava custo e fora do CMV em cada linha', '3.6900|false;|true', 'equipe',
  $q$select string_agg(coalesce(custo_unitario::text, '') || '|' || fora_do_cmv, ';' order by ordem) from public.fin_estoque_contagem_itens$q$,
  'do $d$ begin ' || pg_temp.fechada('2026-10-31') || '; end $d$'),
('mudar o custo do insumo depois não mexe na contagem fechada', '3.6900', 'equipe',
  $q$select custo_unitario::text from public.fin_estoque_contagem_itens where nome_origem = 'Leite integral'$q$,
  'do $d$ begin ' || pg_temp.fechada('2026-10-31') || $a$; update public.fin_estoque_itens set custo_unitario = 9 where nome = 'Leite integral'; end $d$$a$),
('linha de contagem fechada não muda', 'recusado:fin_estoque_contagem_fechada', 'equipe',
  $q$update public.fin_estoque_contagem_itens set quantidade = 99 where nome_origem = 'Leite integral'$q$,
  'do $d$ begin ' || pg_temp.fechada('2026-10-31') || '; end $d$'),
('contagem fechada não muda de data', 'recusado:fin_estoque_contagem_fechada', 'equipe',
  $q$update public.fin_estoque_contagens set data = '2026-10-30'$q$, 'do $d$ begin ' || pg_temp.fechada('2026-10-31') || '; end $d$'),
('contagem fechada não é apagada', 'recusado:fin_estoque_contagem_fechada', 'equipe',
  $q$delete from public.fin_estoque_contagens$q$, 'do $d$ begin ' || pg_temp.fechada('2026-10-31') || '; end $d$'),
('fechar de novo é recusado', 'recusado:fin_estoque_contagem_fechada', 'equipe',
  'select public.fin_estoque_fechar_contagem(' || pg_temp.contagem('2026-10-31') || ')::text', 'do $d$ begin ' || pg_temp.fechada('2026-10-31') || '; end $d$'),
('reabrir volta para rascunho', 'aceito', 'equipe',
  $q$update public.fin_estoque_contagens set situacao = 'rascunho', fechada_em = null, fechada_por = null$q$,
  'do $d$ begin ' || pg_temp.fechada('2026-10-31') || '; end $d$'),
('rascunho pode ser apagado, com as linhas', '0|0', 'equipe',
  $q$with x as (delete from public.fin_estoque_contagens returning id) select (select count(*) from x) - 1 || '|' || ((select count(*) from public.fin_estoque_contagem_itens) - 2)$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),

-- Acesso
('cliente com central da A não importa contagem', 'sem_permissao', 'cliente_a', pg_temp.importar('2026-10-31'), null),
('cliente sem acesso não vê contagens nem insumos', '0|0', 'cliente_b',
  $q$select (select count(*) from public.fin_estoque_contagens) || '|' || (select count(*) from public.fin_estoque_itens)$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),
('cliente com central da A, sem o financeiro na central, não vê contagens', '0', 'cliente_a',
  $q$select count(*)::text from public.fin_estoque_contagens$q$, 'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; end $d$'),
('cliente com o financeiro na central vê a contagem, só para ler', '1', 'cliente_a',
  $q$select count(*)::text from public.fin_estoque_contagens$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'; end $d$$a$),
('cliente com o financeiro na central não muda custo', '0', 'cliente_a',
  $q$with x as (update public.fin_estoque_itens set custo_unitario = 1 returning 1) select count(*)::text from x$q$,
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'; end $d$$a$),
('sem login (anon) não importa', 'sem_permissao', 'anon', pg_temp.importar('2026-10-31'), null),
('sem login (anon) não fecha', 'sem_permissao', 'anon', 'select public.fin_estoque_fechar_contagem(' || pg_temp.contagem('2026-10-31') || ')::text',
  'do $d$ begin ' || pg_temp.antes_importar('2026-10-31') || '; ' || pg_temp.custos() || '; end $d$');

create or replace function pg_temp.rodar() returns jsonb language plpgsql as $$
declare v_res jsonb := '[]'; c record; v text;
begin
  begin
    update public.empresas set estoque_ativo = true where id = '00000000-0000-0000-0000-0000000000e1';
    for c in select * from _casos order by n loop
      v := pg_temp.executar(c.pessoa, c.sql, c.antes);
      v_res := v_res || jsonb_build_object('n', c.n, 'caso', c.caso, 'esperado', c.esperado, 'obtido', v, 'ok', v = c.esperado);
    end loop;
    raise exception using errcode = 'P0001', message = '__desfazer__'; -- desfaz a chave ligada
  exception when raise_exception then
    if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  return v_res;
end;
$$;

select jsonb_build_object('passaram', count(*) filter (where (e ->> 'ok')::boolean), 'total', count(*),
  'falhas', coalesce(jsonb_agg(e) filter (where not (e ->> 'ok')::boolean), '[]'), 'casos', jsonb_agg(e))
from jsonb_array_elements(pg_temp.rodar()) e;
