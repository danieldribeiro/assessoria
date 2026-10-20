-- Testes da 0007 (financeiro: plano de contas, caixa, lançamentos, transferências, saldos, fluxo e acesso).
-- Roda no Postgres local (rodar.sh) e no projeto Supabase axis-testes. Precisa das pessoas e empresas fictícias
-- de seed-local.sql (local) ou de supabase/testes/0006/seed-supabase.sql (axis-testes).
-- Tudo roda dentro de uma subtransação desfeita no fim: os dados de apoio e cada caso não ficam gravados.
-- Devolve um JSON com passaram, total e cada caso.

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

-- Dados de apoio, todos fictícios. Empresa A = Clínica Teste A (e1); empresa B = Clínica Teste B (e2).
create or replace function pg_temp.apoio() returns void language sql as $$
  insert into public.fin_contas (id, empresa_id, conta_pai_id, codigo, nome, tipo, natureza, classificacao, comportamento_caixa, dre_secao, ativa) values
    ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000e1', null, '1', 'Receitas', 'grupo', null, null, null, 1, true),
    ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000f101', '1.01', 'Consultas', 'analitica', 'receita', 'receita_bruta', 'operacional', 1, true),
    ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000000e1', null, '6', 'Despesas operacionais', 'grupo', null, null, null, 8, true),
    ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000f103', '6.01', 'Aluguel', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8, true),
    ('00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000f103', '6.02', 'Depreciação', 'analitica', 'despesa', 'despesa_operacional', 'sem_caixa', 8, true),
    ('00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-0000000000e1', null, '9.01', 'Amortização de empréstimos', 'analitica', 'passivo', 'financiamento', 'financiamento', null, true),
    ('00000000-0000-0000-0000-00000000f107', '00000000-0000-0000-0000-0000000000e1', null, '9.02', 'Juros de empréstimos', 'analitica', 'despesa', 'despesa_financeira', 'financiamento', 10, true),
    ('00000000-0000-0000-0000-00000000f108', '00000000-0000-0000-0000-0000000000e1', null, '7.01', 'Equipamentos', 'analitica', 'ativo', 'investimento', 'investimento', null, true),
    ('00000000-0000-0000-0000-00000000f109', '00000000-0000-0000-0000-0000000000e1', null, '8.01', 'Transferência entre contas', 'analitica', 'ativo', 'transferencia', 'transferencia_interna', null, true),
    ('00000000-0000-0000-0000-00000000f10a', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000f103', '6.03', 'Materiais antigos', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8, false),
    ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000e2', null, '1.01', 'Receita B', 'analitica', 'receita', 'receita_bruta', 'operacional', 1, true);
  insert into public.fin_contas_caixa (id, empresa_id, nome, tipo, saldo_inicial, data_saldo_inicial, ativa) values
    ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000000e1', 'Banco A', 'banco', 10000, '2026-09-01', true),
    ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000000e1', 'Banco A2', 'banco', 0, '2026-09-01', true),
    ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-0000000000e1', 'Caixa antigo', 'caixa', 0, '2026-09-01', false),
    ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-0000000000e2', 'Banco B', 'banco', 500, '2026-09-01', true);
  insert into public.fin_lancamentos (id, empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_vencimento, data_liquidacao, situacao, descricao) values
    ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-0000000000e1', 'entrada', 3000, '00000000-0000-0000-0000-00000000c101', '2026-09-10', null, '2026-09-10', 'realizado', 'Consultas de setembro'),
    ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-0000000000e1', 'saida', 1000, '00000000-0000-0000-0000-00000000c101', '2026-09-15', null, '2026-09-15', 'realizado', 'Aluguel de setembro'),
    ('00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-0000000000e1', 'saida', 1000, '00000000-0000-0000-0000-00000000c101', '2026-09-30', '2026-10-05', null, 'previsto', 'Parcela do empréstimo'),
    ('00000000-0000-0000-0000-00000000a104', '00000000-0000-0000-0000-0000000000e1', 'entrada', 2000, '00000000-0000-0000-0000-00000000c101', '2026-09-25', null, '2026-10-03', 'realizado', 'Tratamento de setembro recebido em outubro'),
    ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-0000000000e2', 'entrada', 500, '00000000-0000-0000-0000-00000000c201', '2026-09-12', null, '2026-09-12', 'realizado', 'Receita da empresa B');
  insert into public.fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor) values
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000f102', 3000),
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000f104', 1000),
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-00000000f106', 800),
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-00000000f107', 200),
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a104', '00000000-0000-0000-0000-00000000f102', 2000),
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000f201', 500);
  insert into public.fin_transferencias (id, empresa_id, conta_origem_id, conta_destino_id, valor, data, descricao) values
    ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c102', 5000, '2026-09-20', 'Reserva');
