-- Testes das restrições da 0006. Cada caso roda e é desfeito; o resultado vai para a tabela _resultado.
create temp table _resultado (n serial, caso text, esperado text, obtido text, ok boolean);

create or replace function pg_temp.caso(p_caso text, p_esperado text, p_sql text) returns void language plpgsql as $$
declare v_obtido text;
begin
  begin
    execute p_sql;
    v_obtido := 'aceito';
    raise exception using errcode = 'P0001', message = '__desfazer__';
  exception
    when check_violation then
      get stacked diagnostics v_obtido = constraint_name;
      v_obtido := 'recusado:' || v_obtido;
    when raise_exception then
      if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  insert into _resultado (caso, esperado, obtido, ok) values (p_caso, p_esperado, v_obtido, v_obtido = p_esperado);
end;
$$;

-- Atalho: insere um indicador no diagnóstico d2 com os campos dados.
create or replace function pg_temp.ins(p_valor text, p_situacao text, p_motivo text, p_ressalva text) returns text language sql as $$
  select format('insert into public.indicadores (diagnostico_id, categoria, nome, valor, situacao, motivo_nao_calculavel, ressalva)
                 values (%L, %L, %L, %s, %s, %s, %s)',
                '00000000-0000-0000-0000-0000000000d2', 'Financeiro', 'Teste', coalesce(p_valor, 'null'),
                coalesce(quote_literal(p_situacao), 'null'), coalesce(quote_literal(p_motivo), 'null'),
                coalesce(quote_literal(p_ressalva), 'null'));
$$;

