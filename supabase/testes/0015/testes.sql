-- Testes da 0015 (envio semanal), sobre a 0014. Usa as empresas e pessoas fictícias de teste.
-- Cada caso roda uma ação como uma pessoa e depois uma conferência (como dono, ou como a pessoa indicada),
-- dentro de uma subtransação desfeita no fim: nada fica gravado.
-- Devolve um JSON com passaram, total e cada caso.

create temp table if not exists _casos (n serial, caso text, esperado text, pessoa text, acao text, checa text, checa_como text);

create or replace function pg_temp.como(p_pessoa text) returns void language plpgsql as $$
declare v_id uuid := case p_pessoa when 'equipe' then '00000000-0000-0000-0000-0000000000a1'
                                   when 'cliente_a' then '00000000-0000-0000-0000-0000000000c1'
                                   when 'cliente_b' then '00000000-0000-0000-0000-0000000000c2' end;
begin
  if p_pessoa is null then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    return;
  end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', case when v_id is null then 'anon' else 'authenticated' end,
    'email', case p_pessoa when 'equipe' then 'equipe@teste.local' when 'cliente_a' then 'cliente.a@teste.local'
                           when 'cliente_b' then 'cliente.b@teste.local' else '' end)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(v_id::text, ''), true);
  perform set_config('role', case when v_id is null then 'anon' else 'authenticated' end, true);
end;
$$;

create or replace function pg_temp.executar(p_pessoa text, p_acao text, p_checa text, p_checa_como text) returns text language plpgsql as $$
declare v text;
begin
  begin
    perform pg_temp.como(p_pessoa);
    if p_acao is not null then execute p_acao; end if;
    perform pg_temp.como(p_checa_como);
    execute p_checa into v;
    v := coalesce(v, 'nulo');
    raise exception using errcode = 'P0001', message = '__desfazer__';
  exception
    when insufficient_privilege then
      v := 'sem_permissao';
    when check_violation or unique_violation or foreign_key_violation then
      get stacked diagnostics v = constraint_name;
      v := 'recusado:' || v;
    when raise_exception then
      if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  perform pg_temp.como(null);
  return v;
end;
$$;


create or replace function pg_temp.id(p text) returns text language sql as $$ select '00000000-0000-0000-0000-00000000' || p $$;

-- Dados de apoio (0015: mais dois itens semanais em e1, 0104 com nada enviado e 0105): e1 com um item mensal ativo (0i01), um "uma vez" (0i02) e um mensal inativo (0i03); e2 com um item (0i09).
-- Um arquivo já enviado (0a01) no item 0i01 em outubro e o objeto correspondente no armazenamento.
create or replace function pg_temp.apoio() returns void language sql as $$
  insert into public.envios_itens (id, empresa_id, nome, frequencia, ativo, ordem) values
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000e1', 'Extrato do Banco A', 'mensal', true, 1),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000e1', 'Contrato de empréstimo', 'unica', true, 2),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000e1', 'Conta antiga', 'mensal', false, 3),
    ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-0000000000e2', 'Extrato da B', 'mensal', true, 1),
    ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-0000000000e1', 'Extrato semanal', 'semanal', true, 4),
    ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-0000000000e1', 'Maquininha', 'semanal', true, 5);
  insert into public.envios_arquivos (id, empresa_id, item_id, competencia, caminho, nome_arquivo, enviado_por) values
    ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000101', '2026-10-01',
     '00000000-0000-0000-0000-0000000000e1/out.ofx', 'out.ofx', '00000000-0000-0000-0000-0000000000c1');
  insert into storage.objects (bucket_id, name, owner) values
    ('envios', '00000000-0000-0000-0000-0000000000e1/out.ofx', '00000000-0000-0000-0000-0000000000c1'),
    ('envios', '00000000-0000-0000-0000-0000000000e2/b.ofx', null);
$$;

-- Registro de arquivo pela pessoa: item, mês, caminho e quem enviou (por padrão, quem está logado).
create or replace function pg_temp.arquivo(p_empresa text, p_item text, p_comp text, p_caminho text, p_por text default null) returns text language sql as $$
  select format('insert into public.envios_arquivos (empresa_id, item_id, competencia, caminho, nome_arquivo%s) values (%L, %s, %s, %L, %L%s)',
    case when p_por is not null then ', enviado_por' else '' end,
    pg_temp.id(p_empresa), coalesce(quote_literal(pg_temp.id(p_item)), 'null'), coalesce(quote_literal(p_comp), 'null'),
    p_caminho, 'arquivo', case when p_por is not null then ', ' || quote_literal(pg_temp.id(p_por)) else '' end);
$$;
create or replace function pg_temp.objeto(p_nome text) returns text language sql as $$
  select format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'envios', p_nome);
$$;

insert into _casos (caso, esperado, pessoa, acao, checa, checa_como) values
('equipe cria item semanal', '7', 'equipe',
  format('insert into public.envios_itens (empresa_id, nome, frequencia) values (%L, %L, %L)', pg_temp.id('00e1'), 'Recebimentos', 'semanal'),
  $c$select count(*)::text from public.envios_itens$c$, null),
