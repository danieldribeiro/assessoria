-- Testes da 0009 (fornecedores e clientes, observações) e da 0010 (extratos OFX e conciliação).
-- Os casos da 0007 e da 0008 continuam valendo com a 0009 e a 0010 aplicadas: rodar.sh roda os dois arquivos.
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

insert into _casos (caso, esperado, pessoa, sql, antes) values
-- 0009: cadastro de fornecedores e clientes
('equipe cadastra fornecedor', 'aceito', 'equipe',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo, documento) values ('00000000-0000-0000-0000-0000000000e1', 'Laboratório Sorriso', 'fornecedor', '12345678901')$q$, null),
('nome repetido na empresa, sem diferenciar maiúsculas', 'recusado:fin_contrapartes_nome_unico', 'equipe',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo) values ('00000000-0000-0000-0000-0000000000e1', ' dental cremer', 'fornecedor')$q$, null),
('mesmo nome em outra empresa', 'aceito', 'equipe',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo) values ('00000000-0000-0000-0000-0000000000e2', 'Dental Cremer', 'fornecedor')$q$, null),
('CPF/CNPJ com tamanho errado', 'recusado:fin_contrapartes_documento_valido', 'equipe',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo, documento) values ('00000000-0000-0000-0000-0000000000e1', 'X', 'fornecedor', '123')$q$, null),
('CPF/CNPJ com pontuação', 'recusado:fin_contrapartes_documento_valido', 'equipe',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo, documento) values ('00000000-0000-0000-0000-0000000000e1', 'X', 'fornecedor', '12.345.678/0001-90')$q$, null),
('CNPJ repetido na empresa', 'recusado:fin_contrapartes_documento_unico', 'equipe',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo, documento) values ('00000000-0000-0000-0000-0000000000e1', 'Cremer filial', 'fornecedor', '12345678000190')$q$, null),
('tipo inválido', 'recusado:fin_contrapartes_tipo_valido', 'equipe',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo) values ('00000000-0000-0000-0000-0000000000e1', 'Y', 'parceiro')$q$, null),
('cadastro não muda de empresa', 'recusado:fin_contrapartes_empresa_fixa', null,
  $q$update public.fin_contrapartes set empresa_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-00000000cc01'$q$, null),
('equipe desativa fornecedor', 'aceito', 'equipe',
  $q$update public.fin_contrapartes set ativa = false where id = '00000000-0000-0000-0000-00000000cc01'$q$, null),
('cliente com central da A não lê fornecedores', '0', 'cliente_a', $q$select count(*)::text from public.fin_contrapartes$q$, null),
('cliente com central da A não cadastra fornecedor', 'sem_permissao', 'cliente_a',
  $q$insert into public.fin_contrapartes (empresa_id, nome, tipo) values ('00000000-0000-0000-0000-0000000000e1', 'Z', 'fornecedor')$q$, null),

-- 0009: lançamento com fornecedor e observações
('lançar com fornecedor e observação', 'Dental Cremer|Nota 55', 'equipe',
  $q$select c.nome || '|' || x.observacoes from public.fin_lancamentos x join public.fin_contrapartes c on c.id = x.contraparte_id where x.descricao = 'Compra'$q$,
  $q$select public.fin_lancar('00000000-0000-0000-0000-0000000000e1', 'saida', 100, '00000000-0000-0000-0000-00000000c101', 'realizado', '2026-09-20', null, '2026-09-20', 'Compra', null, false,
     '[{"conta_id": "00000000-0000-0000-0000-00000000f104", "valor": 100}]'::jsonb, '00000000-0000-0000-0000-00000000cc01', ' Nota 55 ')$q$),
('observação em branco fica vazia', 'vazia', 'equipe',
  $q$select coalesce(x.observacoes, 'vazia') from public.fin_lancamentos x where x.descricao = 'Compra'$q$,
  $q$select public.fin_lancar('00000000-0000-0000-0000-0000000000e1', 'saida', 100, '00000000-0000-0000-0000-00000000c101', 'realizado', '2026-09-20', null, '2026-09-20', 'Compra', null, false,
     '[{"conta_id": "00000000-0000-0000-0000-00000000f104", "valor": 100}]'::jsonb, null, '   ')$q$),
('lançar com fornecedor inativo', 'recusado:fin_lancamentos_contraparte_ativa', 'equipe', pg_temp.lancar9('cc02', null), null),
('lançar com fornecedor de outra empresa', 'recusado:fin_lancamentos_contraparte_ativa', 'equipe', pg_temp.lancar9('cc03', null), null),
('chamada antiga de fin_lancar (sem os campos novos) continua funcionando', 'gravado', 'equipe',
  'select case when (' || regexp_replace(pg_temp.lancar('saida', '100', 'realizado', '2026-09-20', null, '[' || pg_temp.r('f104', 100) || ']'), '^select ', '') || ') is not null then ''gravado'' end', null),
('editar põe fornecedor e observação', 'Dental Cremer|Conferido', 'equipe',
  $q$select c.nome || '|' || x.observacoes from public.fin_lancamentos x join public.fin_contrapartes c on c.id = x.contraparte_id where x.id = '00000000-0000-0000-0000-00000000a102'$q$,
  pg_temp.editar9('a102', 'cc01', 'Conferido')),
('o histórico guarda o fornecedor de antes e o de depois', 'nulo>00000000-0000-0000-0000-00000000cc01', 'equipe',
  $q$select coalesce(antes ->> 'contraparte_id', 'nulo') || '>' || (depois ->> 'contraparte_id') from public.fin_lancamentos_eventos
     where lancamento_id = '00000000-0000-0000-0000-00000000a102' and acao = 'editado' order by id desc limit 1$q$, pg_temp.editar9('a102', 'cc01', null)),
('editar mantendo fornecedor que foi desativado depois', '00000000-0000-0000-0000-00000000a102', 'equipe', pg_temp.editar9('a102', 'cc01', 'outra'),
  pg_temp.editar9('a102', 'cc01', null) || '; update public.fin_contrapartes set ativa = false where id = ''00000000-0000-0000-0000-00000000cc01'''),
('trocar para fornecedor inativo', 'recusado:fin_lancamentos_contraparte_ativa', 'equipe', pg_temp.editar9('a102', 'cc02', null), null),
('versão antiga guardada de fin_lancar não pode ser usada', 'sem_permissao', 'equipe',
  replace(pg_temp.lancar('saida', '100', 'realizado', '2026-09-20', null, '[' || pg_temp.r('f104', 100) || ']'), 'public.fin_lancar(', 'public.fin_lancar_0007('), null),
('versão antiga guardada de fin_editar_lancamento não pode ser usada', 'sem_permissao', 'equipe',
  replace(pg_temp.editar('a101', 'entrada', '3100', 'realizado', '2026-09-10', null, '[' || pg_temp.r('f102', 3100) || ']'), 'public.fin_editar_lancamento(', 'public.fin_editar_lancamento_0008('), null),
('sem login (anon) não executa fin_lancar', 'sem_permissao', 'anon', pg_temp.lancar9('cc01', null), null),

-- 0010: importação
('importar 3 movimentações, uma já existente', '2/1', 'equipe',
  pg_temp.importar('[' || pg_temp.mov('2026-09-15', -1000, 'fitid:1') || ',' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ',' || pg_temp.mov('2026-10-21', -40.5, 'sem-id:2026-10-21|-40.50|TARIFA|1') || ']'), null),
('importar o mesmo arquivo de novo não grava nada', '0/2', 'equipe',
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ',' || pg_temp.mov('2026-10-21', -40.5, 'sem-id:2026-10-21|-40.50|TARIFA|1') || ']'),
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ',' || pg_temp.mov('2026-10-21', -40.5, 'sem-id:2026-10-21|-40.50|TARIFA|1') || ']')),
('chave repetida dentro do mesmo arquivo grava uma vez', '1/1', 'equipe',
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:9') || ',' || pg_temp.mov('2026-10-20', 300, 'fitid:9') || ']'), null),
('mesma chave em outra conta de caixa é outra movimentação', '1/0', 'equipe',
  pg_temp.importar('[' || pg_temp.mov('2026-09-15', -1000, 'fitid:1') || ']', 'c102'), null),
