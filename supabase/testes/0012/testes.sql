-- Testes da 0012 (financeiro na central, só para ver). Usa os dados de apoio e os atalhos dos testes da 0011.
-- "chave" = empresas.financeiro_na_central ligada antes do caso (como dono, fora da sessão da pessoa).
-- Os casos da 0007 a 0011 continuam valendo com a 0012 aplicada (a chave nasce desligada): rodar.sh roda todos.
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

-- Atalho da 0008: cria conta no plano.
create or replace function pg_temp.conta(p_codigo text, p_nome text, p_tipo text, p_natureza text, p_classificacao text, p_caixa text, p_dre int,
                                         p_pai text default null, p_empresa text default 'e1', p_cmv boolean default false) returns text language sql as $$
  select format('insert into public.fin_contas (empresa_id, conta_pai_id, codigo, nome, tipo, natureza, classificacao, comportamento_caixa, dre_secao, custo_cmv) values (%L, %s, %L, %L, %L, %s, %s, %s, %s, %s)',
    '00000000-0000-0000-0000-0000000000' || p_empresa, coalesce(quote_literal('00000000-0000-0000-0000-00000000' || p_pai), 'null'),
    p_codigo, p_nome, p_tipo, coalesce(quote_literal(p_natureza), 'null'), coalesce(quote_literal(p_classificacao), 'null'),
    coalesce(quote_literal(p_caixa), 'null'), coalesce(p_dre::text, 'null'), p_cmv::text);
$$;
-- Edita o a101 (só a descrição, mesmo rateio) e devolve o que ficou gravado, na mesma sessão de quem chama.
create or replace function pg_temp.editar_e_ler() returns text language plpgsql as $$
declare v text;
begin
  execute pg_temp.editar('a101', 'entrada', '3000', 'realizado', '2026-09-10', null, '[' || pg_temp.r('f102', 3000) || ']');
  select descricao || '|' || valor_total into v from public.fin_lancamentos where id = '00000000-0000-0000-0000-00000000a101';
  return v;
end;
$$;
create or replace function pg_temp.chave(p_empresa text default 'e1') returns text language sql as $$
  select format('update public.empresas set financeiro_na_central = true where id = %L', '00000000-0000-0000-0000-0000000000' || p_empresa);
$$;
create or replace function pg_temp.por_empresa(p_tabela text) returns text language sql as $$
  select format($f$select (select count(*) from public.%1$I where empresa_id = '00000000-0000-0000-0000-0000000000e1') || '|' ||
                          (select count(*) from public.%1$I where empresa_id = '00000000-0000-0000-0000-0000000000e2')$f$, p_tabela);
$$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
-- A chave nasce desligada: nada muda para o cliente.
('chave nasce desligada em todas as empresas', '0', null, $q$select count(*)::text from public.empresas where financeiro_na_central$q$, null),
('sem a chave, cliente da A não lê lançamentos', '0|0', 'cliente_a', pg_temp.por_empresa('fin_lancamentos'), null),
('sem a chave, cliente da A não recebe a empresa', 'nulo', 'cliente_a', $q$select public.central_financeiro_empresa('00000000-0000-0000-0000-0000000000e1')::text$q$, null),

-- Com a chave: lê só a própria empresa.
('com a chave, cliente da A lê lançamentos só da A', '6|0', 'cliente_a', pg_temp.por_empresa('fin_lancamentos'), pg_temp.chave()),
('com a chave, cliente da A lê rateios só da A', '7|0', 'cliente_a', pg_temp.por_empresa('fin_lancamento_rateios'), pg_temp.chave()),
('com a chave, cliente da A lê plano de contas só da A', '10|0', 'cliente_a', pg_temp.por_empresa('fin_contas'), pg_temp.chave()),
('com a chave, cliente da A lê contas de caixa só da A', '3|0', 'cliente_a', pg_temp.por_empresa('fin_contas_caixa'), pg_temp.chave()),
('com a chave, cliente da A lê transferências só da A', '1|0', 'cliente_a', pg_temp.por_empresa('fin_transferencias'), pg_temp.chave()),
('com a chave, cliente da A lê fornecedores só da A', '2|0', 'cliente_a', pg_temp.por_empresa('fin_contrapartes'), pg_temp.chave()),
('com a chave, cliente da A lê as 12 seções da DRE', '12', 'cliente_a', $q$select count(*)::text from public.fin_dre_secoes$q$, pg_temp.chave()),
('chave só da B, cliente da A não lê as seções da DRE', '0', 'cliente_a', $q$select count(*)::text from public.fin_dre_secoes$q$, pg_temp.chave('e2')),
('com a chave, saldo do Banco A em 30/09', '6000.00', 'cliente_a', pg_temp.saldo('c101', '2026-09-30'), pg_temp.chave()),
('com a chave, fluxo de setembro da A tem linhas', 'true', 'cliente_a',
  $q$select (count(*) > 0)::text from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e1', '2026-09-01', '2026-09-30', 'realizado')$q$, pg_temp.chave()),
('com a chave, saldos e fluxo da B vêm vazios', '0|0', 'cliente_a',
  $q$select (select count(*) from public.fin_saldos('00000000-0000-0000-0000-0000000000e2', '2026-09-30')) || '|' ||
            (select count(*) from public.fin_fluxo_caixa('00000000-0000-0000-0000-0000000000e2', '2026-09-01', '2026-09-30', 'realizado'))$q$, pg_temp.chave()),
('com a chave, cliente da A recebe o nome da empresa', 'Clínica Teste A', 'cliente_a',
  $q$select public.central_financeiro_empresa('00000000-0000-0000-0000-0000000000e1') ->> 'nome'$q$, pg_temp.chave()),
('com a chave, cliente da A não lê a tabela empresas', '0', 'cliente_a', $q$select count(*)::text from public.empresas$q$, pg_temp.chave()),

-- Com a chave: continua sem gravar nada.
('com a chave, cliente da A não lança', 'sem_permissao', 'cliente_a',
  pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f102', 100) || ']'), pg_temp.chave()),
('com a chave, cliente da A não insere lançamento direto', 'sem_permissao', 'cliente_a',
  $q$insert into public.fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao)
     values ('00000000-0000-0000-0000-0000000000e1', 'entrada', 1, '00000000-0000-0000-0000-00000000c101', '2026-09-28', '2026-09-28', 'realizado', 'x')$q$, pg_temp.chave()),