$$;

-- Atalhos de texto para os casos.
create or replace function pg_temp.conta(p_codigo text, p_nome text, p_tipo text, p_natureza text, p_classificacao text, p_caixa text, p_dre int,
                                         p_pai text default null, p_empresa text default 'e1', p_cmv boolean default false) returns text language sql as $$
  select format('insert into public.fin_contas (empresa_id, conta_pai_id, codigo, nome, tipo, natureza, classificacao, comportamento_caixa, dre_secao, custo_cmv) values (%L, %s, %L, %L, %L, %s, %s, %s, %s, %s)',
    '00000000-0000-0000-0000-0000000000' || p_empresa, coalesce(quote_literal('00000000-0000-0000-0000-00000000' || p_pai), 'null'),
    p_codigo, p_nome, p_tipo, coalesce(quote_literal(p_natureza), 'null'), coalesce(quote_literal(p_classificacao), 'null'),
    coalesce(quote_literal(p_caixa), 'null'), coalesce(p_dre::text, 'null'), p_cmv::text);
$$;
-- fin_lancar na empresa A, conta Banco A, com o rateio dado como pares (conta, valor).
create or replace function pg_temp.lancar(p_direcao text, p_total text, p_situacao text, p_liquidacao text, p_vencimento text, p_rateios text,
                                          p_caixa text default 'c101', p_empresa text default 'e1') returns text language sql as $$
  select format('select public.fin_lancar(%L, %L, %s, %L, %L, %L, %s, %s, %L, null, false, %L::jsonb)::text',
    '00000000-0000-0000-0000-0000000000' || p_empresa, p_direcao, p_total, '00000000-0000-0000-0000-00000000' || p_caixa, p_situacao,
    coalesce(p_liquidacao, p_vencimento), coalesce(quote_literal(p_vencimento), 'null'), coalesce(quote_literal(p_liquidacao), 'null'),
    'Teste', p_rateios);
$$;
create or replace function pg_temp.r(p_conta text, p_valor numeric) returns text language sql as $$
  select json_build_object('conta_id', '00000000-0000-0000-0000-00000000' || p_conta, 'valor', p_valor)::text;
$$;
create or replace function pg_temp.saldo(p_caixa text, p_data text) returns text language sql as $$
  select format($f$select saldo::text from public.fin_saldos('00000000-0000-0000-0000-0000000000e1', %L) where conta_caixa_id = %L$f$,
                p_data, '00000000-0000-0000-0000-00000000' || p_caixa);
$$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
-- Plano de contas
('código duplicado na empresa', 'recusado:fin_contas_codigo_unico', null, pg_temp.conta('1.01', 'Outra', 'analitica', 'receita', 'receita_bruta', 'operacional', 1, 'f101'), null),
('mesmo código em outra empresa', 'aceito', null, pg_temp.conta('6.01', 'Aluguel B', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8, null, 'e2'), null),
('nome duplicado entre irmãs, sem diferenciar maiúsculas', 'recusado:fin_contas_nome_entre_irmas', null, pg_temp.conta('1.02', 'CONSULTAS ', 'analitica', 'receita', 'receita_bruta', 'operacional', 1, 'f101'), null),
('mesmo nome em ramo diferente', 'aceito', null, pg_temp.conta('6.09', 'Consultas', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8, 'f103'), null),
('nome duplicado na raiz', 'recusado:fin_contas_nome_entre_irmas', null, pg_temp.conta('2', 'receitas', 'grupo', null, null, null, null), null),
('ciclo direto (conta mãe de si)', 'recusado:fin_contas_sem_ciclo', null,
  $q$update public.fin_contas set conta_pai_id = id where id = '00000000-0000-0000-0000-00000000f103'$q$, null),