('o resumo do arquivo fica gravado', '3|2|1|0', 'equipe',
  $q$select lidas || '|' || novas || '|' || duplicadas || '|' || com_erro from public.fin_extratos where arquivo_sha256 = repeat('c', 64)$q$,
  pg_temp.importar('[' || pg_temp.mov('2026-09-15', -1000, 'fitid:1') || ',' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ',' || pg_temp.mov('2026-10-21', -40.5, 'sem-id:x') || ']')),
('importar não muda o saldo nem cria lançamento', '8000.00|6', 'equipe',
  $q$select (select saldo::text from public.fin_saldos('00000000-0000-0000-0000-0000000000e1', '2026-10-31') where conta_caixa_id = '00000000-0000-0000-0000-00000000c101')
     || '|' || (select count(*) from public.fin_lancamentos where empresa_id = '00000000-0000-0000-0000-0000000000e1')$q$,
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ',' || pg_temp.mov('2026-10-21', -40.5, 'sem-id:x') || ']')),
('movimentação importada fica pendente', 'pendente', 'equipe',
  $q$select situacao from public.fin_extrato_movimentos where chave = 'fitid:8'$q$, pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ']')),
('arquivo com resumo SHA-256 inválido', 'recusado:fin_extratos_sha256_valido', 'equipe',
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ']', 'c101', 'xyz'), null),
('movimentação com valor zero', 'recusado:fin_movimentos_valor_nao_zero', 'equipe',
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', 0, 'fitid:z') || ']'), null),
('movimentação sem descrição', 'recusado:fin_movimentos_descricao_nao_branca', 'equipe',
  pg_temp.importar('[' || pg_temp.mov('2026-10-20', 10, 'fitid:d', ' ') || ']'), null),
