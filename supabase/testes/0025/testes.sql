-- Testes da 0025 (complementos do CMV do mês). Mesmo esquema dos testes da 0023, de onde vêm as funções auxiliares.
-- de uma subtransação desfeita no fim. Devolve um JSON com passaram, total e cada caso. Empresa A (e1) tem o estoque ligado
-- só durante os testes.

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

-- Fichas e vendas importadas, com custo no leite (R$ 5/L) e no café (R$ 100/kg); o cookie fica sem custo.
-- Latte P = 0,2 × 5 + 0,018 × 100 = 2,80. Cookie = 0 com 1 insumo sem custo. Água sem ficha.
create or replace function pg_temp.base() returns text language sql as $f$
  select 'do $d$ begin perform ' || pg_temp.fichas() || '; perform ' || pg_temp.vendas() || $a$;
    update public.fin_estoque_itens set custo_unitario = 5 where nome = 'Leite integral';
    update public.fin_estoque_itens set custo_unitario = 100 where nome = 'Café'; end $d$$a$;
$f$;
create or replace function pg_temp.venda() returns text language sql as $f$
  select $q$(select id from public.fin_estoque_vendas where empresa_id = '00000000-0000-0000-0000-0000000000e1' and mes = '2026-10-01')$q$;
$f$;
create or replace function pg_temp.custos() returns text language sql as $f$
  select $q$(select string_agg(nome_origem || '=' || coalesce(round(custo_unitario, 2)::text, '-') || '/' || insumos_sem_custo, ' ' order by ordem)
    from public.fin_estoque_vendas_itens)$q$;
$f$;

-- Mês já fechado (gravado direto, como superusuário), para os casos que partem dele.
create or replace function pg_temp.base_fechada() returns text language sql as $f$
  select pg_temp.base() || $a$; update public.fin_estoque_vendas set fechado_em = now(); update public.fin_estoque_vendas_itens set custo_unitario = 1$a$;
$f$;
-- Complementos: grava e devolve a lista das linhas marcadas como complemento.
create or replace function pg_temp.comp(p_itens text) returns text language sql as $f$
  select format('public.fin_estoque_salvar_complementos(%s, %L::jsonb)', pg_temp.venda(), p_itens);
$f$;
create or replace function pg_temp.lista_comp() returns text language sql as $f$
  select $q$(select coalesce(string_agg(i.nome_origem || '=' || i.quantidade::numeric(14,1) || '/' || coalesce(i.valor::text, '-') || '/' || p.categoria, ' ' order by i.ordem), 'nenhum')
    from public.fin_estoque_vendas_itens i join public.fin_estoque_produtos p on p.id = i.produto_id where i.complemento)$q$;
$f$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
('equipe grava complementos; nome novo vira produto em Complementos', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.comp('[{"nome":"Leite de aveia (adicional)","quantidade":100,"valor":400}]'), pg_temp.lista_comp(), 'Leite de aveia (adicional)=100.0/400.00/Complementos'),
  pg_temp.base()),
('gravar de novo troca os complementos, sem duplicar', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.comp('[{"nome":"Chantilly (adicional)","quantidade":13,"valor":52}]') || '; perform ' || pg_temp.comp('[{"nome":"Chantilly (adicional)","quantidade":12,"valor":48}]'),
    pg_temp.lista_comp(), 'Chantilly (adicional)=12.0/48.00/Complementos'), pg_temp.base()),
('lista vazia apaga os complementos', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.comp('[{"nome":"Chantilly (adicional)","quantidade":13,"valor":52}]') || '; perform ' || pg_temp.comp('[]'), pg_temp.lista_comp(), 'nenhum'), pg_temp.base()),
('importar o PDV de novo mantém os complementos', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.comp('[{"nome":"Leite de aveia (adicional)","quantidade":100,"valor":400}]') || '; perform ' || pg_temp.vendas(),
    pg_temp.lista_comp() || $a$ || '|' || (select count(*) from public.fin_estoque_vendas_itens)$a$, 'Leite de aveia (adicional)=100.0/400.00/Complementos|4'),
  pg_temp.base()),
('fechar o mês grava o custo da ficha do complemento', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.comp('[{"nome":"latte p","quantidade":5,"valor":20}]') || '; perform public.fin_estoque_fechar_vendas(' || pg_temp.venda() || ')',
    pg_temp.custos(), 'Latte P=2.80/0 Cookie=0.00/1 Água=-/0 latte p=2.80/0'), pg_temp.base()),
('reabrir o mês com complementos', 'aceito', 'equipe',
  'do $d$ begin perform ' || pg_temp.comp('[{"nome":"latte p","quantidade":5}]') || '; perform public.fin_estoque_fechar_vendas(' || pg_temp.venda() || '); perform public.fin_estoque_reabrir_vendas(' || pg_temp.venda() || '); end $d$',
  pg_temp.base()),
('apagar o mês aberto leva os complementos junto', 'aceito', 'equipe',
  pg_temp.confere(pg_temp.comp('[{"nome":"latte p","quantidade":5}]') || $a$; delete from public.fin_estoque_vendas; perform (1)$a$, $q$(select count(*) from public.fin_estoque_vendas_itens)$q$, '0'),
  pg_temp.base()),
('mês fechado não aceita complementos', 'recusado:fin_estoque_vendas_fechada', 'equipe', 'select ' || pg_temp.comp('[{"nome":"latte p","quantidade":5}]') || '::text', pg_temp.base_fechada()),
('mês fechado não aceita linha nova', 'recusado:fin_estoque_vendas_fechada', 'equipe',
  $q$insert into public.fin_estoque_vendas_itens (empresa_id, venda_id, nome_origem, quantidade) select empresa_id, id, 'Extra', 1 from public.fin_estoque_vendas$q$, pg_temp.base_fechada()),
('mês fechado não perde linha', 'recusado:fin_estoque_vendas_fechada', 'equipe', 'delete from public.fin_estoque_vendas_itens', pg_temp.base_fechada()),
('complemento sem nome é recusado', 'recusado:fin_estoque_vendas_itens_nome_nao_branco', 'equipe', 'select ' || pg_temp.comp('[{"nome":" ","quantidade":5}]') || '::text', pg_temp.base()),
('complemento com quantidade negativa é recusado', 'recusado:fin_estoque_vendas_itens_quantidade_valida', 'equipe', 'select ' || pg_temp.comp('[{"nome":"latte p","quantidade":-1}]') || '::text', pg_temp.base()),
('cliente com central da A não grava complementos', 'sem_permissao', 'cliente_a', 'select ' || pg_temp.comp('[{"nome":"latte p","quantidade":5}]') || '::text',
  pg_temp.base() || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'$a$),
('sem login (anon) não grava complementos', 'sem_permissao', 'anon', $q$select public.fin_estoque_salvar_complementos(gen_random_uuid(), '[]')::text$q$, null);

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