('ciclo indireto', 'recusado:fin_contas_sem_ciclo', null,
  $q$update public.fin_contas set conta_pai_id = '00000000-0000-0000-0000-00000000f101' where id = '00000000-0000-0000-0000-00000000f103'$q$,
  $q$update public.fin_contas set conta_pai_id = '00000000-0000-0000-0000-00000000f103' where id = '00000000-0000-0000-0000-00000000f101'$q$),
('conta dentro de uma analítica', 'recusado:fin_contas_pai_e_grupo', null, pg_temp.conta('1.01.01', 'Filha', 'analitica', 'receita', 'receita_bruta', 'operacional', 1, 'f102'), null),
('grupo com contas dentro vira analítica', 'recusado:fin_contas_analitica_sem_filhos', null,
  $q$update public.fin_contas set tipo = 'analitica', natureza = 'receita', classificacao = 'receita_bruta', comportamento_caixa = 'operacional' where id = '00000000-0000-0000-0000-00000000f101'$q$, null),
('grupo com classificação', 'recusado:fin_contas_grupo_sem_classificacao', null, pg_temp.conta('3', 'Tributos', 'grupo', 'despesa', 'tributo_sobre_faturamento', 'operacional', 3), null),
('analítica sem classificação', 'recusado:fin_contas_analitica_classificada', null, pg_temp.conta('6.08', 'Sem classe', 'analitica', 'despesa', null, 'operacional', 8, 'f103'), null),
('tipo fora da lista', 'recusado:fin_contas_tipo_valido', null, pg_temp.conta('6.08', 'X', 'sintetica', null, null, null, null), null),
('matriz: sócios com seção da DRE', 'recusado:fin_contas_coerencia', null, pg_temp.conta('9.10', 'Distribuição de lucros', 'analitica', 'patrimonio_liquido', 'socios', 'financiamento', 8), null),
('matriz: sócios fora da DRE', 'aceito', null, pg_temp.conta('9.10', 'Distribuição de lucros', 'analitica', 'patrimonio_liquido', 'socios', 'financiamento', null), null),
('matriz: transferência com caixa operacional', 'recusado:fin_contas_coerencia', null, pg_temp.conta('8.02', 'Transf', 'analitica', 'ativo', 'transferencia', 'operacional', null), null),
('matriz: receita bruta fora da DRE', 'recusado:fin_contas_coerencia', null, pg_temp.conta('1.02', 'Receita sem DRE', 'analitica', 'receita', 'receita_bruta', 'operacional', null, 'f101'), null),
('matriz: financiamento na DRE', 'recusado:fin_contas_coerencia', null, pg_temp.conta('9.03', 'Principal', 'analitica', 'passivo', 'financiamento', 'financiamento', 10), null),
('matriz: juros como financiamento na linha 10', 'aceito', null, pg_temp.conta('9.04', 'Juros 2', 'analitica', 'despesa', 'despesa_financeira', 'financiamento', 10), null),
('CMV fora de custo direto', 'recusado:fin_contas_cmv_so_custo', null, pg_temp.conta('6.07', 'Aluguel CMV', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8, 'f103', 'e1', true), null),
('CMV em custo direto', 'aceito', null, pg_temp.conta('4.01', 'Materiais', 'analitica', 'despesa', 'custo_direto_variavel', 'operacional', 5, null, 'e1', true), null),
('grupo em seção calculada (4. Receita líquida)', 'recusado:fin_contas_secao_recebe_contas', null, pg_temp.conta('4', 'Receita líquida', 'grupo', null, null, null, 4), null),
('conta já usada não muda a classificação (F5)', 'recusado:fin_contas_classificacao_imutavel', null,
  $q$update public.fin_contas set comportamento_caixa = 'sem_caixa' where id = '00000000-0000-0000-0000-00000000f104'$q$, null),
('conta já usada não muda de seção da DRE (F5)', 'recusado:fin_contas_classificacao_imutavel', null,
  $q$update public.fin_contas set dre_secao = 10, classificacao = 'despesa_financeira' where id = '00000000-0000-0000-0000-00000000f104'$q$, null),