('frequência fora da lista não', 'recusado:envios_itens_frequencia_check', 'equipe',
  format('insert into public.envios_itens (empresa_id, nome, frequencia) values (%L, %L, %L)', pg_temp.id('00e1'), 'X', 'diaria'), 'select 1', null),
('cliente envia a semana que começa na segunda', '2', 'cliente_a',
  pg_temp.arquivo('00e1', '0104', '2026-11-02', pg_temp.id('00e1') || '/s1.ofx'), $c$select count(*)::text from public.envios_arquivos$c$, null),
('semana que começa na segunda, mesmo cruzando o mês', '2', 'cliente_a',
  pg_temp.arquivo('00e1', '0104', '2026-09-28', pg_temp.id('00e1') || '/s2.ofx'), $c$select count(*)::text from public.envios_arquivos$c$, null),
('semana tem de começar na segunda', 'recusado:envios_competencia', 'cliente_a',
  pg_temp.arquivo('00e1', '0104', '2026-11-04', pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('semanal no dia 1 que não é segunda não', 'recusado:envios_competencia', 'cliente_a',
  pg_temp.arquivo('00e1', '0104', '2026-11-01', pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('semanal precisa da semana', 'recusado:envios_competencia', 'cliente_a',
  pg_temp.arquivo('00e1', '0104', null, pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('mensal numa segunda que não é dia 1 não', 'recusado:envios_competencia', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-02', pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('mensal no dia 1 segue valendo', '2', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e1') || '/m.ofx'), $c$select count(*)::text from public.envios_arquivos$c$, null),
('mensal que cai numa segunda dia 1 também vale', '2', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-06-01', pg_temp.id('00e1') || '/jun.ofx'), $c$select count(*)::text from public.envios_arquivos$c$, null),
('equipe dispensa uma semana', '1', 'equipe',
  format('insert into public.envios_dispensas (empresa_id, item_id, competencia, motivo) values (%L, %L, %L, %L)', pg_temp.id('00e1'), pg_temp.id('0104'), '2026-11-02', 'Feriado'),
  $c$select count(*)::text from public.envios_dispensas$c$, 'cliente_a'),
('dispensa semanal fora da segunda não', 'recusado:envios_competencia', 'equipe',
  format('insert into public.envios_dispensas (empresa_id, item_id, competencia) values (%L, %L, %L)', pg_temp.id('00e1'), pg_temp.id('0104'), '2026-11-03'), 'select 1', null),
('dispensa mensal numa segunda não', 'recusado:envios_competencia', 'equipe',
  format('insert into public.envios_dispensas (empresa_id, item_id, competencia) values (%L, %L, %L)', pg_temp.id('00e1'), pg_temp.id('0101'), '2026-11-02'), 'select 1', null),
('item uma vez não tem dispensa', 'recusado:envios_competencia', 'equipe',
  format('insert into public.envios_dispensas (empresa_id, item_id, competencia) values (%L, %L, %L)', pg_temp.id('00e1'), pg_temp.id('0102'), '2026-11-01'), 'select 1', null),
('item sem arquivos troca de frequência', 'semanal', 'equipe',
  format($c$update public.envios_itens set frequencia = 'semanal' where id = %L$c$, pg_temp.id('0102')),
  format($c$select frequencia from public.envios_itens where id = %L$c$, pg_temp.id('0102')), null),
('item com arquivos não troca de frequência', 'recusado:envios_frequencia_fixa', 'equipe',
  format($c$update public.envios_itens set frequencia = 'semanal' where id = %L$c$, pg_temp.id('0101')), 'select 1', null),
('item com arquivos ainda muda nome', 'Extrato Itaú', 'equipe',
  format($c$update public.envios_itens set nome = 'Extrato Itaú' where id = %L$c$, pg_temp.id('0101')),
  format($c$select nome from public.envios_itens where id = %L$c$, pg_temp.id('0101')), null),
('ninguém chama as regras novas pela API', 'f|f|f|f', null, null,
  $c$select concat_ws('|', has_function_privilege('anon', 'public.envios_dispensas_validar()', 'execute'), has_function_privilege('authenticated', 'public.envios_dispensas_validar()', 'execute'),
     has_function_privilege('anon', 'public.envios_itens_validar()', 'execute'), has_function_privilege('authenticated', 'public.envios_itens_validar()', 'execute'))$c$, null);

create or replace function pg_temp.rodar() returns jsonb language plpgsql as $$
declare v_res jsonb := '[]'; c record; v text;
begin
  begin
    perform pg_temp.apoio();
    for c in select * from _casos order by n loop
      v := pg_temp.executar(c.pessoa, c.acao, c.checa, c.checa_como);
      v_res := v_res || jsonb_build_object('n', c.n, 'caso', c.caso, 'esperado', c.esperado, 'obtido', v, 'ok', v = c.esperado);
    end loop;
    raise exception using errcode = 'P0001', message = '__desfazer__';
  exception when raise_exception then
    if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  return v_res;
end;
$$;

select jsonb_build_object('passaram', count(*) filter (where (e ->> 'ok')::boolean), 'total', count(*),
  'falhas', coalesce(jsonb_agg(e) filter (where not (e ->> 'ok')::boolean), '[]'), 'casos', jsonb_agg(e))
from jsonb_array_elements(pg_temp.rodar()) e;
