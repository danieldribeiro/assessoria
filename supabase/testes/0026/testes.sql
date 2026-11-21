-- Testes da 0026 (notas de compra). Mesmo esquema dos testes da 0023, de onde vem a função que executa cada caso,
-- de uma subtransação desfeita no fim. Devolve um JSON com passaram, total e cada caso. Empresa A (e1) tem o estoque ligado
-- só durante os testes.

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

-- Roda a ação e depois confere a consulta, num bloco só. Devolve 'aceito' se a consulta der o esperado.
create or replace function pg_temp.confere(p_acao text, p_consulta text, p_esperado text) returns text language sql as $corpo$
  select format($f$do $d$ declare v text; begin %s; v := (%s)::text;
    if v is distinct from %L then raise exception 'x' using errcode = 'check_violation', constraint = 'obtido=' || coalesce(v, 'nulo'); end if; end $d$$f$,
    p_acao, p_consulta, p_esperado);
$corpo$;

-- Base (como superusuário): insumos Café (kg, R$ 100) e Copo (un, R$ 0,50), uma conta de caixa e uma conta de despesa.
create or replace function pg_temp.base() returns text language sql as $f$ select $a$
  insert into public.fin_estoque_itens (id, empresa_id, nome, unidade, custo_unitario) values
    ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000e1', 'Café', 'kg', 100),
    ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000e1', 'Copo', 'un', 0.5);
  insert into public.fin_contas_caixa (id, empresa_id, nome, tipo, saldo_inicial, data_saldo_inicial) values
    ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000000e1', 'Banco A', 'banco', 0, '2026-09-01');
  insert into public.fin_contas (id, empresa_id, conta_pai_id, codigo, nome, tipo, natureza, classificacao, comportamento_caixa, dre_secao) values
    ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000000e1', null, '6', 'Despesas', 'grupo', null, null, null, 8),
    ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000f103', '6.01', 'Compras', 'analitica', 'despesa', 'despesa_operacional', 'operacional', 8)
$a$ $f$;

-- NF-e fictícia: 5 pct de café (R$ 300) e 2 caixas de 50 copos (R$ 100), frete R$ 15, total R$ 415.
create or replace function pg_temp.nf(p_extra text default '{}', p_chave text default 'A1', p_doc text default '00000000000191') returns text language sql as $f$
  select (jsonb_build_object('tipo', 'produto', 'chave', p_chave, 'numero', '1', 'emissao', '2026-10-09', 'entrada', '2026-10-10',
    'emitente_documento', p_doc, 'emitente_nome', 'Fornecedor Fictício', 'valor_total', 415, 'valor_frete', 15, 'origem', 'xml',
    'itens', jsonb_build_array(
      jsonb_build_object('codigo', 'CAF', 'descricao', 'CAFE 1KG', 'unidade', 'PCT', 'quantidade', 5, 'valor', 300, 'item_id', '00000000-0000-0000-0000-00000000d001', 'fator', 1),
      jsonb_build_object('codigo', 'COPO', 'descricao', 'COPO C/50', 'unidade', 'CX', 'quantidade', 2, 'valor', 100, 'item_id', '00000000-0000-0000-0000-00000000d002', 'fator', 50)))
    || p_extra::jsonb)::text;
$f$;
create or replace function pg_temp.salvar(p_nota text, p_id text default 'null', p_empresa text default 'e1') returns text language sql as $f$
  select format('public.fin_estoque_salvar_nota(%L, %s, %L::jsonb)', pg_temp.emp(p_empresa), p_id, p_nota);
$f$;
create or replace function pg_temp.id_nf(p_chave text default 'A1') returns text language sql as $f$
  select format('(select id from public.fin_estoque_notas where chave = %L)', p_chave);
$f$;
-- NFS-e de R$ 200 ligada à NF-e A1.
create or replace function pg_temp.nfs() returns text language sql as $f$
  select format($q$perform public.fin_estoque_salvar_nota(%L, null, jsonb_build_object('tipo', 'servico', 'chave', 'S1', 'numero', '9',
    'entrada', '2026-10-10', 'emitente_documento', '00000000000272', 'emitente_nome', 'Fornecedor Fictício', 'valor_total', 200,
    'nota_produto_id', %s, 'itens', '[]'::jsonb))$q$, pg_temp.emp('e1'), pg_temp.id_nf());
$f$;
create or replace function pg_temp.custos() returns text language sql as $f$
  select $q$(select string_agg(nome || '=' || custo_unitario::numeric(14,4), ' ' order by nome) from public.fin_estoque_itens where empresa_id = '00000000-0000-0000-0000-0000000000e1')$q$;