('conta ainda não usada muda a classificação', 'aceito', null,
  $q$update public.fin_contas set comportamento_caixa = 'operacional' where id = '00000000-0000-0000-0000-00000000f105'$q$, null),
('conta usada renomeada e movida mantém o histórico (mesmo id)', '1', null,
  $q$select count(*)::text from public.fin_lancamento_rateios r join public.fin_contas c on c.id = r.conta_id where c.nome = 'Aluguel e condomínio' and c.conta_pai_id is null$q$,
  $q$update public.fin_contas set nome = 'Aluguel e condomínio', conta_pai_id = null where id = '00000000-0000-0000-0000-00000000f104'$q$),
('renomear conta fica auditado', 'Aluguel|Aluguel e condomínio', null,
  $q$select concat_ws('|', antes->>'nome', depois->>'nome') from public.fin_contas_eventos where conta_id = '00000000-0000-0000-0000-00000000f104' and acao = 'alterada'$q$,
  $q$update public.fin_contas set nome = 'Aluguel e condomínio' where id = '00000000-0000-0000-0000-00000000f104'$q$),
('criar conta fica auditado', '1', null,
  $q$select count(*)::text from public.fin_contas_eventos e join public.fin_contas c on c.id = e.conta_id where c.codigo = '6.05' and e.acao = 'criada'$q$,
  pg_temp.conta('6.05', 'Sistemas', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8, 'f103')),
