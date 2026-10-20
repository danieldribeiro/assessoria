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

-- Central: chama a função real central_diagnostico como alguém da equipe; as colunas novas chegam no JSON (M6).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'equipe@teste.local');
update public.perfis set papel = 'equipe' where id = '00000000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into _resultado (caso, esperado, obtido, ok)
select 'central_diagnostico (função real) inclui situacao/motivo/ressalva e versao', 'sim', r, r = 'sim'
from (select case when (j->'indicadores'->0) ?& array['situacao','motivo_nao_calculavel','ressalva']
                       and j ? 'versao_metodologia' then 'sim' else coalesce(left(j::text, 60), 'nulo') end r
      from (select public.central_diagnostico('00000000-0000-0000-0000-0000000000d1') j) x) y;
insert into _resultado (caso, esperado, obtido, ok)
select 'central_diagnostico mantém os 22 valores', '22', count(*)::text, count(*) = 22
from jsonb_array_elements(public.central_diagnostico('00000000-0000-0000-0000-0000000000d1')->'indicadores') e
join public.indicadores i on i.id = (e->>'id')::uuid and i.valor is not distinct from (e->>'valor')::numeric;
delete from public.perfis where id = '00000000-0000-0000-0000-0000000000a1';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';

-- Registros antigos ficaram vazios
insert into _resultado (caso, esperado, obtido, ok)
select 'registros antigos sem situação nem versão', '0',
       ((select count(*) from public.indicadores where situacao is not null or motivo_nao_calculavel is not null or ressalva is not null)
        + (select count(*) from public.diagnosticos where versao_metodologia is not null))::text,
       ((select count(*) from public.indicadores where situacao is not null or motivo_nao_calculavel is not null or ressalva is not null)
        + (select count(*) from public.diagnosticos where versao_metodologia is not null)) = 0;

select n, caso, esperado, obtido, case when ok then 'OK' else 'FALHOU' end as resultado from _resultado order by n;
select count(*) filter (where ok) as passaram, count(*) as total from _resultado;