$f$;
create or replace function pg_temp.linhas() returns text language sql as $f$
  select $q$(select string_agg(i.descricao || '=' || i.servico || '+' || i.frete || '=' || i.custo, ' ' order by n.chave, i.ordem)
    from public.fin_estoque_notas_itens i join public.fin_estoque_notas n on n.id = i.nota_id)$q$;
$f$;
-- Contagem fechada (como superusuário) com 5 kg de café a R$ 100.
create or replace function pg_temp.contagem(p_data text) returns text language sql as $f$ select format($a$;
  insert into public.fin_estoque_contagens (id, empresa_id, data) values ('00000000-0000-0000-0000-00000000e501', '00000000-0000-0000-0000-0000000000e1', %L);
  insert into public.fin_estoque_contagem_itens (empresa_id, contagem_id, item_id, nome_origem, quantidade, custo_unitario) values
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000e501', '00000000-0000-0000-0000-00000000d001', 'Café', 5, 100);
  update public.fin_estoque_contagens set situacao = 'fechada', fechada_em = now() where id = '00000000-0000-0000-0000-00000000e501'$a$, p_data) $f$;
-- Nos preparativos que gravam nota (a função confere a permissão), age como a equipe.
create or replace function pg_temp.como_equipe() returns text language sql as $f$
  select $q$; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","email":"equipe@teste.local"}', true),
    set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true)$q$;
$f$;
create or replace function pg_temp.fin(p_fin text) returns text language sql as $f$ select format('{"financeiro": %s}', p_fin) $f$;
create or replace function pg_temp.lancs() returns text language sql as $f$
  select $q$(select string_agg(l.valor_total || '@' || l.data_competencia || '>' || l.data_vencimento || ':' || l.situacao || ':' || l.documento || ':' || c.nome, ' ' order by l.data_vencimento)
    from public.fin_lancamentos l join public.fin_estoque_notas_lancamentos x on x.lancamento_id = l.id join public.fin_contrapartes c on c.id = l.contraparte_id)$q$;
$f$;
create or replace function pg_temp.criar2() returns text language sql as $f$
  select pg_temp.fin('{"modo":"criar","conta_caixa_id":"00000000-0000-0000-0000-00000000c101","conta_id":"00000000-0000-0000-0000-00000000f104","duplicatas":[{"vencimento":"2026-11-10","valor":207.5},{"vencimento":"2026-12-10","valor":207.5}]}');
$f$;

insert into _casos (caso, esperado, pessoa, sql, antes) values
('rateio sem perder centavo', '{0.34,0.33,0.33}', null, 'select public.fin_estoque_ratear(1, array[1,1,1])::text', null),
('rateio com pesos zero divide por igual', '{5.00,5.00}', null, 'select public.fin_estoque_ratear(10, array[0,0])::text', null),
('NF-e grava itens com o frete rateado pelo valor', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()), pg_temp.linhas(), 'CAFE 1KG=0.00+11.25=311.25 COPO C/50=0.00+3.75=103.75'), pg_temp.base()),
('sem contagem fechada, o custo médio é o das compras (com fator da caixa)', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()), pg_temp.custos(), 'Café=62.2500 Copo=1.0375'), pg_temp.base()),
('NFS-e ligada rateia o serviço entre os itens da NF-e e entra no custo', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()) || '; ' || pg_temp.nfs(), pg_temp.linhas() || $a$ || '|' || $a$ || pg_temp.custos(),
    'CAFE 1KG=150.00+11.25=461.25 COPO C/50=50.00+3.75=153.75|Café=92.2500 Copo=1.5375'), pg_temp.base()),
('notas da mesma remessa dividem o frete', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf('{"remessa":"R1"}')) || '; perform ' || pg_temp.salvar(pg_temp.nf('{"remessa":"R1","valor_frete":0,"valor_total":400}', 'A2')),
    pg_temp.linhas(), 'CAFE 1KG=0.00+5.63=305.63 COPO C/50=0.00+1.88=101.88 CAFE 1KG=0.00+5.62=305.62 COPO C/50=0.00+1.87=101.87'), pg_temp.base()),
('custo médio parte da última contagem fechada', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()), pg_temp.custos(), 'Café=81.1250 Copo=1.0375'), pg_temp.base() || pg_temp.contagem('2026-10-05')),
('compra antes da contagem não entra: volta ao custo da contagem', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()), pg_temp.custos(), 'Café=100.0000 Copo=0.5000'), pg_temp.base() || pg_temp.contagem('2026-10-15')),
('recalcular depois de fechar a contagem recomeça o custo médio', 'aceito', 'equipe',
  pg_temp.confere('perform public.fin_estoque_recalcular_custos(' || quote_literal(pg_temp.emp('e1')) || ')', pg_temp.custos(), 'Café=100.0000 Copo=1.0375'),
  pg_temp.base() || pg_temp.como_equipe() || '; select ' || pg_temp.salvar(pg_temp.nf()) || pg_temp.contagem('2026-10-15')),
