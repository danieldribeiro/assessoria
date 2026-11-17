-- Testes da 0027 (perdas de estoque). Mesmo esquema dos testes da 0023/0026. Empresa A (e1) tem o estoque ligado só durante os testes.

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

-- Base (como superusuário): insumo Leite (L, R$ 5) na A e Café (kg) na B.
create or replace function pg_temp.base() returns text language sql as $f$ select $a$
  insert into public.fin_estoque_itens (id, empresa_id, nome, unidade, custo_unitario) values
    ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000e1', 'Leite', 'L', 5),
    ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000e2', 'Café', 'kg', 100)
$a$ $f$;
create or replace function pg_temp.perda(p_item text default 'd001', p_qtd text default '2', p_motivo text default 'vencido', p_empresa text default 'e1') returns text language sql as $f$
  select format($q$insert into public.fin_estoque_perdas (empresa_id, data, item_id, quantidade, motivo) values (%L, '2026-11-17', %L, %s, %L)$q$,
    pg_temp.emp(p_empresa), '00000000-0000-0000-0000-00000000' || p_item, p_qtd, p_motivo);
$f$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
('equipe anota perda; o custo do insumo fica gravado', '5.0000', 'equipe',
  $q$with x as ($q$ || pg_temp.perda() || $q$ returning custo_unitario) select custo_unitario::text from x$q$, pg_temp.base()),
('mudar o custo do insumo depois não muda a perda', '5.0000', 'equipe', 'select custo_unitario::text from public.fin_estoque_perdas',
  pg_temp.base() || '; ' || pg_temp.perda() || '; update public.fin_estoque_itens set custo_unitario = 9'),
('quantidade zero é recusada', 'recusado:fin_estoque_perdas_quantidade_valida', 'equipe', pg_temp.perda('d001', '0'), pg_temp.base()),
('motivo fora da lista é recusado', 'recusado:fin_estoque_perdas_motivo_valido', 'equipe', pg_temp.perda('d001', '1', 'roubo'), pg_temp.base()),
('insumo de outra empresa é recusado', 'recusado:fin_estoque_perdas_item', 'equipe', pg_temp.perda('d002'), pg_temp.base()),
('empresa com estoque desligado não anota perda', 'sem_permissao', 'equipe', pg_temp.perda('d002', '1', 'vencido', 'e2'), pg_temp.base()),
('equipe apaga a perda', 'aceito', 'equipe', 'delete from public.fin_estoque_perdas', pg_temp.base() || '; ' || pg_temp.perda()),
('cliente com central da A não anota perda', 'sem_permissao', 'cliente_a', pg_temp.perda(),
  pg_temp.base() || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'$a$),
('cliente com central da A só lê as perdas', '1', 'cliente_a', 'select count(*)::text from public.fin_estoque_perdas',
  pg_temp.base() || '; ' || pg_temp.perda() || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'$a$),
('sem login (anon) não vê perdas', '0', 'anon', 'select count(*)::text from public.fin_estoque_perdas', pg_temp.base() || '; ' || pg_temp.perda());
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
