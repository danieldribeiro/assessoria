-- Testes da 0014 (envio de arquivos pela central). Usa as empresas e pessoas fictícias de teste.
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

-- Dados de apoio: e1 com um item mensal ativo (0i01), um "uma vez" (0i02) e um mensal inativo (0i03); e2 com um item (0i09).
-- Um arquivo já enviado (0a01) no item 0i01 em outubro e o objeto correspondente no armazenamento.
create or replace function pg_temp.apoio() returns void language sql as $$
  insert into public.envios_itens (id, empresa_id, nome, frequencia, ativo, ordem) values
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000e1', 'Extrato do Banco A', 'mensal', true, 1),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000e1', 'Contrato de empréstimo', 'unica', true, 2),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000e1', 'Conta antiga', 'mensal', false, 3),
    ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-0000000000e2', 'Extrato da B', 'mensal', true, 1);
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
-- Itens
('cliente lê os itens da própria clínica', '3', null, null, $c$select count(*)::text from public.envios_itens$c$, 'cliente_a'),
('cliente sem acesso não lê itens', '0', null, null, $c$select count(*)::text from public.envios_itens$c$, 'cliente_b'),
('sem login não lê itens', '0', null, null, $c$select count(*)::text from public.envios_itens$c$, 'anon'),
('equipe lê os itens das duas clínicas', '4', null, null, $c$select count(*)::text from public.envios_itens$c$, 'equipe'),
('cliente não cria item', 'sem_permissao', 'cliente_a',
  format('insert into public.envios_itens (empresa_id, nome, frequencia) values (%L, %L, %L)', pg_temp.id('00e1'), 'X', 'mensal'), 'select 1', null),
('equipe cria item', '5', 'equipe',
  format('insert into public.envios_itens (empresa_id, nome, frequencia) values (%L, %L, %L)', pg_temp.id('00e1'), 'Fatura do cartão', 'mensal'),
  $c$select count(*)::text from public.envios_itens$c$, null),