('apagar a nota volta ao custo da contagem', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()) || '; perform public.fin_estoque_apagar_nota(' || pg_temp.id_nf() || ')', pg_temp.custos(), 'Café=100.0000 Copo=1.0375'),
  pg_temp.base() || pg_temp.contagem('2026-10-05')),
('apagar a NF-e solta a NFS-e e tira o serviço do custo', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()) || '; perform ' || pg_temp.salvar(pg_temp.nf('{}', 'A2')) || '; ' || pg_temp.nfs()
    || '; perform public.fin_estoque_apagar_nota(' || pg_temp.id_nf() || ')',
    $q$(select count(*) filter (where nota_produto_id is null) || '|' from public.fin_estoque_notas where tipo = 'servico') || $q$ || pg_temp.custos(), '1|Café=62.2500 Copo=1.0375'),
  pg_temp.base()),
('editar a nota troca os itens e refaz o custo dos insumos antigos', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()) || '; perform ' || pg_temp.salvar(pg_temp.nf('{"itens":[{"descricao":"CAFE 1KG","quantidade":5,"valor":400,"item_id":"00000000-0000-0000-0000-00000000d001"}],"valor_total":415}'), pg_temp.id_nf()),
    pg_temp.custos() || $a$ || '|' || (select count(*) from public.fin_estoque_notas)$a$, 'Café=83.0000 Copo=1.0375|1'), pg_temp.base()),
('item novo pode criar o insumo; o de-para guarda o código e o fator', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf('{"itens":[{"codigo":"LEI","descricao":"LEITE 1L CX12","quantidade":2,"valor":100,"fator":12,"criar_insumo":{"nome":"Leite integral","unidade":"L"}},{"descricao":"Brinde","quantidade":1,"valor":0}],"valor_frete":0,"valor_total":100}')),
    $q$(select string_agg(d.fornecedor || ':' || d.chave || '>' || coalesce(i.nome, 'ignorar') || '*' || d.fator::numeric(8,0), ' ' order by d.chave) from public.fin_estoque_depara d left join public.fin_estoque_itens i on i.id = d.item_id)
      || '|' || (select custo_unitario::numeric(8,4) from public.fin_estoque_itens where nome = 'Leite integral')$q$, '00000000:LEI>Leite integral*12 00000000:brinde>ignorar*1|4.1667'),
  pg_temp.base()),
('fornecedor é cadastrado pelo CNPJ; a filial reaproveita pela raiz', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf()) || '; perform ' || pg_temp.salvar(pg_temp.nf('{}', 'A2', '00000000000272')),
    $q$(select count(distinct contraparte_id) || '|' || (select string_agg(documento, ',') from public.fin_contrapartes) from public.fin_estoque_notas)$q$, '1|00000000000191'),
  pg_temp.base()),
('criar boletos: contas a pagar previstas na data de entrada, uma por vencimento', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf(pg_temp.criar2())), pg_temp.lancs(),
    '207.50@2026-10-10>2026-11-10:previsto:NF 1:Fornecedor Fictício 207.50@2026-10-10>2026-12-10:previsto:NF 1:Fornecedor Fictício'), pg_temp.base()),
('vencimentos que não somam o total são recusados', 'recusado:fin_estoque_notas_vencimentos_soma', 'equipe',
  'select ' || pg_temp.salvar(pg_temp.nf(pg_temp.fin('{"modo":"criar","conta_caixa_id":"00000000-0000-0000-0000-00000000c101","conta_id":"00000000-0000-0000-0000-00000000f104","duplicatas":[{"vencimento":"2026-11-10","valor":400}]}'))) || '::text',
  pg_temp.base()),
('ligar a um pagamento que já existe', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf(pg_temp.fin('{"modo":"ligar","lancamentos":["00000000-0000-0000-0000-00000000a102"]}'))),
    $q$(select count(*) from public.fin_estoque_notas_lancamentos where lancamento_id = '00000000-0000-0000-0000-00000000a102')$q$, '1'),
  pg_temp.base() || $a$; insert into public.fin_lancamentos (id, empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao)
    values ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-0000000000e1', 'saida', 415, '00000000-0000-0000-0000-00000000c101', '2026-10-10', '2026-10-10', 'realizado', 'Compra');
    insert into public.fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000f104', 415)$a$),
