-- Testes da 0013 (histórico de alterações). Usa os dados fictícios das empresas e diagnósticos de teste.
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
    when raise_exception then
      if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  perform pg_temp.como(null);
  return v;
end;
$$;

-- Atalhos: id fictício e a última linha do histórico (campos escolhidos, separados por |).
create or replace function pg_temp.id(p text) returns text language sql as $$ select '00000000-0000-0000-0000-00000000' || p $$;
create or replace function pg_temp.ultimo(p_campos text) returns text language sql as $$
  select format('select concat_ws(%L, %s) from public.historico order by id desc limit 1', '|', p_campos);
$$;
create or replace function pg_temp.indicador() returns text language sql as $$
  select format('(select id from public.indicadores where diagnostico_id = %L and ordem = 1)', pg_temp.id('00d1'));
$$;

insert into _casos (caso, esperado, pessoa, acao, checa, checa_como) values
('histórico nasce vazio', '0', null, null, 'select count(*)::text from public.historico', null),

-- Diagnóstico e itens
('criar achado registra criado, com empresa, diagnóstico e quem fez', 'achados|criado|t|t|t|Teste', 'equipe',
  format('insert into public.achados (diagnostico_id, categoria, titulo) values (%L, %L, %L)', pg_temp.id('00d1'), 'Financeiro', 'Teste'),
  pg_temp.ultimo(format('tabela, acao, empresa_id = %L, diagnostico_id = %L, por = %L, depois ->> %L', pg_temp.id('00e1'), pg_temp.id('00d1'), pg_temp.id('00a1'), 'titulo')), null),
('editar indicador guarda só o que mudou, antes e depois', 'indicadores|alterado|1.5|123|valor|valor', 'equipe',
  format('update public.indicadores set valor = 123 where id = %s', pg_temp.indicador()),
  pg_temp.ultimo($c$tabela, acao, antes ->> 'valor', depois ->> 'valor', (select string_agg(k, ',') from jsonb_object_keys(antes) k), (select string_agg(k, ',') from jsonb_object_keys(depois) k)$c$), null),
('salvar sem mudar nada não registra', '0', 'equipe',
  format('update public.indicadores set valor = valor where id = %s', pg_temp.indicador()),
  'select count(*)::text from public.historico', null),
('excluir indicador guarda a linha inteira', 'excluido|Indicador 1|t', 'equipe',
  format('delete from public.indicadores where id = %s', pg_temp.indicador()),
  pg_temp.ultimo($c$acao, antes ->> 'nome', depois is null$c$), null),
('excluir diagnóstico guarda ele e cada item apagado junto', '1|22|22', 'equipe',
  format('delete from public.diagnosticos where id = %L', pg_temp.id('00d2')),
  format($c$select concat_ws('|', count(*) filter (where tabela = 'diagnosticos'), count(*) filter (where tabela = 'indicadores'),
                                  count(*) filter (where tabela = 'indicadores' and empresa_id = %L and acao = 'excluido'))
           from public.historico$c$, pg_temp.id('00e1')), null),
('excluir empresa guarda empresa, diagnóstico e itens', '1|1|22', 'equipe',
  format('delete from public.empresas where id = %L', pg_temp.id('00e2')),
  $c$select concat_ws('|', count(*) filter (where tabela = 'empresas'), count(*) filter (where tabela = 'diagnosticos'),
                          count(*) filter (where tabela = 'indicadores'))
     from public.historico$c$, null),

-- Acessos
('liberar acesso registra criado', 'acessos_central|criado|novo@teste.local|t', 'equipe',
  format('insert into public.acessos_central (empresa_id, email) values (%L, %L)', pg_temp.id('00e1'), 'novo@teste.local'),
  pg_temp.ultimo(format('tabela, acao, depois ->> %L, empresa_id = %L', 'email', pg_temp.id('00e1'))), null),
('remover acesso registra excluido com o e-mail', 'excluido|cliente.a@teste.local', 'equipe',
  format('delete from public.acessos_central where email = %L', 'cliente.a@teste.local'),
  pg_temp.ultimo($c$acao, antes ->> 'email'$c$), null),
