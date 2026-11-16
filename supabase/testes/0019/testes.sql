-- Testes da 0019 (fichas técnicas e vendas do PDV). Roda no Postgres local (rodar.sh) e no projeto Supabase axis-testes, com as
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

-- Fichas: Latte (leite 0,2 L + café 0,018 kg) e Cookie (cookie 1 un). Insumos novos são criados sem custo.
create or replace function pg_temp.fichas(p_empresa text default 'e1') returns text language sql as $$
  select format('public.fin_estoque_importar_fichas(%L, %L::jsonb)', pg_temp.emp(p_empresa),
    '[{"produto":"LATTE P","categoria":"Bebidas","itens":[{"insumo":"Leite integral","unidade":"L","quantidade":0.2},{"insumo":"Café","unidade":"kg","quantidade":0.018}]},
      {"produto":"COOKIE","itens":[{"insumo":"Cookie","quantidade":1}]}]');
$$;
create or replace function pg_temp.antes_fichas() returns text language sql as $$
  select 'do $d$ begin perform ' || pg_temp.fichas() || '; end $d$';
$$;
-- Vendas de outubro: 10 Latte P, 4 Cookie e 3 de um produto que ainda não tem ficha.
create or replace function pg_temp.vendas(p_mes text default '2026-10-01', p_empresa text default 'e1', p_itens text default null) returns text language sql as $$
  select format('public.fin_estoque_importar_vendas(%L, %L, %L, %L::jsonb)', pg_temp.emp(p_empresa), p_mes, 'vendas.xls',
    coalesce(p_itens, '[{"nome":"Latte P","categoria":"BEBIDAS","quantidade":10,"valor":150},{"nome":"Cookie","quantidade":4,"valor":72},{"nome":"Água","quantidade":3,"valor":18}]'));
$$;

-- Roda a ação e depois confere a consulta, num bloco só (cada comando do bloco vê o que o anterior gravou).
-- Devolve 'aceito' se a consulta der o esperado; senão, 'recusado:obtido=<valor>'.
create or replace function pg_temp.confere(p_acao text, p_consulta text, p_esperado text) returns text language sql as $corpo$
  select format($f$do $d$ declare v text; begin perform %s; v := (%s)::text;
    if v is distinct from %L then raise exception 'x' using errcode = 'check_violation', constraint = 'obtido=' || coalesce(v, 'nulo'); end if; end $d$$f$,
    p_acao, p_consulta, p_esperado);
$corpo$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
-- Fichas
('equipe importa fichas: cria 2 produtos e 3 insumos sem custo', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.fichas(), $q$(select count(*) from public.fin_estoque_produtos) || '|' || (select count(*) from public.fin_estoque_itens where custo_unitario is null) || '|' || (select count(*) from public.fin_estoque_ficha_itens)$q$, '2|3|3'), null),
('importar fichas de novo troca a ficha, sem duplicar', '2|2', 'equipe',
  'select (' || pg_temp.fichas() || $q$ ->> 'produtos_novos')::int + 2 || '|' || (select count(*) from public.fin_estoque_ficha_itens f join public.fin_estoque_produtos p on p.id = f.produto_id where p.nome = 'LATTE P')$q$,
  pg_temp.antes_fichas()),
('insumo repetido na mesma ficha soma as quantidades', 'aceito', 'equipe',
  pg_temp.confere($q$public.fin_estoque_importar_fichas('00000000-0000-0000-0000-0000000000e1', '[{"produto":"X","itens":[{"insumo":"Açúcar","quantidade":1},{"insumo":"açúcar","quantidade":2}]}]'::jsonb)$q$,
    $q$(select string_agg(quantidade::text, ',') from public.fin_estoque_ficha_itens)$q$, '3.000000'), null),
('ficha com quantidade zero é recusada', 'recusado:fin_estoque_ficha_itens_quantidade_valida', 'equipe',
  $q$select public.fin_estoque_importar_fichas('00000000-0000-0000-0000-0000000000e1', '[{"produto":"X","itens":[{"insumo":"Açúcar","quantidade":0}]}]'::jsonb)::text$q$, null),
('fichas com o estoque desligado são recusadas', 'recusado:fin_estoque_desligado', 'equipe', 'select ' || pg_temp.fichas('e2') || '::text', null),
('salvar ficha troca os insumos do produto', 'aceito', 'equipe',
  pg_temp.confere($q$public.fin_estoque_salvar_ficha((select id from public.fin_estoque_produtos where nome = 'LATTE P'),
      jsonb_build_array(jsonb_build_object('item_id', (select id from public.fin_estoque_itens where nome = 'Café'), 'quantidade', 0.5)))$q$,
    $q$(select string_agg(f.quantidade::text, ',') from public.fin_estoque_ficha_itens f join public.fin_estoque_produtos p on p.id = f.produto_id where p.nome = 'LATTE P')$q$, '0.500000'),
  pg_temp.antes_fichas()),