('com a chave, cliente da A não altera lançamento', '0', 'cliente_a',
  $q$with u as (update public.fin_lancamentos set descricao = 'x' returning 1) select count(*)::text from u$q$, pg_temp.chave()),
('com a chave, cliente da A não liquida previsto', '0', 'cliente_a',
  $q$with u as (update public.fin_lancamentos set situacao = 'realizado', data_liquidacao = '2026-10-05' where id = '00000000-0000-0000-0000-00000000a103' returning 1) select count(*)::text from u$q$, pg_temp.chave()),
('com a chave, cliente da A não altera conta do plano', '0', 'cliente_a',
  $q$with u as (update public.fin_contas set nome = 'x' returning 1) select count(*)::text from u$q$, pg_temp.chave()),
('com a chave, cliente da A não altera rateio', '0', 'cliente_a',
  $q$with u as (update public.fin_lancamento_rateios set valor = valor returning 1) select count(*)::text from u$q$, pg_temp.chave()),
('com a chave, cliente da A não apaga lançamento', '0', 'cliente_a',
  $q$with u as (delete from public.fin_lancamentos returning 1) select count(*)::text from u$q$, pg_temp.chave()),
('com a chave, cliente da A não cria conta no plano', 'sem_permissao', 'cliente_a',
  pg_temp.conta('6.06', 'Invasão', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8), pg_temp.chave()),
-- fin_editar_lancamento roda com a permissão de quem chama: trocar o rateio esbarra na regra de inserção;
-- sem trocar o rateio, a função termina, mas a regra de alteração filtra a linha e nada muda.
('com a chave, cliente da A não troca o rateio pelo atalho', 'sem_permissao', 'cliente_a',
  pg_temp.editar('a101', 'entrada', '3000', 'realizado', '2026-09-10', null, '[' || pg_temp.r('f104', 3000) || ']'), pg_temp.chave()),
('com a chave, atalho de edição não muda o lançamento', 'Consultas de setembro|3000.00', 'cliente_a',
  $q$select pg_temp.editar_e_ler()$q$, pg_temp.chave()),
('com a chave, cliente da A não importa extrato', 'sem_permissao', 'cliente_a',
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', -10, 'fitid:x') || ']'), pg_temp.chave()),
('com a chave, cliente da A não lança no cartão', 'sem_permissao', 'cliente_a', pg_temp.compra600(), pg_temp.chave()),
('com a chave, cliente da A não liga a chave de outra empresa', '0', 'cliente_a',
  $q$with u as (update public.empresas set financeiro_na_central = true returning 1) select count(*)::text from u$q$, pg_temp.chave()),

-- Quem não tem acesso à central continua sem ver.
('chave da A ligada, cliente sem central não lê', '0|0', 'cliente_b', pg_temp.por_empresa('fin_lancamentos'), pg_temp.chave()),
('chave da A ligada, cliente sem central não recebe a empresa', 'nulo', 'cliente_b',
  $q$select public.central_financeiro_empresa('00000000-0000-0000-0000-0000000000e1')::text$q$, pg_temp.chave()),
('chave só da B, cliente da A não lê nada', '0|0', 'cliente_a', pg_temp.por_empresa('fin_lancamentos'), pg_temp.chave('e2')),
('sem login (anon) não executa central_financeiro_empresa', 'sem_permissao', 'anon',
  $q$select public.central_financeiro_empresa('00000000-0000-0000-0000-0000000000e1')::text$q$, pg_temp.chave()),
('sem login (anon) não lê lançamentos com a chave', '0', 'anon', $q$select count(*)::text from public.fin_lancamentos$q$, pg_temp.chave()),

-- A equipe segue igual e liga ou desliga a chave.
('equipe lê as duas empresas', '6|1', 'equipe', pg_temp.por_empresa('fin_lancamentos'), null),
('equipe liga a chave', '1', 'equipe',
  $q$with u as (update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1' returning 1) select count(*)::text from u$q$, null),
('equipe recebe a empresa mesmo sem a chave', 'Clínica Teste A', 'equipe',
  $q$select public.central_financeiro_empresa('00000000-0000-0000-0000-0000000000e1') ->> 'nome'$q$, null),
('equipe continua lançando', 'true', 'equipe',
  'select (x is not null)::text from (' || pg_temp.lancar('entrada', '100', 'realizado', '2026-09-28', null, '[' || pg_temp.r('f102', 100) || ']') || ') s(x)', null);
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