-- Registros antigos / sem situação (R6)
select pg_temp.caso('sem situação, com valor (registro antigo)', 'aceito', pg_temp.ins('47.5', null, null, null));
select pg_temp.caso('sem situação, sem valor (a preencher)', 'aceito', pg_temp.ins(null, null, null, null));
select pg_temp.caso('sem situação, valor zero', 'aceito', pg_temp.ins('0', null, null, null));
-- Situação válida
select pg_temp.caso('situação fora da lista', 'recusado:indicadores_situacao_valida', pg_temp.ins('1', 'otimo', null, null));
select pg_temp.caso('situação com maiúscula (rótulo da planilha)', 'recusado:indicadores_situacao_valida', pg_temp.ins('1', 'Calculado', null, null));
-- Calculado
select pg_temp.caso('calculado com valor', 'aceito', pg_temp.ins('47.5', 'calculado', null, null));
select pg_temp.caso('calculado com valor zero', 'aceito', pg_temp.ins('0', 'calculado', null, null));
select pg_temp.caso('calculado com valor negativo', 'aceito', pg_temp.ins('-1500', 'calculado', null, null));
select pg_temp.caso('calculado sem valor (R3)', 'recusado:indicadores_situacao_com_valor', pg_temp.ins(null, 'calculado', null, null));
select pg_temp.caso('calculado com ressalva (R5/M3)', 'recusado:indicadores_calculado_sem_ressalva', pg_temp.ins('47.5', 'calculado', null, 'DAS ausente'));
select pg_temp.caso('calculado com motivo (R2)', 'recusado:indicadores_motivo_so_nc', pg_temp.ins('47.5', 'calculado', 'sem receita', null));
-- Calculado com ressalvas
select pg_temp.caso('com ressalvas, valor e ressalva', 'aceito', pg_temp.ins('59.5', 'calculado_com_ressalvas', null, 'DAS recorrente ausente em mês com faturamento'));
select pg_temp.caso('com ressalvas, sem ressalva (R4)', 'recusado:indicadores_ressalva_obrigatoria', pg_temp.ins('59.5', 'calculado_com_ressalvas', null, null));
select pg_temp.caso('com ressalvas, ressalva em branco', 'recusado:indicadores_ressalva_nao_branca', pg_temp.ins('59.5', 'calculado_com_ressalvas', null, '   '));
select pg_temp.caso('com ressalvas, sem valor (R3)', 'recusado:indicadores_situacao_com_valor', pg_temp.ins(null, 'calculado_com_ressalvas', null, 'DAS ausente'));
-- Estimado
select pg_temp.caso('estimado com valor, sem ressalva', 'aceito', pg_temp.ins('7.5', 'estimado', null, null));
select pg_temp.caso('estimado com valor e ressalva', 'aceito', pg_temp.ins('7.5', 'estimado', null, 'Estimado por compras (sem estoque)'));
select pg_temp.caso('estimado sem valor (R3)', 'recusado:indicadores_situacao_com_valor', pg_temp.ins(null, 'estimado', null, null));
-- Confirmar
select pg_temp.caso('confirmar com zero (endividamento sem contratos)', 'aceito', pg_temp.ins('0', 'confirmar', null, null));
select pg_temp.caso('confirmar sem valor (R3)', 'recusado:indicadores_situacao_com_valor', pg_temp.ins(null, 'confirmar', null, null));
-- Não calculável
select pg_temp.caso('n/c sem valor, com motivo', 'aceito', pg_temp.ins(null, 'nao_calculavel', 'Falta a contagem de pacientes distintos do período', null));
select pg_temp.caso('n/c com valor zero (R1)', 'recusado:indicadores_nc_sem_valor_com_motivo', pg_temp.ins('0', 'nao_calculavel', 'sem receita', null));
select pg_temp.caso('n/c com valor (R1)', 'recusado:indicadores_nc_sem_valor_com_motivo', pg_temp.ins('122003.2', 'nao_calculavel', 'sem receita', null));
select pg_temp.caso('n/c sem motivo (R1)', 'recusado:indicadores_nc_sem_valor_com_motivo', pg_temp.ins(null, 'nao_calculavel', null, null));
select pg_temp.caso('n/c com motivo em branco', 'recusado:indicadores_motivo_nao_branco', pg_temp.ins(null, 'nao_calculavel', '  ', null));
select pg_temp.caso('n/c com ressalva', 'aceito', pg_temp.ins(null, 'nao_calculavel', 'sem receita líquida', 'DAS ausente'));
-- R7: ressalva exige situação
select pg_temp.caso('ressalva sem situação, com valor (R7)', 'recusado:indicadores_ressalva_exige_situacao', pg_temp.ins('47.5', null, null, 'DAS ausente'));
select pg_temp.caso('ressalva sem situação, sem valor (R7)', 'recusado:indicadores_ressalva_exige_situacao', pg_temp.ins(null, null, null, 'DAS ausente'));
select pg_temp.caso('confirmar com ressalva', 'aceito', pg_temp.ins('0', 'confirmar', null, 'Sem contratos de dívida enviados'));
select pg_temp.caso('update: situação apagada mantendo a ressalva (R7)', 'recusado:indicadores_ressalva_exige_situacao',
  $q$update public.indicadores set situacao = 'estimado', ressalva = 'x' where diagnostico_id = '00000000-0000-0000-0000-0000000000d1' and nome = 'Indicador 1';
     update public.indicadores set situacao = null where diagnostico_id = '00000000-0000-0000-0000-0000000000d1' and nome = 'Indicador 1'$q$);
-- Motivo sem situação
select pg_temp.caso('motivo sem situação (R2)', 'recusado:indicadores_motivo_so_nc', pg_temp.ins(null, null, 'sem receita', null));
-- Atualizações (UPDATE) sobre um registro antigo
select pg_temp.caso('update: antigo passa a n/c mantendo valor', 'recusado:indicadores_nc_sem_valor_com_motivo',
  $q$update public.indicadores set situacao = 'nao_calculavel', motivo_nao_calculavel = 'x'
     where diagnostico_id = '00000000-0000-0000-0000-0000000000d1' and nome = 'Indicador 1'$q$);
select pg_temp.caso('update: registro antigo vira calculado e perde o valor', 'recusado:indicadores_situacao_com_valor',
  $q$update public.indicadores set situacao = 'calculado', valor = null
     where diagnostico_id = '00000000-0000-0000-0000-0000000000d1' and nome = 'Indicador 1'$q$);
select pg_temp.caso('update: registro antigo recebe ressalva sem situação (R7)', 'recusado:indicadores_ressalva_exige_situacao',
  $q$update public.indicadores set ressalva = 'texto'
     where diagnostico_id = '00000000-0000-0000-0000-0000000000d1' and nome = 'Indicador 1'$q$);