('ficha vazia deixa o produto sem ficha', 'aceito', 'equipe',
  pg_temp.confere($q$public.fin_estoque_salvar_ficha((select id from public.fin_estoque_produtos where nome = 'LATTE P'), '[]'::jsonb)$q$,
    $q$(select count(*) from public.fin_estoque_ficha_itens f join public.fin_estoque_produtos p on p.id = f.produto_id where p.nome = 'LATTE P')$q$, '0'),
  pg_temp.antes_fichas()),
('insumo de outra empresa não entra na ficha', 'recusado:fin_estoque_ficha_itens_item', 'equipe',
  $q$select public.fin_estoque_salvar_ficha(p.id, jsonb_build_array(jsonb_build_object('item_id', i.id, 'quantidade', 1)))::text
     from public.fin_estoque_produtos p, public.fin_estoque_itens i where p.nome = 'LATTE P' and i.empresa_id = '00000000-0000-0000-0000-0000000000e2'$q$,
  pg_temp.antes_fichas() || $q$; insert into public.fin_estoque_itens (empresa_id, nome, unidade) values ('00000000-0000-0000-0000-0000000000e2', 'Outro', 'un')$q$),
('produto com nome repetido (maiúsculas) é recusado', 'recusado:fin_estoque_produtos_nome_unico', 'equipe',
  $q$insert into public.fin_estoque_produtos (empresa_id, nome) values ('00000000-0000-0000-0000-0000000000e1', 'latte p')$q$, pg_temp.antes_fichas()),
('insumo usado em ficha não é apagado', 'recusado:fin_estoque_ficha_itens_item', null,
  $q$delete from public.fin_estoque_itens where nome = 'Café'$q$, pg_temp.antes_fichas()),

-- Vendas
('equipe importa vendas: liga às fichas pelo nome e cria o produto que falta', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.vendas(), $q$(select count(*) from public.fin_estoque_produtos) || '|' ||
     (select count(*) from public.fin_estoque_vendas_itens v where not exists (select 1 from public.fin_estoque_ficha_itens f where f.produto_id = v.produto_id))$q$, '3|1'),
  pg_temp.antes_fichas()),
('importar o mesmo mês de novo substitui as vendas', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.vendas('2026-10-01', 'e1', '[{"nome":"Latte P","quantidade":1},{"nome":"Cookie","quantidade":1}]'),
    $q$(select count(*) from public.fin_estoque_vendas) || '|' || (select count(*) from public.fin_estoque_vendas_itens)$q$, '1|2'),
  'do $d$ begin perform ' || pg_temp.vendas() || '; end $d$'),
('vendas com o estoque desligado são recusadas', 'recusado:fin_estoque_desligado', 'equipe', 'select ' || pg_temp.vendas('2026-10-01', 'e2') || '::text', null),
('vendas sem itens são recusadas', 'recusado:fin_estoque_vendas_vazia', 'equipe', 'select ' || pg_temp.vendas('2026-10-01', 'e1', '[]') || '::text', null),
('mês que não começa no dia 1 é recusado', 'recusado:fin_estoque_vendas_mes_valido', 'equipe', 'select ' || pg_temp.vendas('2026-10-15') || '::text', null),
('quantidade vendida negativa é recusada', 'recusado:fin_estoque_vendas_itens_quantidade_valida', 'equipe',
  'select ' || pg_temp.vendas('2026-10-01', 'e1', '[{"nome":"Latte P","quantidade":-1}]') || '::text', null),
('apagar o mês leva as linhas junto', '0', 'equipe',
  $q$with x as (delete from public.fin_estoque_vendas returning 1) select (select count(*) from public.fin_estoque_vendas_itens) - 3 + (select count(*) from x) - 1 || ''$q$,
  'do $d$ begin perform ' || pg_temp.vendas() || '; end $d$'),

-- Acesso
('cliente com central da A não importa vendas', 'sem_permissao', 'cliente_a', 'select ' || pg_temp.vendas() || '::text', null),
('cliente com central da A não importa fichas', 'sem_permissao', 'cliente_a', 'select ' || pg_temp.fichas() || '::text', null),
('cliente sem acesso não vê produtos, fichas nem vendas', '0|0|0', 'cliente_b',
  $q$select (select count(*) from public.fin_estoque_produtos) || '|' || (select count(*) from public.fin_estoque_ficha_itens) || '|' || (select count(*) from public.fin_estoque_vendas_itens)$q$,
  pg_temp.antes_fichas() || '; do $d$ begin perform ' || pg_temp.vendas() || '; end $d$'),
('cliente com o financeiro na central vê as vendas, só para ler', '3|0', 'cliente_a',
  $q$with x as (delete from public.fin_estoque_vendas_itens returning 1) select (select count(*) from public.fin_estoque_vendas_itens) || '|' || (select count(*) from x)$q$,
  'do $d$ begin perform ' || pg_temp.vendas() || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'; end $d$$a$),
('sem login (anon) não salva ficha', 'sem_permissao', 'anon',
  $q$select public.fin_estoque_salvar_ficha(gen_random_uuid(), '[]'::jsonb)::text$q$, null);
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