-- Arquivos
('cliente registra arquivo do mês na própria clínica', '2', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e1') || '/nov.ofx'), $c$select count(*)::text from public.envios_arquivos$c$, null),
('cliente registra arquivo do item uma vez, sem mês', '2', 'cliente_a',
  pg_temp.arquivo('00e1', '0102', null, pg_temp.id('00e1') || '/contrato.pdf'), $c$select count(*)::text from public.envios_arquivos$c$, null),
('o envio fica com o nome de quem enviou', 'true', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e1') || '/nov.ofx'),
  format($c$select (enviado_por = %L)::text from public.envios_arquivos where caminho like '%%nov.ofx'$c$, pg_temp.id('00c1')), null),
('cliente não envia para outra clínica', 'sem_permissao', 'cliente_a',
  pg_temp.arquivo('00e2', '0109', '2026-11-01', pg_temp.id('00e2') || '/x.ofx'), 'select 1', null),
('cliente sem acesso não envia', 'sem_permissao', 'cliente_b',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('cliente não envia em nome de outra pessoa', 'sem_permissao', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e1') || '/x.ofx', '00a1'), 'select 1', null),
('item mensal precisa do mês', 'recusado:envios_competencia', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', null, pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('mês sempre no dia 1', 'recusado:envios_arquivos_competencia_check', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-05', pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('item fora da lista não recebe arquivo', 'recusado:envios_item_ativo', 'cliente_a',
  pg_temp.arquivo('00e1', '0103', '2026-11-01', pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('arquivo fica na pasta da própria clínica', 'recusado:envios_arquivos_caminho', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e2') || '/x.ofx'), 'select 1', null),
('item de outra clínica não serve', 'recusado:envios_arquivos_item', 'equipe',
  pg_temp.arquivo('00e1', '0109', '2026-11-01', pg_temp.id('00e1') || '/x.ofx'), 'select 1', null),
('mesmo caminho duas vezes não', 'recusado:envios_arquivos_caminho_key', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e1') || '/out.ofx'), 'select 1', null),
('cliente não apaga o que enviou', '1', 'cliente_a',
  'delete from public.envios_arquivos', $c$select count(*)::text from public.envios_arquivos$c$, null),
('cliente não troca o que enviou', 'out.ofx', 'cliente_a',
  $c$update public.envios_arquivos set nome_arquivo = 'outro'$c$, $c$select nome_arquivo from public.envios_arquivos$c$, null),
('equipe apaga arquivo', '0', 'equipe',
  'delete from public.envios_arquivos', $c$select count(*)::text from public.envios_arquivos$c$, null),
('cliente sem acesso não vê arquivos', '0', null, null, $c$select count(*)::text from public.envios_arquivos$c$, 'cliente_b'),

-- Dispensas
('equipe dispensa um item no mês', '1', 'equipe',
  format('insert into public.envios_dispensas (empresa_id, item_id, competencia, motivo) values (%L, %L, %L, %L)', pg_temp.id('00e1'), pg_temp.id('0101'), '2026-11-01', 'Sem movimento'),
  $c$select count(*)::text from public.envios_dispensas$c$, 'cliente_a'),
('cliente não dispensa', 'sem_permissao', 'cliente_a',
  format('insert into public.envios_dispensas (empresa_id, item_id, competencia) values (%L, %L, %L)', pg_temp.id('00e1'), pg_temp.id('0101'), '2026-11-01'), 'select 1', null),

-- Histórico
('envio entra no histórico com quem enviou', 'envios_arquivos|criado|t|t', 'cliente_a',
  pg_temp.arquivo('00e1', '0101', '2026-11-01', pg_temp.id('00e1') || '/nov.ofx'),
  format($c$select concat_ws('|', tabela, acao, empresa_id = %L, por = %L) from public.historico order by id desc limit 1$c$, pg_temp.id('00e1'), pg_temp.id('00c1')), null),

-- Armazenamento
('cliente envia PDF para a pasta da clínica', '3', 'cliente_a',
  pg_temp.objeto(pg_temp.id('00e1') || '/fatura.pdf'), $c$select count(*)::text from storage.objects$c$, null),
('cliente envia OFX com extensão maiúscula', '3', 'cliente_a',
  pg_temp.objeto(pg_temp.id('00e1') || '/EXTRATO.OFX'), $c$select count(*)::text from storage.objects$c$, null),
('cliente não envia para a pasta de outra clínica', 'sem_permissao', 'cliente_a',
  pg_temp.objeto(pg_temp.id('00e2') || '/x.pdf'), 'select 1', null),
('cliente não envia tipo de arquivo fora da lista', 'sem_permissao', 'cliente_a',
  pg_temp.objeto(pg_temp.id('00e1') || '/programa.exe'), 'select 1', null),
('cliente não envia fora de uma pasta de clínica', 'sem_permissao', 'cliente_a',
  pg_temp.objeto('lixo/x.pdf'), 'select 1', null),
('cliente só vê os arquivos da própria clínica', '1', null, null, $c$select count(*)::text from storage.objects$c$, 'cliente_a'),
('cliente sem acesso não vê arquivos guardados', '0', null, null, $c$select count(*)::text from storage.objects$c$, 'cliente_b'),
('cliente não apaga arquivo guardado', '2', 'cliente_a', 'delete from storage.objects', $c$select count(*)::text from storage.objects$c$, null),
('equipe apaga arquivo guardado', '0', 'equipe', 'delete from storage.objects', $c$select count(*)::text from storage.objects$c$, null),
('o armazenamento é privado e limitado a 20 MB', 'f|20971520', null, null,
  $c$select concat_ws('|', public, file_size_limit) from storage.buckets where id = 'envios'$c$, null),
('ninguém chama a regra de validação pela API', 'f|f', null, null,
  $c$select concat_ws('|', has_function_privilege('anon', 'public.envios_arquivos_validar()', 'execute'), has_function_privilege('authenticated', 'public.envios_arquivos_validar()', 'execute'))$c$, null);

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