-- Versão da metodologia
select pg_temp.caso('versão v4', 'aceito', $q$update public.diagnosticos set versao_metodologia = 'v4' where id = '00000000-0000-0000-0000-0000000000d3'$q$);
select pg_temp.caso('versão fora da lista', 'recusado:diagnosticos_versao_metodologia_valida', $q$update public.diagnosticos set versao_metodologia = 'v3' where id = '00000000-0000-0000-0000-0000000000d3'$q$);
select pg_temp.caso('versão vazia', 'aceito', $q$update public.diagnosticos set versao_metodologia = null where id = '00000000-0000-0000-0000-0000000000d3'$q$);

-- Central (projeto Supabase): roda cada consulta como uma pessoa, com o papel authenticated ou anon,
-- e desfaz tudo no fim. Nada fica gravado.
create or replace function pg_temp.como(p_pessoa uuid, p_email text, p_papel text, p_sql text, p_preparo text default null) returns text language plpgsql as $$
declare v text;
begin
  begin
    if p_preparo is not null then execute p_preparo; end if; -- roda como dono, antes de trocar de papel
    perform set_config('request.jwt.claims', json_build_object('sub', p_pessoa, 'email', p_email, 'role', p_papel)::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_pessoa::text, ''), true);
    perform set_config('role', p_papel, true);
    execute p_sql into v;
    raise exception using errcode = 'P0001', message = '__desfazer__';
  exception
    when insufficient_privilege then v := 'sem_permissao';
    when raise_exception then if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  return coalesce(v, 'nulo');
end;
$$;

create or replace function pg_temp.central(p_caso text, p_esperado text, p_pessoa uuid, p_email text, p_papel text, p_sql text, p_preparo text default null) returns void language sql as $$
  insert into _resultado (caso, esperado, obtido, ok)
  select p_caso, p_esperado, r, r = p_esperado from (select pg_temp.como(p_pessoa, p_email, p_papel, p_sql, p_preparo) r) x;
$$;

-- Preenche, só durante o caso, a situação de dois indicadores do diagnóstico publicado.
create or replace function pg_temp.com_situacao(p_nada text) returns text language sql as $$
  select ($f$with a as (update public.indicadores set situacao = 'calculado_com_ressalvas', ressalva = 'DAS ausente em um mês'
                       where diagnostico_id = '00000000-0000-0000-0000-0000000000d1' and nome = 'Indicador 1' returning 1),
                     b as (update public.indicadores set situacao = 'nao_calculavel', valor = null, motivo_nao_calculavel = 'Falta a contagem de pacientes'
                       where diagnostico_id = '00000000-0000-0000-0000-0000000000d1' and nome = 'Indicador 5' returning 1),
                     c as (update public.diagnosticos set versao_metodologia = 'v4' where id = '00000000-0000-0000-0000-0000000000d1' returning 1)
                select ((select count(*) from a) + (select count(*) from b) + (select count(*) from c))::text$f$);
$$;

select pg_temp.central('equipe: central_diagnostico traz situacao, motivo, ressalva e versao', 'sim',
  '00000000-0000-0000-0000-0000000000a1', 'equipe@teste.local', 'authenticated',
  $q$select case when (j->'indicadores'->0) ?& array['situacao','motivo_nao_calculavel','ressalva'] and j ? 'versao_metodologia' then 'sim' else 'não' end
     from (select public.central_diagnostico('00000000-0000-0000-0000-0000000000d1') j) x$q$);
select pg_temp.central('equipe: central_diagnostico mantém os 22 valores', '22',
  '00000000-0000-0000-0000-0000000000a1', 'equipe@teste.local', 'authenticated',
  $q$select count(*)::text from jsonb_array_elements(public.central_diagnostico('00000000-0000-0000-0000-0000000000d1')->'indicadores') e
     join public.indicadores i on i.id = (e->>'id')::uuid and i.valor is not distinct from (e->>'valor')::numeric$q$);
select pg_temp.central('equipe: grava situação pelo acesso normal (RLS)', '3',
  '00000000-0000-0000-0000-0000000000a1', 'equipe@teste.local', 'authenticated', pg_temp.com_situacao(''));