('movimentação não nasce conciliada', 'recusado:fin_movimentos_transicao', null,
  $q$insert into public.fin_extrato_movimentos (empresa_id, extrato_id, conta_caixa_id, data, valor, descricao, chave, situacao, lancamento_id, conciliado_em)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c101', '2026-09-15', -1000, 'X', 'k1', 'conciliado', '00000000-0000-0000-0000-00000000a102', now())$q$, null),
('movimentação em conta de caixa diferente da do extrato', 'recusado:fin_movimentos_caixa_do_extrato', null,
  $q$insert into public.fin_extrato_movimentos (empresa_id, extrato_id, conta_caixa_id, data, valor, descricao, chave)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000c102', '2026-09-15', -1000, 'X', 'k2')$q$, null),
('o que veio do banco não muda', 'recusado:fin_movimentos_campos_fixos', 'equipe',
  $q$update public.fin_extrato_movimentos set valor = -999 where id = '00000000-0000-0000-0000-00000000dd01'$q$, null),
('cliente com central da A não lê extratos', '0|0', 'cliente_a',
  $q$select (select count(*) from public.fin_extratos) || '|' || (select count(*) from public.fin_extrato_movimentos)$q$, null),
('cliente com central da A não importa', 'sem_permissao', 'cliente_a', pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ']'), null),
('sem login (anon) não executa fin_importar_extrato', 'sem_permissao', 'anon', pg_temp.importar('[' || pg_temp.mov('2026-10-20', 300, 'fitid:8') || ']'), null),

-- 0010: conciliação com lançamento
('conciliar com lançamento realizado de mesmo valor e sentido', 'conciliado|00000000-0000-0000-0000-00000000a102', 'equipe',
  $q$select situacao || '|' || lancamento_id from public.fin_extrato_movimentos where id = '00000000-0000-0000-0000-00000000dd01'$q$, pg_temp.conciliar('dd01', 'a102')),
('a conciliação registra quem e quando', 'sim', 'equipe',
  $q$select case when conciliado_em is not null and conciliado_por = '00000000-0000-0000-0000-0000000000a1' then 'sim' end
     from public.fin_extrato_movimentos where id = '00000000-0000-0000-0000-00000000dd01'$q$,
  $q$select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true), set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true); $q$ || pg_temp.conciliar('dd01', 'a102')),
