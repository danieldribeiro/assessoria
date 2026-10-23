-- Testes da 0011 (cartões e faturas). Usa os dados de apoio e os atalhos dos testes da 0010, mais quatro cartões.
-- Os casos da 0007 a 0010 continuam valendo com a 0011 aplicada: rodar.sh roda os três arquivos.
-- Roda no Postgres local (rodar.sh) e no projeto Supabase axis-testes, com as pessoas e empresas fictícias.
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

-- Dados de apoio da 0008 (contas, caixas, lançamentos, transferência), mais fornecedores e um extrato.
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
  insert into public.fin_contrapartes (id, empresa_id, nome, tipo, documento, ativa) values
    ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-0000000000e1', 'Dental Cremer', 'fornecedor', '12345678000190', true),
    ('00000000-0000-0000-0000-00000000cc02', '00000000-0000-0000-0000-0000000000e1', 'Fornecedor antigo', 'fornecedor', null, false),
    ('00000000-0000-0000-0000-00000000cc03', '00000000-0000-0000-0000-0000000000e2', 'Fornecedor da B', 'fornecedor', null, true);
  insert into public.fin_lancamentos (id, empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao) values
    ('00000000-0000-0000-0000-00000000a105', '00000000-0000-0000-0000-0000000000e1', 'saida', 1000, '00000000-0000-0000-0000-00000000c102', '2026-09-15', '2026-09-15', 'realizado', 'Aluguel pago pelo Banco A2'),
    ('00000000-0000-0000-0000-00000000a106', '00000000-0000-0000-0000-0000000000e1', 'saida', 1000, '00000000-0000-0000-0000-00000000c101', '2026-09-16', '2026-09-16', 'realizado', 'Outro aluguel');
  insert into public.fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor) values
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a105', '00000000-0000-0000-0000-00000000f104', 1000),
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a106', '00000000-0000-0000-0000-00000000f104', 1000);
  insert into public.fin_extratos (id, empresa_id, conta_caixa_id, arquivo_nome, arquivo_sha256) values
    ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c101', 'banco-a.ofx', repeat('a', 64)),
    ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c102', 'banco-a2.ofx', repeat('b', 64));
  insert into public.fin_extrato_movimentos (id, empresa_id, extrato_id, conta_caixa_id, data, valor, descricao, chave) values
    ('00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c101', '2026-09-15', -1000, 'PIX ALUGUEL', 'fitid:1'),
    ('00000000-0000-0000-0000-00000000dd02', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c101', '2026-10-03', 2000, 'TED RECEBIDA', 'fitid:2'),
    ('00000000-0000-0000-0000-00000000dd03', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c101', '2026-10-05', -1000, 'PARCELA EMPRESTIMO', 'fitid:3'),
    ('00000000-0000-0000-0000-00000000dd04', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-00000000c102', '2026-09-20', 5000, 'TRANSF RECEBIDA', 'fitid:4'),
    ('00000000-0000-0000-0000-00000000dd05', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c101', '2026-10-10', -500, 'COMPRA DENTAL CREMER', 'fitid:5'),
    ('00000000-0000-0000-0000-00000000dd06', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c101', '2026-09-20', -5000, 'TRANSF ENVIADA', 'fitid:6'),
    ('00000000-0000-0000-0000-00000000dd07', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c101', '2026-09-16', -1000, 'PIX ALUGUEL 2', 'fitid:7');
$$;

-- Atalhos.
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
-- fin_editar_lancamento na empresa A, com o rateio dado como pares (conta, valor).
create or replace function pg_temp.editar(p_id text, p_direcao text, p_total text, p_situacao text, p_liquidacao text, p_vencimento text,
                                          p_rateios text, p_caixa text default 'c101', p_competencia text default '2026-09-10') returns text language sql as $$
  select format('select public.fin_editar_lancamento(%L, %L, %s, %L, %L, %L, %s, %s, %L, null, false, %L::jsonb)::text',
    '00000000-0000-0000-0000-00000000' || p_id, p_direcao, p_total, '00000000-0000-0000-0000-00000000' || p_caixa, p_situacao,
    p_competencia, coalesce(quote_literal(p_vencimento), 'null'), coalesce(quote_literal(p_liquidacao), 'null'), 'Editado', p_rateios);
$$;
create or replace function pg_temp.saldo(p_caixa text, p_data text) returns text language sql as $$
  select format($f$select saldo::text from public.fin_saldos('00000000-0000-0000-0000-0000000000e1', %L) where conta_caixa_id = %L$f$,
                p_data, '00000000-0000-0000-0000-00000000' || p_caixa);
$$;
create or replace function pg_temp.id(p text) returns text language sql as $$ select '00000000-0000-0000-0000-00000000' || p $$;
-- fin_lancar com os parâmetros novos da 0009.
create or replace function pg_temp.lancar9(p_contraparte text, p_observacoes text, p_empresa text default 'e1', p_caixa text default 'c101', p_conta text default 'f104') returns text language sql as $$
  select format('select public.fin_lancar(%L, %L, 100, %L, %L, %L, null, %L, %L, null, false, %L::jsonb, %s, %s)::text',
    '00000000-0000-0000-0000-0000000000' || p_empresa, 'saida', pg_temp.id(p_caixa), 'realizado', '2026-09-20', '2026-09-20', 'Compra',
    '[' || pg_temp.r(p_conta, 100) || ']', coalesce(quote_literal(pg_temp.id(p_contraparte)), 'null'), coalesce(quote_literal(p_observacoes), 'null'));
$$;
create or replace function pg_temp.editar9(p_id text, p_contraparte text, p_observacoes text) returns text language sql as $$
  select format('select public.fin_editar_lancamento(%L, %L, 1000, %L, %L, %L, null, %L, %L, null, false, %L::jsonb, %s, %s)::text',
    pg_temp.id(p_id), 'saida', pg_temp.id('c101'), 'realizado', '2026-09-15', '2026-09-15', 'Aluguel de setembro',
    '[' || pg_temp.r('f104', 1000) || ']', coalesce(quote_literal(pg_temp.id(p_contraparte)), 'null'), coalesce(quote_literal(p_observacoes), 'null'));
$$;
create or replace function pg_temp.mov(p_data text, p_valor numeric, p_chave text, p_descricao text default 'MOV') returns text language sql as $$
  select json_build_object('data', p_data, 'valor', p_valor, 'tipo_ofx', case when p_valor > 0 then 'CREDIT' else 'DEBIT' end,
                           'descricao', p_descricao, 'fitid', null, 'documento', null, 'chave', p_chave)::text;
$$;
-- fin_importar_extrato no Banco A (ou outra conta), devolvendo "novas/duplicadas".
create or replace function pg_temp.importar(p_movs text, p_caixa text default 'c101', p_sha text default null) returns text language sql as $$
  select format($f$select (r ->> 'novas') || '/' || (r ->> 'duplicadas') from public.fin_importar_extrato(%L, %L, 'extrato.ofx', %L, '077', '0001', '12345', '2026-09-01', '2026-10-31', 1234.56, '2026-10-31', %s, 0, %L::jsonb) r$f$,
    '00000000-0000-0000-0000-0000000000e1', pg_temp.id(p_caixa), coalesce(p_sha, repeat('c', 64)),
    (select count(*) from json_array_elements(p_movs::json)), p_movs);
$$;
create or replace function pg_temp.conciliar(p_mov text, p_lanc text) returns text language sql as $$
  select format('select public.fin_conciliar(%L, %L)::text', pg_temp.id(p_mov), pg_temp.id(p_lanc));
$$;
create or replace function pg_temp.do_extrato(p_mov text, p_rateios text) returns text language sql as $$
  select format('select public.fin_lancar_do_extrato(%L, null, null, null, false, %L::jsonb, %L, %L)::text',
    pg_temp.id(p_mov), p_rateios, pg_temp.id('cc01'), 'Nota 123');
$$;
create or replace function pg_temp.mov_transf(p_mov text) returns text language sql as $$
  select format('update public.fin_extrato_movimentos set situacao = %L, transferencia_id = %L where id = %L',
    'conciliado', pg_temp.id('d101'), pg_temp.id(p_mov));
$$;


-- Cartões fictícios: ca01 fecha dia 25 e vence dia 5 (Banco A); ca02 fecha dia 3 e vence dia 10 (Banco A2);
-- ca03 inativo; ca04 fecha dia 31 e vence dia 10 (Banco A); cb01 da empresa B.
create or replace function pg_temp.apoio_cartoes() returns void language sql as $$
  select pg_temp.apoio();
  insert into public.fin_cartoes (id, empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento, ativo) values
    ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000e1', 'Visa empresa', '00000000-0000-0000-0000-00000000c101', 25, 5, true),
    ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-0000000000e1', 'Master', '00000000-0000-0000-0000-00000000c102', 3, 10, true),
    ('00000000-0000-0000-0000-00000000ca03', '00000000-0000-0000-0000-0000000000e1', 'Cartão antigo', '00000000-0000-0000-0000-00000000c101', 10, 20, false),
    ('00000000-0000-0000-0000-00000000ca04', '00000000-0000-0000-0000-0000000000e1', 'Elo', '00000000-0000-0000-0000-00000000c101', 31, 10, true),
    ('00000000-0000-0000-0000-00000000cb01', '00000000-0000-0000-0000-0000000000e2', 'Cartão da B', '00000000-0000-0000-0000-00000000c201', 25, 5, true);
$$;

-- Compra no cartão (descrição "Compra"), com o rateio dado como pares (conta, valor).
create or replace function pg_temp.compra(p_cartao text, p_total numeric, p_data text, p_rateios text, p_parcelas int default 1,
                                          p_primeira text default null, p_direcao text default 'saida') returns text language sql as $$
  select format('select public.fin_lancar_no_cartao(%L, %L, %s, %L, %s, %s, %L, null, %L::jsonb)::text',
    pg_temp.id(p_cartao), p_direcao, p_total, p_data, p_parcelas, coalesce(quote_literal(p_primeira), 'null'), 'Compra', p_rateios);
$$;
-- A fatura do cartão no mês de vencimento dado, como subconsulta.
create or replace function pg_temp.fat(p_cartao text, p_ref text) returns text language sql as $$
  select format('(select id from public.fin_faturas where cartao_id = %L and referencia = %L)', pg_temp.id(p_cartao), p_ref);
$$;
create or replace function pg_temp.pagar(p_cartao text, p_ref text, p_data text) returns text language sql as $$
  select format('select public.fin_pagar_fatura(%s, %L)::text', pg_temp.fat(p_cartao, p_ref), p_data);
$$;
create or replace function pg_temp.compra600() returns text language sql as $$
  select pg_temp.compra('ca01', 600, '2026-09-10', '[' || pg_temp.r('f104', 600) || ']');
$$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
-- Fatura certa para a data da compra
('compra antes do fechamento: fatura que vence no mês seguinte', '2026-10-01|2026-09-25|2026-10-05', 'equipe',
  $q$select referencia || '|' || data_fechamento || '|' || data_vencimento from public.fin_faturas where cartao_id = '00000000-0000-0000-0000-00000000ca01'$q$,
  pg_temp.compra600()),
('compra no dia do fechamento vai para a fatura seguinte', '2026-11-01', 'equipe',
  $q$select referencia::text from public.fin_faturas where cartao_id = '00000000-0000-0000-0000-00000000ca01'$q$,
  pg_temp.compra('ca01', 50, '2026-09-25', '[' || pg_temp.r('f104', 50) || ']')),
('vencimento depois do fechamento: vence no mesmo mês', '2026-10-01|2026-10-03|2026-10-10', 'equipe',
  $q$select referencia || '|' || data_fechamento || '|' || data_vencimento from public.fin_faturas where cartao_id = '00000000-0000-0000-0000-00000000ca02'$q$,
  pg_temp.compra('ca02', 50, '2026-10-02', '[' || pg_temp.r('f104', 50) || ']')),
('fechamento no dia 31 em mês de 30 dias', '2026-10-01|2026-09-30|2026-10-10', 'equipe',
  $q$select referencia || '|' || data_fechamento || '|' || data_vencimento from public.fin_faturas where cartao_id = '00000000-0000-0000-0000-00000000ca04'$q$,
  pg_temp.compra('ca04', 50, '2026-09-15', '[' || pg_temp.r('f104', 50) || ']')),
('primeira fatura escolhida na mão', '2026-11-01', 'equipe',
  $q$select referencia::text from public.fin_faturas where cartao_id = '00000000-0000-0000-0000-00000000ca01'$q$,
  pg_temp.compra('ca01', 50, '2026-09-10', '[' || pg_temp.r('f104', 50) || ']', 1, '2026-11-15')),
('equipe lança compra no cartão', 'aceito', 'equipe', 'select ''aceito'' from (' || pg_temp.compra600() || ') x', null),

-- A compra
('compra fica prevista, no vencimento da fatura, na conta do cartão, com a competência da compra',
  'previsto|2026-10-05|00000000-0000-0000-0000-00000000c101|2026-09-10|Compra', 'equipe',
  $q$select situacao || '|' || data_vencimento || '|' || conta_caixa_id || '|' || data_competencia || '|' || descricao from public.fin_lancamentos where fatura_id is not null$q$,
  pg_temp.compra600()),
('parcelada em 3: uma parcela por fatura, centavos na primeira', '333.34@2026-10-01,333.33@2026-11-01,333.33@2026-12-01', 'equipe',
  $q$select string_agg(l.valor_total || '@' || f.referencia, ',' order by l.parcela) from public.fin_lancamentos l join public.fin_faturas f on f.id = l.fatura_id$q$,
  pg_temp.compra('ca01', 1000, '2026-09-10', '[' || pg_temp.r('f104', 700) || ',' || pg_temp.r('f108', 300) || ']', 3)),
('parcelas com descrição numerada e a competência da compra', 'Compra (1/3)|Compra (2/3)|Compra (3/3)|2026-09-10', 'equipe',
  $q$select string_agg(descricao, '|' order by parcela) || '|' || max(data_competencia) from public.fin_lancamentos where compra_id is not null$q$,
  pg_temp.compra('ca01', 1000, '2026-09-10', '[' || pg_temp.r('f104', 700) || ',' || pg_temp.r('f108', 300) || ']', 3)),
('rateio proporcional em cada parcela', '233.34+100.00|233.33+100.00|233.33+100.00', 'equipe',
  $q$select string_agg(x, '|' order by p) from (select l.parcela p, string_agg(r.valor::text, '+' order by r.valor desc) x
     from public.fin_lancamentos l join public.fin_lancamento_rateios r on r.lancamento_id = l.id where l.compra_id is not null group by l.parcela) t$q$,
  pg_temp.compra('ca01', 1000, '2026-09-10', '[' || pg_temp.r('f104', 700) || ',' || pg_temp.r('f108', 300) || ']', 3)),
('as parcelas somam a compra', '1000.00', 'equipe', $q$select sum(valor_total)::text from public.fin_lancamentos where compra_id is not null$q$,
  pg_temp.compra('ca01', 1000, '2026-09-10', '[' || pg_temp.r('f104', 700) || ',' || pg_temp.r('f108', 300) || ']', 3)),
('rateio que não soma a compra', 'recusado:fin_rateios_soma_exata', 'equipe', pg_temp.compra('ca01', 600, '2026-09-10', '[' || pg_temp.r('f104', 500) || ']'), null),
('zero parcelas', 'recusado:fin_lancamentos_parcela_valida', 'equipe', pg_temp.compra('ca01', 600, '2026-09-10', '[' || pg_temp.r('f104', 600) || ']', 0), null),
('cartão inativo não recebe compra', 'recusado:fin_cartoes_ativo', 'equipe', pg_temp.compra('ca03', 600, '2026-09-10', '[' || pg_temp.r('f104', 600) || ']'), null),
('conta sem caixa (depreciação) não entra em compra', 'recusado:fin_rateios_conta_movimenta_caixa', 'equipe',
  pg_temp.compra('ca01', 600, '2026-09-10', '[' || pg_temp.r('f105', 600) || ']'), null),

-- Antes de pagar
('fluxo previsto: a compra aparece no vencimento da fatura', '600.00', 'equipe',
  $q$select saidas::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-10-01', '2026-10-31', 'previsto') where conta_id = '00000000-0000-0000-0000-00000000f104'$q$,
  pg_temp.compra600()),
('fluxo realizado: nada antes de pagar', '0', 'equipe',
  $q$select count(*)::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-10-31', 'realizado') where conta_id = '00000000-0000-0000-0000-00000000f104' and saidas = 600$q$,
  pg_temp.compra600()),
('saldo do banco não muda com a compra', '8000.00', 'equipe', pg_temp.saldo('c101', '2026-10-31'), pg_temp.compra600()),
('liquidar a compra sozinha', 'recusado:fin_faturas_compras_abertas', 'equipe',
  $q$update public.fin_lancamentos set situacao = 'realizado', data_liquidacao = '2026-10-01' where fatura_id is not null$q$, pg_temp.compra600()),
('mudar o vencimento só da compra', 'recusado:fin_faturas_compras_abertas', 'equipe',
  $q$update public.fin_lancamentos set data_vencimento = '2026-10-20' where fatura_id is not null$q$, pg_temp.compra600()),
('trocar a conta de caixa da compra', 'recusado:fin_faturas_mesma_caixa', 'equipe',
  $q$update public.fin_lancamentos set conta_caixa_id = '00000000-0000-0000-0000-00000000c102' where fatura_id is not null$q$, pg_temp.compra600()),
('cancelar compra de fatura aberta', 'aceito', 'equipe',
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where fatura_id is not null$q$, pg_temp.compra600()),
('ajustar o vencimento da fatura leva as compras junto', '2026-10-06', 'equipe',
  $q$select data_vencimento::text from public.fin_lancamentos where fatura_id is not null$q$,
  pg_temp.compra600() || '; select public.fin_ajustar_fatura(' || pg_temp.fat('ca01', '2026-10-01') || ', ''2026-09-25'', ''2026-10-06'')'),

-- Pagar a fatura
('pagar: compras realizadas na data do pagamento, fatura paga pelo total', 'realizado|2026-10-05|paga|600.00', 'equipe',
  $q$select l.situacao || '|' || l.data_liquidacao || '|' || f.situacao || '|' || f.valor_pago from public.fin_lancamentos l join public.fin_faturas f on f.id = l.fatura_id$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('pagar devolve o total', '600.00', 'equipe', pg_temp.pagar('ca01', '2026-10-01', '2026-10-05'), pg_temp.compra600()),
('pagar não muda a competência (o resultado fica no mês da compra)', '2026-09-10', 'equipe',
  $q$select data_competencia::text from public.fin_lancamentos where fatura_id is not null$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('fluxo realizado: a saída aparece na data do pagamento, na categoria da compra', '600.00', 'equipe',
  $q$select saidas::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-10-01', '2026-10-31', 'realizado') where conta_id = '00000000-0000-0000-0000-00000000f104'$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('fatura com duas categorias: o fluxo separa cada uma', '400.00|600.00', 'equipe',
  $q$select (select saidas::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-10-01', '2026-10-31', 'realizado') where conta_id = '00000000-0000-0000-0000-00000000f108')
     || '|' || (select saidas::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-10-01', '2026-10-31', 'realizado') where conta_id = '00000000-0000-0000-0000-00000000f104')$q$,
  pg_temp.compra600() || '; ' || pg_temp.compra('ca01', 400, '2026-09-12', '[' || pg_temp.r('f108', 400) || ']') || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('saldo do banco cai uma vez, pelo total', '7400.00', 'equipe', pg_temp.saldo('c101', '2026-10-31'),
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('estorno na fatura reduz o valor pago', '500.00', 'equipe', $q$select valor_pago::text from public.fin_faturas where situacao = 'paga'$q$,
  pg_temp.compra600() || '; ' || pg_temp.compra('ca01', 100, '2026-09-15', '[' || pg_temp.r('f104', 100) || ']', 1, null, 'entrada') || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('compra cancelada não entra no pagamento', '600.00|cancelado', 'equipe',
  $q$select (select valor_pago::text from public.fin_faturas where situacao = 'paga') || '|' || (select situacao from public.fin_lancamentos where valor_total = 50)$q$,
  pg_temp.compra600() || '; ' || pg_temp.compra('ca01', 50, '2026-09-11', '[' || pg_temp.r('f104', 50) || ']')
  || $q$; update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where valor_total = 50; $q$ || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('pagar fatura já paga', 'recusado:fin_faturas_transicao', 'equipe', pg_temp.pagar('ca01', '2026-10-01', '2026-10-06'),
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('pagar fatura sem compras', 'recusado:fin_faturas_total_positivo', 'equipe',
  format('select public.fin_pagar_fatura(public.fin_obter_fatura(%L, %L), %L)::text', pg_temp.id('ca01'), '2027-01-01', '2027-01-05'), null),
('pagar antes do saldo inicial da conta', 'recusado:fin_lancamentos_antes_do_saldo_inicial', 'equipe', pg_temp.pagar('ca01', '2026-10-01', '2026-08-20'), pg_temp.compra600()),
('marcar a fatura como paga sem pagar as compras', 'recusado:fin_faturas_compras_pagas', 'equipe',
  $q$update public.fin_faturas set situacao = 'paga', data_pagamento = '2026-10-05', valor_pago = 600 where cartao_id = '00000000-0000-0000-0000-00000000ca01'$q$, pg_temp.compra600()),

-- Depois de pago
('nova compra numa fatura paga', 'recusado:fin_faturas_fechada', 'equipe', pg_temp.compra('ca01', 50, '2026-09-11', '[' || pg_temp.r('f104', 50) || ']'),
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('cancelar compra de fatura paga', 'recusado:fin_faturas_total_pago', 'equipe',
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where fatura_id is not null$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('corrigir a descrição de compra de fatura paga', 'aceito', 'equipe',
  $q$update public.fin_lancamentos set descricao = 'Materiais Dental' where fatura_id is not null$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('mover compra de fatura aberta para fatura paga', 'recusado:fin_faturas_fechada', 'equipe',
  'update public.fin_lancamentos set fatura_id = ' || pg_temp.fat('ca01', '2026-10-01') || $q$, data_vencimento = '2026-10-05' where valor_total = 50$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05') || '; ' || pg_temp.compra('ca01', 50, '2026-09-26', '[' || pg_temp.r('f104', 50) || ']')),
('ajustar datas de fatura paga', 'recusado:fin_faturas_campos_fixos', 'equipe',
  'select public.fin_ajustar_fatura(' || pg_temp.fat('ca01', '2026-10-01') || ', ''2026-09-25'', ''2026-10-06'')::text',
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),
('desfazer o pagamento: compras previstas de novo, fatura aberta', 'previsto|2026-10-05|nulo|aberta', 'equipe',
  $q$select l.situacao || '|' || l.data_vencimento || '|' || coalesce(l.data_liquidacao::text, 'nulo') || '|' || f.situacao from public.fin_lancamentos l join public.fin_faturas f on f.id = l.fatura_id$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05') || '; select public.fin_desfazer_pagamento_fatura(' || pg_temp.fat('ca01', '2026-10-01') || ')'),
('o histórico registra a compra realizada pelo pagamento', 'criado,realizado', 'equipe',
  $q$select string_agg(e.acao, ',' order by e.id) from public.fin_lancamentos_eventos e join public.fin_lancamentos l on l.id = e.lancamento_id where l.fatura_id is not null$q$,
  pg_temp.compra600() || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-05')),

-- Extrato
('relacionar o débito do banco com a fatura aberta: paga na data do banco', 'conciliado|paga|2026-10-10|realizado', 'equipe',
  $q$select m.situacao || '|' || f.situacao || '|' || f.data_pagamento || '|' || l.situacao from public.fin_extrato_movimentos m
     join public.fin_faturas f on f.id = m.fatura_id join public.fin_lancamentos l on l.fatura_id = f.id where m.id = '00000000-0000-0000-0000-00000000dd05'$q$,
  pg_temp.compra('ca01', 500, '2026-09-10', '[' || pg_temp.r('f104', 500) || ']') || '; select public.fin_conciliar_fatura(''00000000-0000-0000-0000-00000000dd05'', ' || pg_temp.fat('ca01', '2026-10-01') || ')'),
('relacionar com a fatura já paga', 'conciliado', 'equipe',
  $q$select situacao from public.fin_extrato_movimentos where id = '00000000-0000-0000-0000-00000000dd05'$q$,
  pg_temp.compra('ca01', 500, '2026-09-10', '[' || pg_temp.r('f104', 500) || ']') || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-09')
  || '; select public.fin_conciliar_fatura(''00000000-0000-0000-0000-00000000dd05'', ' || pg_temp.fat('ca01', '2026-10-01') || ')'),
('relacionar com fatura de outro valor', 'recusado:fin_movimentos_mesmo_valor', 'equipe',
  'select public.fin_conciliar_fatura(''00000000-0000-0000-0000-00000000dd05'', ' || pg_temp.fat('ca01', '2026-10-01') || ')::text', pg_temp.compra600()),
('relacionar com fatura paga por outra conta de caixa', 'recusado:fin_movimentos_mesma_caixa', 'equipe',
  'select public.fin_conciliar_fatura(''00000000-0000-0000-0000-00000000dd05'', ' || pg_temp.fat('ca02', '2026-10-01') || ')::text',
  pg_temp.compra('ca02', 500, '2026-10-02', '[' || pg_temp.r('f104', 500) || ']')),
('relacionar o débito com uma compra do cartão sozinha', 'recusado:fin_movimentos_compra_no_cartao', 'equipe',
  $q$select public.fin_conciliar('00000000-0000-0000-0000-00000000dd05', (select id from public.fin_lancamentos where fatura_id is not null))::text$q$,
  pg_temp.compra('ca01', 500, '2026-09-10', '[' || pg_temp.r('f104', 500) || ']')),
('desfazer pagamento conciliado', 'recusado:fin_faturas_conciliada', 'equipe',
  'select public.fin_desfazer_pagamento_fatura(' || pg_temp.fat('ca01', '2026-10-01') || ')::text',
  pg_temp.compra('ca01', 500, '2026-09-10', '[' || pg_temp.r('f104', 500) || ']') || '; select public.fin_conciliar_fatura(''00000000-0000-0000-0000-00000000dd05'', ' || pg_temp.fat('ca01', '2026-10-01') || ')'),
('desfazer a conciliação e depois o pagamento', 'aberta|pendente', 'equipe',
  $q$select (select situacao from public.fin_faturas where cartao_id = '00000000-0000-0000-0000-00000000ca01') || '|' || (select situacao from public.fin_extrato_movimentos where id = '00000000-0000-0000-0000-00000000dd05')$q$,
  pg_temp.compra('ca01', 500, '2026-09-10', '[' || pg_temp.r('f104', 500) || ']') || '; select public.fin_conciliar_fatura(''00000000-0000-0000-0000-00000000dd05'', ' || pg_temp.fat('ca01', '2026-10-01') || ')'
  || $q$; update public.fin_extrato_movimentos set situacao = 'pendente', fatura_id = null where id = '00000000-0000-0000-0000-00000000dd05'; select public.fin_desfazer_pagamento_fatura($q$ || pg_temp.fat('ca01', '2026-10-01') || ')'),
('pendente não pode ter fatura', 'recusado:fin_movimentos_situacao_coerente', 'equipe',
  'update public.fin_extrato_movimentos set fatura_id = ' || pg_temp.fat('ca01', '2026-10-01') || ' where id = ''00000000-0000-0000-0000-00000000dd05''',
  pg_temp.compra('ca01', 500, '2026-09-10', '[' || pg_temp.r('f104', 500) || ']') || '; ' || pg_temp.pagar('ca01', '2026-10-01', '2026-10-10')),
('a conciliação com lançamento (0010) continua valendo', 'conciliado|00000000-0000-0000-0000-00000000a102', 'equipe',
  $q$select situacao || '|' || lancamento_id from public.fin_extrato_movimentos where id = '00000000-0000-0000-0000-00000000dd01'$q$, pg_temp.conciliar('dd01', 'a102')),

-- Cadastro do cartão
('equipe cadastra cartão', 'aceito', 'equipe',
  $q$insert into public.fin_cartoes (empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento) values ('00000000-0000-0000-0000-0000000000e1', 'Amex', '00000000-0000-0000-0000-00000000c101', 20, 28)$q$, null),
('nome de cartão repetido', 'recusado:fin_cartoes_nome_unico', 'equipe',
  $q$insert into public.fin_cartoes (empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento) values ('00000000-0000-0000-0000-0000000000e1', ' visa EMPRESA', '00000000-0000-0000-0000-00000000c101', 20, 28)$q$, null),
('dia de fechamento inválido', 'recusado:fin_cartoes_dias_validos', 'equipe',
  $q$insert into public.fin_cartoes (empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento) values ('00000000-0000-0000-0000-0000000000e1', 'X', '00000000-0000-0000-0000-00000000c101', 32, 5)$q$, null),
('cartão pago por conta de caixa inativa', 'recusado:fin_cartoes_caixa_ativa', 'equipe',
  $q$insert into public.fin_cartoes (empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento) values ('00000000-0000-0000-0000-0000000000e1', 'X', '00000000-0000-0000-0000-00000000c103', 10, 20)$q$, null),
('cartão pago por conta de outra empresa', 'recusado:fin_cartoes_caixa', 'equipe',
  $q$insert into public.fin_cartoes (empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento) values ('00000000-0000-0000-0000-0000000000e1', 'X', '00000000-0000-0000-0000-00000000c201', 10, 20)$q$, null),
('mudar o dia de vencimento do cartão', 'aceito', 'equipe',
  $q$update public.fin_cartoes set dia_vencimento = 7 where id = '00000000-0000-0000-0000-00000000ca01'$q$, pg_temp.compra600()),
('a conta que paga não muda depois da primeira fatura', 'recusado:fin_cartoes_caixa_fixa', 'equipe',
  $q$update public.fin_cartoes set conta_caixa_id = '00000000-0000-0000-0000-00000000c102' where id = '00000000-0000-0000-0000-00000000ca01'$q$, pg_temp.compra600()),
('compra apontando para fatura de outra empresa', 'recusado:fin_lancamentos_fatura', null,
  $q$insert into public.fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_vencimento, situacao, descricao, fatura_id)
     values ('00000000-0000-0000-0000-0000000000e1', 'saida', 10, '00000000-0000-0000-0000-00000000c101', '2026-09-10', '2026-10-05', 'previsto', 'X',
       (select id from public.fin_faturas where cartao_id = '00000000-0000-0000-0000-00000000cb01'))$q$,
  pg_temp.compra('cb01', 10, '2026-09-10', json_build_array(json_build_object('conta_id', pg_temp.id('f201'), 'valor', 10))::text)),

-- Acesso
('cliente com central da A não lê cartões nem faturas', '0|0', 'cliente_a',
  $q$select (select count(*) from public.fin_cartoes) || '|' || (select count(*) from public.fin_faturas)$q$, pg_temp.compra600()),
-- A RLS esconde o cartão da empresa A, então a recusa vem como "cartão não encontrado".
('cliente com central da A não lança no cartão', 'recusado:fin_cartoes_nao_encontrado', 'cliente_a', pg_temp.compra600(), null),
-- Pelo mesmo motivo, a conta de caixa não aparece para ela e a recusa vem pela conta.
('cliente com central da A não cadastra cartão', 'recusado:fin_cartoes_caixa_ativa', 'cliente_a',
  $q$insert into public.fin_cartoes (empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento) values ('00000000-0000-0000-0000-0000000000e1', 'Y', '00000000-0000-0000-0000-00000000c101', 20, 28)$q$, null),
('sem login (anon) não executa fin_lancar_no_cartao', 'sem_permissao', 'anon', pg_temp.compra600(), null),
('sem login (anon) não executa fin_pagar_fatura', 'sem_permissao', 'anon', pg_temp.pagar('ca01', '2026-10-01', '2026-10-05'), pg_temp.compra600());

create or replace function pg_temp.rodar() returns jsonb language plpgsql as $$
declare v_res jsonb := '[]'; c record; v text;
begin
  begin
    perform pg_temp.apoio_cartoes();
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