('conta não muda de empresa', 'recusado:fin_contas_empresa_fixa', null,
  $q$update public.fin_contas set empresa_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-00000000f108'$q$, null),
('desativar conta usada', 'aceito', null, $q$update public.fin_contas set ativa = false where id = '00000000-0000-0000-0000-00000000f104'$q$, null),
-- Contas de caixa e saldo inicial (3.3)
('conta de caixa sem data do saldo inicial', 'recusado:nulo:data_saldo_inicial', null,
  $q$insert into public.fin_contas_caixa (empresa_id, nome, tipo, saldo_inicial) values ('00000000-0000-0000-0000-0000000000e1', 'Sem data', 'banco', 0)$q$, null),
('conta de caixa sem saldo inicial', 'recusado:nulo:saldo_inicial', null,
  $q$insert into public.fin_contas_caixa (empresa_id, nome, tipo, data_saldo_inicial) values ('00000000-0000-0000-0000-0000000000e1', 'Sem saldo', 'banco', '2026-09-01')$q$, null),
('conta de caixa com nome repetido', 'recusado:fin_contas_caixa_nome_unico', null,
  $q$insert into public.fin_contas_caixa (empresa_id, nome, tipo, saldo_inicial, data_saldo_inicial) values ('00000000-0000-0000-0000-0000000000e1', 'banco a', 'banco', 0, '2026-09-01')$q$, null),
('data do saldo inicial passa de um movimento já feito', 'recusado:fin_contas_caixa_data_antes_de_movimento', null,
  $q$update public.fin_contas_caixa set data_saldo_inicial = '2026-09-12' where id = '00000000-0000-0000-0000-00000000c101'$q$, null),
-- Lançamentos e rateio (V7)
('lançamento com rateio exato', 'sim', null,
  'select case when (' || substr(pg_temp.lancar('saida', '1000', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f106', 800) || ',' || pg_temp.r('f107', 200) || ']'), 8) || ') is not null then ''sim'' end', null),
('rateio que não fecha o total (800 + 150 ≠ 1.000)', 'recusado:fin_rateios_soma_exata', null,
  pg_temp.lancar('saida', '1000', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f106', 800) || ',' || pg_temp.r('f107', 150) || ']'), null),
('rateio que passa do total', 'recusado:fin_rateios_soma_exata', null,
  pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f104', 100.01) || ']'), null),
('lançamento sem rateio', 'recusado:fin_rateios_soma_exata', null, pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[]'), null),
('lançamento gravado direto, sem rateio', 'recusado:fin_rateios_soma_exata', null,
  $q$insert into public.fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao)
     values ('00000000-0000-0000-0000-0000000000e1', 'saida', 50, '00000000-0000-0000-0000-00000000c101', '2026-09-28', '2026-09-28', 'realizado', 'Sem rateio')$q$, null),
('valor zero', 'recusado:fin_lancamentos_valor_positivo', null, pg_temp.lancar('saida', '0', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f104', 0) || ']'), null),
('valor negativo', 'recusado:fin_lancamentos_valor_positivo', null, pg_temp.lancar('saida', '-10', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f104', -10) || ']'), null),
('linha de rateio negativa compensada por outra', 'recusado:fin_rateios_valor_positivo', null,
  pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f104', 150) || ',' || pg_temp.r('f107', -50) || ']'), null),
('direção obrigatória', 'recusado:nulo:direcao', null, replace(pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f104', 100) || ']'), '''saida''', 'null'), null),
('direção fora da lista', 'recusado:fin_lancamentos_direcao_valida', null, pg_temp.lancar('saque', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f104', 100) || ']'), null),
('realizado sem data de liquidação', 'recusado:fin_lancamentos_realizado_liquidado', null,
  pg_temp.lancar('saida', '100', 'realizado', null, '2026-09-28', '[' || pg_temp.r('f104', 100) || ']'), null),
('previsto sem vencimento', 'recusado:fin_lancamentos_previsto_vencimento', null,
  pg_temp.lancar('saida', '100', 'previsto', '2026-09-28', null, '[' || pg_temp.r('f104', 100) || ']'), null),
('realizado antes do saldo inicial (V8)', 'recusado:fin_lancamentos_antes_do_saldo_inicial', null,
  pg_temp.lancar('saida', '100', 'realizado', '2026-08-31', null, '[' || pg_temp.r('f104', 100) || ']'), null),
('realizado no próprio dia do saldo inicial', 'aceito', null,
  'select ''aceito'' from (' || pg_temp.lancar('saida', '100', 'realizado', '2026-09-01', null, '[' || pg_temp.r('f104', 100) || ']') || ') x', null),
('previsto com vencimento antes do saldo inicial', 'aceito', null,
  'select ''aceito'' from (' || pg_temp.lancar('saida', '100', 'previsto', null, '2026-08-20', '[' || pg_temp.r('f104', 100) || ']') || ') x', null),
('liquidar previsto antes do saldo inicial (V8)', 'recusado:fin_lancamentos_antes_do_saldo_inicial', null,
  $q$update public.fin_lancamentos set situacao = 'realizado', data_liquidacao = '2026-08-31' where id = '00000000-0000-0000-0000-00000000a103'$q$, null),
('rateio em grupo', 'recusado:fin_rateios_conta_analitica', null, pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f103', 100) || ']'), null),
('rateio em conta inativa', 'recusado:fin_rateios_conta_ativa', null, pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f10a', 100) || ']'), null),
('rateio em conta sem caixa (depreciação)', 'recusado:fin_rateios_conta_movimenta_caixa', null, pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f105', 100) || ']'), null),
('rateio em conta de transferência interna', 'recusado:fin_rateios_conta_movimenta_caixa', null, pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f109', 100) || ']'), null),
('lançamento da empresa A com conta da empresa B', 'recusado:fin_rateios_conta', null, pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f201', 100) || ']'), null),
('lançamento da empresa A com caixa da empresa B', 'recusado:fin_lancamentos_conta_caixa', null,
  pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f102', 100) || ']', 'c201'), null),
('caixa inativa', 'recusado:fin_lancamentos_caixa_ativa', null,
  pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f102', 100) || ']', 'c103'), null),
('lançamento novo cancelado', 'recusado:fin_lancamentos_transicao', null,
  $q$insert into public.fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao, cancelado_em)
     values ('00000000-0000-0000-0000-0000000000e1', 'saida', 50, '00000000-0000-0000-0000-00000000c101', '2026-09-28', '2026-09-28', 'cancelado', 'X', now())$q$, null),
('origem duplicada', 'recusado:fin_lancamentos_origem_unica', null,
  $q$insert into public.fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao, origem_tipo, origem_id)
     values ('00000000-0000-0000-0000-0000000000e1', 'saida', 50, '00000000-0000-0000-0000-00000000c101', '2026-09-28', '2026-09-28', 'realizado', 'Parcela', 'parcela', '00000000-0000-0000-0000-000000000099')$q$,
  $q$insert into public.fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao, origem_tipo, origem_id)
     values ('00000000-0000-0000-0000-0000000000e1', 'saida', 50, '00000000-0000-0000-0000-00000000c101', '2026-09-28', '2026-09-28', 'realizado', 'Parcela', 'parcela', '00000000-0000-0000-0000-000000000099')$q$),
('realizado não volta a previsto', 'recusado:fin_lancamentos_transicao', null,
  $q$update public.fin_lancamentos set situacao = 'previsto', data_liquidacao = null, data_vencimento = '2026-09-10' where id = '00000000-0000-0000-0000-00000000a101'$q$, null),
('valor do lançamento não muda', 'recusado:fin_lancamentos_campos_fixos', null,
  $q$update public.fin_lancamentos set valor_total = 3100 where id = '00000000-0000-0000-0000-00000000a101'$q$, null),
('liquidação de realizado não muda', 'recusado:fin_lancamentos_liquidacao_fixa', null,
  $q$update public.fin_lancamentos set data_liquidacao = '2026-09-11' where id = '00000000-0000-0000-0000-00000000a101'$q$, null),
('rateio não muda depois de gravado', 'recusado:fin_rateios_fixos', null,
  $q$update public.fin_lancamento_rateios set valor = 2999 where lancamento_id = '00000000-0000-0000-0000-00000000a101'$q$, null),
('cancelar lançamento realizado', 'aceito', null,
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000a101'$q$, null),
('cancelado sem data de cancelamento', 'recusado:fin_lancamentos_cancelado_data', null,
  $q$update public.fin_lancamentos set situacao = 'cancelado' where id = '00000000-0000-0000-0000-00000000a101'$q$, null),
('lançamento cancelado não muda', 'recusado:fin_lancamentos_cancelado_final', null,
  $q$update public.fin_lancamentos set descricao = 'Outra' where id = '00000000-0000-0000-0000-00000000a101'$q$,
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000a101'$q$),
('corrigir a descrição de um realizado', 'aceito', null,
  $q$update public.fin_lancamentos set descricao = 'Consultas de setembro (corrigido)', documento = 'NF 12' where id = '00000000-0000-0000-0000-00000000a101'$q$, null),
-- Saldos a partir da data inicial (3.3)
('saldo do Banco A em 30/09 = 10.000 + 3.000 − 1.000 − 5.000 transferidos', '7000.00', null, pg_temp.saldo('c101', '2026-09-30'), null),
('saldo do Banco A2 em 30/09 = 5.000 recebidos', '5000.00', null, pg_temp.saldo('c102', '2026-09-30'), null),
('saldo total da empresa em 30/09: a transferência não muda', '12000.00', null,
  $q$select sum(saldo)::text from public.fin_saldos('00000000-0000-0000-0000-0000000000e1', '2026-09-30')$q$, null),
('saldo antes da data inicial fica vazio', 'nulo', null, pg_temp.saldo('c101', '2026-08-31'), null),
('previsto não altera o saldo; recebimento de 03/10 sim', '9000.00', null, pg_temp.saldo('c101', '2026-10-31'), null),
('liquidar o previsto em 05/10 baixa o saldo', '8000.00', null, pg_temp.saldo('c101', '2026-10-31'),
  $q$update public.fin_lancamentos set situacao = 'realizado', data_liquidacao = '2026-10-05' where id = '00000000-0000-0000-0000-00000000a103'$q$),
('lançamento cancelado sai do saldo', '4000.00', null, pg_temp.saldo('c101', '2026-09-30'),
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000a101'$q$),
-- Transferências
('transferência cancelada sai do saldo', '12000.00', null, pg_temp.saldo('c101', '2026-09-30'),
  $q$update public.fin_transferencias set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000d101'$q$),
('transferência para a mesma conta', 'recusado:fin_transferencias_contas_diferentes', null,
  $q$insert into public.fin_transferencias (empresa_id, conta_origem_id, conta_destino_id, valor, data) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c101', 10, '2026-09-21')$q$, null),
('transferência para conta de outra empresa', 'recusado:fin_transferencias_destino', null,
  $q$insert into public.fin_transferencias (empresa_id, conta_origem_id, conta_destino_id, valor, data) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c201', 10, '2026-09-21')$q$, null),
('transferência antes do saldo inicial', 'recusado:fin_transferencias_antes_do_saldo_inicial', null,
  $q$insert into public.fin_transferencias (empresa_id, conta_origem_id, conta_destino_id, valor, data) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c102', 10, '2026-08-21')$q$, null),
('transferência de valor zero', 'recusado:fin_transferencias_valor_positivo', null,
  $q$insert into public.fin_transferencias (empresa_id, conta_origem_id, conta_destino_id, valor, data) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c102', 0, '2026-09-21')$q$, null),
('transferência com conta inativa', 'recusado:fin_transferencias_caixa_ativa', null,
  $q$insert into public.fin_transferencias (empresa_id, conta_origem_id, conta_destino_id, valor, data) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c103', 10, '2026-09-21')$q$, null),
('valor da transferência não muda', 'recusado:fin_transferencias_campos_fixos', null,
  $q$update public.fin_transferencias set valor = 4000 where id = '00000000-0000-0000-0000-00000000d101'$q$, null),
-- Fluxo de caixa (3.2)
('fluxo realizado de setembro: entradas e saídas sem a transferência', '3000.00|1000.00', null,
  $q$select concat_ws('|', sum(entradas), sum(saidas)) from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-09-30', 'realizado')$q$, null),
('competência de setembro recebida em outubro entra no caixa de outubro', '2026-10-01|2000.00', null,
  $q$select concat_ws('|', mes, entradas) from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-10-01', '2026-10-31', 'realizado') where conta_id = '00000000-0000-0000-0000-00000000f102'$q$, null),
('fluxo previsto de outubro pelo vencimento, com o rateio da parcela', '9.01:800.00|9.02:200.00', null,
  $q$select string_agg(c.codigo || ':' || f.saidas, '|' order by c.codigo) from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-10-01', '2026-10-31', 'previsto') f join public.fin_contas c on c.id = f.conta_id$q$, null),
('fluxo realizado não inclui previstos', '0', null,
  $q$select count(*)::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-10-01', '2026-10-31', 'realizado') where conta_id = '00000000-0000-0000-0000-00000000f106'$q$, null),
('fluxo por mês em dois meses', '2026-09-01:3000.00|2026-10-01:2000.00', null,
  $q$select string_agg(mes || ':' || entradas, '|' order by mes) from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-10-31', 'realizado') where conta_id = '00000000-0000-0000-0000-00000000f102'$q$, null),
('fluxo da empresa A não soma nada da B', '3000.00', null,
  $q$select sum(entradas)::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-09-30', 'realizado')$q$, null),
('fluxo realizado bate com a variação dos saldos menos transferências (set)', 'sim', null,
  $q$select case when (select sum(entradas) - sum(saidas) from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-09-30', 'realizado'))
                    = (select sum(saldo) from public.fin_saldos('00000000-0000-0000-0000-0000000000e1', '2026-09-30')) - (select sum(saldo_inicial) from public.fin_contas_caixa where empresa_id = '00000000-0000-0000-0000-0000000000e1')
             then 'sim' else 'não' end$q$, null),
('cancelado sai do fluxo', '0', null,
  $q$select coalesce(sum(entradas), 0)::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-09-30', 'realizado')$q$,
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000a101'$q$),
-- Acesso (seção 5, F1 e F2)
('equipe lê as contas das duas empresas', '11', 'equipe', $q$select count(*)::text from public.fin_contas$q$, null),
('equipe lança pelo acesso normal', 'sim', 'equipe',
  'select case when (' || substr(pg_temp.lancar('saida', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f104', 100) || ']'), 8) || ') is not null then ''sim'' end', null),
('equipe grava na empresa B', 'aceito', 'equipe', pg_temp.conta('6.01', 'Aluguel B', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8, null, 'e2'), null),
('equipe lê o saldo', '7000.00', 'equipe', pg_temp.saldo('c101', '2026-09-30'), null),
('cliente com central da A não lê contas', '0', 'cliente_a', $q$select count(*)::text from public.fin_contas$q$, null),
('cliente com central da A não lê contas de caixa', '0', 'cliente_a', $q$select count(*)::text from public.fin_contas_caixa$q$, null),
('cliente com central da A não lê lançamentos', '0', 'cliente_a', $q$select count(*)::text from public.fin_lancamentos$q$, null),
('cliente com central da A não lê rateios', '0', 'cliente_a', $q$select count(*)::text from public.fin_lancamento_rateios$q$, null),
('cliente com central da A não lê transferências', '0', 'cliente_a', $q$select count(*)::text from public.fin_transferencias$q$, null),
('cliente com central da A não lê a auditoria', '0', 'cliente_a', $q$select count(*)::text from public.fin_contas_eventos$q$, null),
('cliente com central da A não lê as seções da DRE', '0', 'cliente_a', $q$select count(*)::text from public.fin_dre_secoes$q$, null),
('cliente com central da A: saldos vazios', '0', 'cliente_a', $q$select count(*)::text from public.fin_saldos('00000000-0000-0000-0000-0000000000e1', '2026-09-30')$q$, null),
('cliente com central da A: fluxo vazio', '0', 'cliente_a', $q$select count(*)::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-09-30', 'realizado')$q$, null),
('cliente com central da A não cria conta', 'sem_permissao', 'cliente_a', pg_temp.conta('6.06', 'Invasão', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8), null),
('cliente com central da A não lança', 'sem_permissao', 'cliente_a', pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f102', 100) || ']'), null),
('cliente com central da A não cria conta de caixa', 'sem_permissao', 'cliente_a',
  $q$insert into public.fin_contas_caixa (empresa_id, nome, tipo, saldo_inicial, data_saldo_inicial) values ('00000000-0000-0000-0000-0000000000e1', 'Invasão', 'banco', 0, '2026-09-01')$q$, null),
('cliente com central da A não transfere', 'sem_permissao', 'cliente_a',
  $q$insert into public.fin_transferencias (empresa_id, conta_origem_id, conta_destino_id, valor, data) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c102', 10, '2026-09-21')$q$, null),
('cliente com central da A não altera lançamento', '0', 'cliente_a',
  $q$with u as (update public.fin_lancamentos set descricao = 'x' returning 1) select count(*)::text from u$q$, null),
('cliente com central da A não altera conta', '0', 'cliente_a',
  $q$with u as (update public.fin_contas set nome = nome || ' x' returning 1) select count(*)::text from u$q$, null),
('cliente sem acesso não lê lançamentos', '0', 'cliente_b', $q$select count(*)::text from public.fin_lancamentos$q$, null),
('cliente sem acesso não lança', 'sem_permissao', 'cliente_b', pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f102', 100) || ']'), null),
('sem login (anon) não lê contas', '0', 'anon', $q$select count(*)::text from public.fin_contas$q$, null),
('sem login (anon) não executa fin_saldos', 'sem_permissao', 'anon', $q$select count(*)::text from public.fin_saldos('00000000-0000-0000-0000-0000000000e1', '2026-09-30')$q$, null),
('sem login (anon) não executa fin_lancar', 'sem_permissao', 'anon', pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f102', 100) || ']'), null),
('nenhuma função central_* lê tabelas fin_ (F2)', '0', null,
  $q$select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname like 'central%' and prosrc ilike '%fin\_%'$q$, null);

create or replace function pg_temp.rodar() returns jsonb language plpgsql as $$
declare v_res jsonb := '[]'; c record; v text;
begin
  begin
    perform pg_temp.apoio();
    for c in select * from _casos order by n loop
      v := pg_temp.executar(c.pessoa, c.sql, c.antes);
      v_res := v_res || jsonb_build_object('n', c.n, 'caso', c.caso, 'esperado', c.esperado, 'obtido', v, 'ok', v = c.esperado);
    end loop;
    raise exception using errcode = 'P0001', message = '__desfazer__'; -- desfaz os dados de apoio
  exception when raise_exception then
    if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  return v_res;
end;
$$;

select jsonb_build_object('passaram', count(*) filter (where (e ->> 'ok')::boolean), 'total', count(*),
  'falhas', coalesce(jsonb_agg(e) filter (where not (e ->> 'ok')::boolean), '[]'), 'casos', jsonb_agg(e))
from jsonb_array_elements(pg_temp.rodar()) e;