('ligar a um recebimento é recusado', 'recusado:fin_estoque_notas_lancamentos_saida', 'equipe',
  'select ' || pg_temp.salvar(pg_temp.nf(pg_temp.fin('{"modo":"ligar","lancamentos":["00000000-0000-0000-0000-00000000a101"]}'))) || '::text',
  pg_temp.base() || $a$; insert into public.fin_lancamentos (id, empresa_id, direcao, valor_total, conta_caixa_id, data_competencia, data_liquidacao, situacao, descricao)
    values ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-0000000000e1', 'entrada', 415, '00000000-0000-0000-0000-00000000c101', '2026-10-10', '2026-10-10', 'realizado', 'Venda');
    insert into public.fin_contas (id, empresa_id, codigo, nome, tipo, natureza, classificacao, comportamento_caixa, dre_secao) values
    ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000e1', '1.01', 'Vendas', 'analitica', 'receita', 'receita_bruta', 'operacional', 1);
    insert into public.fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000f102', 415)$a$),
('a mesma nota duas vezes é recusada', 'recusado:fin_estoque_notas_chave_unica', 'equipe',
  'do $d$ begin perform ' || pg_temp.salvar(pg_temp.nf()) || '; perform ' || pg_temp.salvar(pg_temp.nf()) || '; end $d$', pg_temp.base()),
('NF-e sem itens é recusada', 'recusado:fin_estoque_notas_sem_itens', 'equipe', 'select ' || pg_temp.salvar(pg_temp.nf('{"itens":[]}')) || '::text', pg_temp.base()),
('NFS-e com itens é recusada', 'recusado:fin_estoque_notas_servico_sem_itens', 'equipe', 'select ' || pg_temp.salvar(pg_temp.nf('{"tipo":"servico","valor_frete":0}')) || '::text', pg_temp.base()),
('item com quantidade zero é recusado', 'recusado:fin_estoque_notas_itens_quantidade_valida', 'equipe',
  'select ' || pg_temp.salvar(pg_temp.nf('{"itens":[{"descricao":"X","quantidade":0,"valor":1}]}')) || '::text', pg_temp.base()),
('empresa com estoque desligado não grava nota', 'recusado:fin_estoque_desligado', 'equipe', 'select ' || pg_temp.salvar(pg_temp.nf('{"itens":[{"descricao":"X","quantidade":1,"valor":1}]}'), 'null', 'e2') || '::text', null),
('cliente com central da A não grava nota', 'sem_permissao', 'cliente_a', 'select ' || pg_temp.salvar(pg_temp.nf()) || '::text',
  pg_temp.base() || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'$a$),
('cliente com central da A só lê as notas, como o resto do financeiro', '1', 'cliente_a', 'select count(*)::text from public.fin_estoque_notas',
  pg_temp.base() || pg_temp.como_equipe() || '; select ' || pg_temp.salvar(pg_temp.nf()) || $a$; update public.empresas set financeiro_na_central = true where id = '00000000-0000-0000-0000-0000000000e1'$a$),
-- Nota paga no cartão: o servidor grava a nota sem pagamento, lança a compra no cartão (fin_lancar_no_cartao, da 0011)
-- e liga as parcelas à nota, como a equipe.
('nota paga no cartão: as parcelas da compra se ligam à nota', 'aceito', 'equipe',
  pg_temp.confere('perform ' || pg_temp.salvar(pg_temp.nf(pg_temp.fin('{"modo":"nenhum"}'))) || $a$;
    perform public.fin_lancar_no_cartao('00000000-0000-0000-0000-00000000ca01', 'saida', 415, '2026-10-09', 2, null, 'NF 1 · Fornecedor Fictício', 'NF 1',
      '[{"conta_id":"00000000-0000-0000-0000-00000000f104","valor":415}]', (select contraparte_id from public.fin_estoque_notas where chave = 'A1'), null, '2026-10-10');
    insert into public.fin_estoque_notas_lancamentos (empresa_id, nota_id, lancamento_id)
      select l.empresa_id, (select id from public.fin_estoque_notas where chave = 'A1'), l.id from public.fin_lancamentos l where l.compra_id is not null$a$,
    pg_temp.lancs(), '207.50@2026-10-10>2026-11-05:previsto:NF 1:Fornecedor Fictício 207.50@2026-10-10>2026-12-05:previsto:NF 1:Fornecedor Fictício'),
  pg_temp.base() || $a$; insert into public.fin_cartoes (id, empresa_id, nome, conta_caixa_id, dia_fechamento, dia_vencimento) values
    ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-0000000000e1', 'Visa empresa', '00000000-0000-0000-0000-00000000c101', 25, 5)$a$),
('sem login (anon) não grava nota', 'sem_permissao', 'anon', $q$select public.fin_estoque_salvar_nota(gen_random_uuid(), null, '{}')::text$q$, null);
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