('mudar papel registra no perfil', 'perfis|alterado|cliente|equipe', 'equipe',
  format('select public.definir_papel(%L, %L)', pg_temp.id('00c2'), 'equipe'),
  pg_temp.ultimo($c$tabela, acao, antes ->> 'papel', depois ->> 'papel'$c$), null),
('cliente entrar na central registra entrou', 'entrou|t', 'cliente_a',
  'select count(*) from public.central_empresas()',
  pg_temp.ultimo(format('acao, por = %L', pg_temp.id('00c1'))), null),
('entrar de novo na mesma hora não registra outra vez', '1', 'cliente_a',
  'select count(*) from public.central_empresas(); select count(*) from public.central_empresas()',
  $c$select count(*)::text from public.historico where acao = 'entrou'$c$, null),

-- Quem lê e quem grava
('equipe lê o histórico', '1', 'equipe',
  format('insert into public.contatos (empresa_id, nome) values (%L, %L)', pg_temp.id('00e1'), 'Fulano'),
  'select count(*)::text from public.historico', 'equipe'),
('cliente não lê o histórico', '0', 'equipe',
  format('insert into public.contatos (empresa_id, nome) values (%L, %L)', pg_temp.id('00e1'), 'Fulano'),
  'select count(*)::text from public.historico', 'cliente_a'),
('sem login não lê o histórico', '0', 'equipe',
  format('insert into public.contatos (empresa_id, nome) values (%L, %L)', pg_temp.id('00e1'), 'Fulano'),
  'select count(*)::text from public.historico', 'anon'),
('equipe não grava no histórico', 'sem_permissao', 'equipe',
  $c$insert into public.historico (tabela, registro_id, acao) values ('x', 'x', 'criado')$c$, 'select 1', null),
('equipe não apaga o histórico', 'sem_permissao', 'equipe',
  format('insert into public.contatos (empresa_id, nome) values (%L, %L); delete from public.historico', pg_temp.id('00e1'), 'Fulano'), 'select 1', null),
('equipe não altera o histórico', 'sem_permissao', 'equipe',
  format('insert into public.contatos (empresa_id, nome) values (%L, %L); update public.historico set acao = %L', pg_temp.id('00e1'), 'Fulano', 'alterado'), 'select 1', null),
('ninguém chama as funções de gatilho pela API', 'f|f|f|f|f|f', null, null,
  $c$select concat_ws('|', has_function_privilege('anon', 'public.registrar_historico()', 'execute'),
    has_function_privilege('authenticated', 'public.registrar_historico()', 'execute'),
    has_function_privilege('anon', 'public.fin_contas_auditar()', 'execute'),
    has_function_privilege('authenticated', 'public.fin_contas_auditar()', 'execute'),
    has_function_privilege('anon', 'public.fin_lancamentos_auditar()', 'execute'),
    has_function_privilege('authenticated', 'public.fin_lancamentos_auditar()', 'execute'))$c$, null),
('mudança feita fora do sistema fica sem autor', 't', null,
  format('update public.empresas set nome = nome || %L where id = %L', ' X', pg_temp.id('00e1')),
  pg_temp.ultimo('por is null'), null);

create or replace function pg_temp.rodar() returns jsonb language plpgsql as $$
declare v_res jsonb := '[]'; c record; v text;
begin
  for c in select * from _casos order by n loop
    v := pg_temp.executar(c.pessoa, c.acao, c.checa, c.checa_como);
    v_res := v_res || jsonb_build_object('n', c.n, 'caso', c.caso, 'esperado', c.esperado, 'obtido', v, 'ok', v = c.esperado);
  end loop;
  return v_res;
end;
$$;

select jsonb_build_object('passaram', count(*) filter (where (e ->> 'ok')::boolean), 'total', count(*),
  'falhas', coalesce(jsonb_agg(e) filter (where not (e ->> 'ok')::boolean), '[]'), 'casos', jsonb_agg(e))
from jsonb_array_elements(pg_temp.rodar()) e;