select pg_temp.central('cliente com acesso: vê situação, ressalva, motivo e versão preenchidos', 'calculado_com_ressalvas|DAS ausente em um mês|nao_calculavel|Falta a contagem de pacientes|v4',
  '00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local', 'authenticated',
  $q$select concat_ws('|', i1->>'situacao', i1->>'ressalva', i5->>'situacao', i5->>'motivo_nao_calculavel', j->>'versao_metodologia')
     from (select public.central_diagnostico('00000000-0000-0000-0000-0000000000d1') j) x,
     lateral (select e from jsonb_array_elements(j->'indicadores') e where e->>'nome' = 'Indicador 1') a(i1),
     lateral (select e from jsonb_array_elements(j->'indicadores') e where e->>'nome' = 'Indicador 5') b(i5)$q$,
  pg_temp.com_situacao(''));
select pg_temp.central('cliente com acesso: n/c chega sem valor', 'sem valor',
  '00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local', 'authenticated',
  $q$select case when e->'valor' = 'null'::jsonb then 'sem valor' else e->>'valor' end
     from jsonb_array_elements(public.central_diagnostico('00000000-0000-0000-0000-0000000000d1')->'indicadores') e where e->>'nome' = 'Indicador 5'$q$,
  pg_temp.com_situacao(''));
select pg_temp.central('cliente com acesso: não recebe criado_por nem responsavel_id', 'ok',
  '00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local', 'authenticated',
  $q$select case when bool_or(e ? 'criado_por' or e ? 'responsavel_id') then 'vazou' else 'ok' end
     from jsonb_array_elements(public.central_diagnostico('00000000-0000-0000-0000-0000000000d1')->'indicadores') e$q$);
select pg_temp.central('cliente com acesso: diagnóstico não publicado não aparece', 'nulo',
  '00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local', 'authenticated',
  $q$select public.central_diagnostico('00000000-0000-0000-0000-0000000000d2')::text$q$);
select pg_temp.central('cliente com acesso: não lê a tabela indicadores direto', '0',
  '00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local', 'authenticated',
  $q$select count(*)::text from public.indicadores$q$);
select pg_temp.central('cliente com acesso: não grava situação (RLS)', '0',
  '00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local', 'authenticated',
  $q$with u as (update public.indicadores set situacao = 'estimado' where valor is not null returning 1) select count(*)::text from u$q$);
select pg_temp.central('cliente com acesso: não grava a versão (RLS)', '0',
  '00000000-0000-0000-0000-0000000000c1', 'cliente.a@teste.local', 'authenticated',
  $q$with u as (update public.diagnosticos set versao_metodologia = 'v4' returning 1) select count(*)::text from u$q$);
select pg_temp.central('cliente sem acesso: não vê o diagnóstico publicado', 'nulo',
  '00000000-0000-0000-0000-0000000000c2', 'cliente.b@teste.local', 'authenticated',
  $q$select public.central_diagnostico('00000000-0000-0000-0000-0000000000d1')::text$q$);
select pg_temp.central('sem login (anon): não executa central_diagnostico', 'sem_permissao',
  null, '', 'anon',
  $q$select public.central_diagnostico('00000000-0000-0000-0000-0000000000d1')::text$q$);

-- Registros antigos ficaram vazios
insert into _resultado (caso, esperado, obtido, ok)
select 'registros antigos sem situação nem versão', '0',
       ((select count(*) from public.indicadores where situacao is not null or motivo_nao_calculavel is not null or ressalva is not null)
        + (select count(*) from public.diagnosticos where versao_metodologia is not null))::text,
       ((select count(*) from public.indicadores where situacao is not null or motivo_nao_calculavel is not null or ressalva is not null)
        + (select count(*) from public.diagnosticos where versao_metodologia is not null)) = 0;

select jsonb_build_object('passaram', count(*) filter (where ok), 'total', count(*),
  'casos', jsonb_agg(jsonb_build_object('n', n, 'caso', caso, 'esperado', esperado, 'obtido', obtido, 'ok', ok) order by n)) from _resultado;