('conciliar com valor diferente', 'recusado:fin_movimentos_mesmo_valor', 'equipe', pg_temp.conciliar('dd02', 'a101'), null),
('conciliar com sentido diferente', 'recusado:fin_movimentos_mesmo_valor', 'equipe', pg_temp.conciliar('dd01', 'a104'), null),
('conciliar com lançamento de outra conta de caixa', 'recusado:fin_movimentos_mesma_caixa', 'equipe', pg_temp.conciliar('dd01', 'a105'), null),
('conciliar com previsto: vira realizado na data do banco', 'realizado|2026-10-05|conciliado', 'equipe',
  $q$select l.situacao || '|' || l.data_liquidacao || '|' || m.situacao from public.fin_lancamentos l join public.fin_extrato_movimentos m on m.lancamento_id = l.id
     where l.id = '00000000-0000-0000-0000-00000000a103'$q$, pg_temp.conciliar('dd03', 'a103')),
('conciliar com lançamento cancelado', 'recusado:fin_movimentos_lancamento_realizado', 'equipe', pg_temp.conciliar('dd01', 'a106'),
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000a106'$q$),
('dois extratos no mesmo lançamento', 'recusado:fin_movimentos_lancamento_unico', 'equipe', pg_temp.conciliar('dd07', 'a102'), pg_temp.conciliar('dd01', 'a102')),
('conciliar de novo uma movimentação já conciliada', 'recusado:fin_movimentos_transicao', 'equipe', pg_temp.conciliar('dd01', 'a106'), pg_temp.conciliar('dd01', 'a102')),
('lançamento conciliado não muda de valor', 'recusado:fin_lancamentos_conciliado', 'equipe',
  pg_temp.editar('a102', 'saida', '1100', 'realizado', '2026-09-15', null, '[' || pg_temp.r('f104', 1100) || ']', 'c101', '2026-09-15'), pg_temp.conciliar('dd01', 'a102')),
('lançamento conciliado não é cancelado', 'recusado:fin_lancamentos_conciliado', 'equipe',
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000a102'$q$, pg_temp.conciliar('dd01', 'a102')),
('lançamento conciliado ainda corrige descrição, conta e fornecedor', '00000000-0000-0000-0000-00000000a102', 'equipe', pg_temp.editar9('a102', 'cc01', 'ok'), pg_temp.conciliar('dd01', 'a102')),
('desfazer a conciliação', 'pendente', 'equipe',
  $q$select situacao from public.fin_extrato_movimentos where id = '00000000-0000-0000-0000-00000000dd01'$q$,
  pg_temp.conciliar('dd01', 'a102') || $q$; update public.fin_extrato_movimentos set situacao = 'pendente', lancamento_id = null where id = '00000000-0000-0000-0000-00000000dd01'$q$),
('depois de desfazer, o lançamento volta a poder ser cancelado', 'aceito', 'equipe',
  $q$update public.fin_lancamentos set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000a102'$q$,
  pg_temp.conciliar('dd01', 'a102') || $q$; update public.fin_extrato_movimentos set situacao = 'pendente', lancamento_id = null where id = '00000000-0000-0000-0000-00000000dd01'$q$),
('cliente com central da A não concilia', 'recusado:fin_movimentos_nao_encontrada', 'cliente_a', pg_temp.conciliar('dd01', 'a102'), null),

-- 0010: lançamento criado a partir do extrato
('criar despesa a partir da movimentação', 'saida|500.00|realizado|2026-10-10|2026-10-10|COMPRA DENTAL CREMER|Dental Cremer|conciliado', 'equipe',
  $q$select l.direcao || '|' || l.valor_total || '|' || l.situacao || '|' || l.data_liquidacao || '|' || l.data_competencia || '|' || l.descricao || '|' || c.nome || '|' || m.situacao
     from public.fin_extrato_movimentos m join public.fin_lancamentos l on l.id = m.lancamento_id join public.fin_contrapartes c on c.id = l.contraparte_id
     where m.id = '00000000-0000-0000-0000-00000000dd05'$q$, pg_temp.do_extrato('dd05', '[' || pg_temp.r('f104', 500) || ']')),
('o lançamento criado entra no saldo uma vez só', '7500.00', 'equipe', pg_temp.saldo('c101', '2026-10-31'), pg_temp.do_extrato('dd05', '[' || pg_temp.r('f104', 500) || ']')),
('a mesma movimentação não gera dois lançamentos', 'recusado:fin_movimentos_transicao', 'equipe',
  pg_temp.do_extrato('dd05', '[' || pg_temp.r('f104', 500) || ']'), pg_temp.do_extrato('dd05', '[' || pg_temp.r('f104', 500) || ']')),
('depois de desfazer, também não gera outro lançamento', 'recusado:fin_lancamentos_origem_unica', 'equipe',
  pg_temp.do_extrato('dd05', '[' || pg_temp.r('f104', 500) || ']'),
  pg_temp.do_extrato('dd05', '[' || pg_temp.r('f104', 500) || ']') || $q$; update public.fin_extrato_movimentos set situacao = 'pendente', lancamento_id = null where id = '00000000-0000-0000-0000-00000000dd05'$q$),
('rateio que não soma o valor do banco', 'recusado:fin_rateios_soma_exata', 'equipe', pg_temp.do_extrato('dd05', '[' || pg_temp.r('f104', 400) || ']'), null),
('receita a partir de crédito', 'entrada|2000.00', 'equipe',
  $q$select l.direcao || '|' || l.valor_total from public.fin_extrato_movimentos m join public.fin_lancamentos l on l.id = m.lancamento_id where m.id = '00000000-0000-0000-0000-00000000dd02'$q$,
  pg_temp.do_extrato('dd02', '[' || pg_temp.r('f102', 2000) || ']')),

-- 0010: transferência e ignorar
('conciliar crédito com a transferência que chega na conta', 'aceito', 'equipe', pg_temp.mov_transf('dd04'), null),
('conciliar débito com a transferência que sai da conta', 'aceito', 'equipe', pg_temp.mov_transf('dd06'), null),
('transferência que não chega nesta conta', 'recusado:fin_movimentos_mesma_caixa', 'equipe', pg_temp.mov_transf('dd02'), null),
('transferência com valor diferente', 'recusado:fin_movimentos_mesmo_valor', 'equipe', pg_temp.mov_transf('dd01'), null),
('transferência conciliada não é cancelada', 'recusado:fin_transferencias_conciliada', 'equipe',
  $q$update public.fin_transferencias set situacao = 'cancelado', cancelado_em = now() where id = '00000000-0000-0000-0000-00000000d101'$q$, pg_temp.mov_transf('dd04')),
('ignorar com motivo', 'aceito', 'equipe',
  $q$update public.fin_extrato_movimentos set situacao = 'ignorado', motivo = 'Tarifa estornada no mesmo dia' where id = '00000000-0000-0000-0000-00000000dd07'$q$, null),
('ignorar sem motivo', 'recusado:fin_movimentos_situacao_coerente', 'equipe',
  $q$update public.fin_extrato_movimentos set situacao = 'ignorado' where id = '00000000-0000-0000-0000-00000000dd07'$q$, null),
('pendente não pode ter vínculo', 'recusado:fin_movimentos_situacao_coerente', 'equipe',
  $q$update public.fin_extrato_movimentos set lancamento_id = '00000000-0000-0000-0000-00000000a102' where id = '00000000-0000-0000-0000-00000000dd01'$q$, null);

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
