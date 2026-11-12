-- Testes da 0016 (dados da empresa preenchidos pelo cliente na central). Usa os dados fictícios das empresas
-- de teste: cliente_a tem acesso à Clínica Teste A (e1); cliente_b não tem acesso a nenhuma.
-- Cada caso roda uma ação como uma pessoa e depois uma conferência, dentro de uma subtransação desfeita no fim:
-- nada fica gravado. Devolve um JSON com passaram, total e cada caso.

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
    when invalid_parameter_value then
      v := 'erro:' || sqlerrm;
    when raise_exception then
      if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  perform pg_temp.como(null);
  return v;
end;
$$;

-- Atalhos: id fictício, salvar como a pessoa e ler o cadastro como dono.
create or replace function pg_temp.id(p text) returns text language sql as $$ select '00000000-0000-0000-0000-00000000' || p $$;
create or replace function pg_temp.salvar(p_empresa text, p_dados text) returns text language sql as $$
  select format('select public.central_salvar_dados_empresa(%L, %L::jsonb)', pg_temp.id(p_empresa), p_dados);
$$;
-- Prepara um dado como dono e volta a ser o cliente A (para casos em que o cliente age depois).
create or replace function pg_temp.como_dono(p_sql text) returns text language sql as $$
  select format('select pg_temp.como(null); %s; select pg_temp.como(%L); ', p_sql, 'cliente_a');
$$;
create or replace function pg_temp.campos(p_empresa text, p_campos text) returns text language sql as $$
  select format('select concat_ws(%L, %s) from public.empresas where id = %L', '|', p_campos, pg_temp.id(p_empresa));
$$;
create or replace function pg_temp.responsaveis(p_empresa text) returns text language sql as $$
  select format('select count(*) || %L || coalesce(string_agg(concat_ws(%L, nome, cargo, telefone, email), %L), %L) from public.contatos where empresa_id = %L and responsavel',
                ':', '/', ';', '', pg_temp.id(p_empresa));
$$;

insert into _casos (caso, esperado, pessoa, acao, checa, checa_como) values
-- Leitura
('cliente lê o cadastro da própria empresa', 'Clínica Teste A|nulo-cnpj', 'cliente_a', null,
  format('select (d ->> %L) || %L || coalesce(d ->> %L, %L) from public.central_dados_empresa(%L) d', 'nome', '|', 'cnpj', 'nulo-cnpj', pg_temp.id('00e1')), 'cliente_a'),
('cliente não lê o cadastro de outra empresa', 'nulo', 'cliente_b', null,
  format('select public.central_dados_empresa(%L)::text', pg_temp.id('00e1')), 'cliente_b'),
('sem login não chama as funções', 'sem_permissao', null, null,
  format('select public.central_dados_empresa(%L)::text', pg_temp.id('00e1')), 'anon'),
('sem login não grava', 'sem_permissao', null, null, pg_temp.salvar('00e1', '{"cnpj": "11222333000181"}'), 'anon'),

-- Gravação do cadastro
('cliente grava os dados fiscais e o endereço', '11.222.333/0001-81|Clínica A Ltda|Isento|SP|01001-000|Praça da Sé', 'cliente_a',
  pg_temp.salvar('00e1', '{"cnpj": "11.222.333/0001-81", "razao_social": " Clínica A Ltda ", "inscricao_estadual": "Isento", "uf": "sp", "cep": "01001-000", "logradouro": "Praça da Sé"}'),
  pg_temp.campos('00e1', 'cnpj, razao_social, inscricao_estadual, uf, cep, logradouro'), null),
('campos não enviados ficam como estavam', 'Rua Velha|Clínica Nova', 'cliente_a',
  pg_temp.como_dono(format('update public.empresas set logradouro = %L where id = %L', 'Rua Velha', pg_temp.id('00e1'))) || pg_temp.salvar('00e1', '{"razao_social": "Clínica Nova"}'),
  pg_temp.campos('00e1', 'logradouro, razao_social'), null),
('campo vazio limpa o valor', 'nulo', 'cliente_a',
  pg_temp.como_dono(format('update public.empresas set complemento = %L where id = %L', 'Sala 1', pg_temp.id('00e1'))) || pg_temp.salvar('00e1', '{"complemento": "  "}'),
  format('select complemento from public.empresas where id = %L', pg_temp.id('00e1')), null),
('cliente não muda nome, segmento nem observações', 'Clínica Teste A|Odontologia|nulo', 'cliente_a',
  pg_temp.salvar('00e1', '{"nome": "Outro", "segmento": "Outro", "observacoes": "x", "financeiro_na_central": true}'),
  pg_temp.campos('00e1', 'nome, segmento, coalesce(observacoes, ''nulo'')'), null),
('chave do financeiro continua desligada', 'false', 'cliente_a',
  pg_temp.salvar('00e1', '{"financeiro_na_central": true}'),
  format('select financeiro_na_central::text from public.empresas where id = %L', pg_temp.id('00e1')), null),
('cliente não grava em outra empresa', 'sem_permissao', 'cliente_b', null, pg_temp.salvar('00e1', '{"cnpj": "11222333000181"}'), 'cliente_b'),
('cliente com acesso a A não grava em B', 'sem_permissao', 'cliente_a', null, pg_temp.salvar('00e2', '{"cnpj": "11222333000181"}'), 'cliente_a'),
('cliente continua sem update direto na tabela', '0', 'cliente_a',
  format('update public.empresas set cnpj = %L where id = %L', '99', pg_temp.id('00e1')),
  format('select count(*)::text from public.empresas where cnpj = %L', '99'), null),
('equipe também grava pela função', 'Clínica da Equipe', 'equipe',
  pg_temp.salvar('00e1', '{"razao_social": "Clínica da Equipe"}'), pg_temp.campos('00e1', 'razao_social'), null),

-- Conferências
('CNPJ com número faltando é recusado', 'erro:O CNPJ precisa ter 14 números.', 'cliente_a', null, pg_temp.salvar('00e1', '{"cnpj": "1122233300018"}'), 'cliente_a'),
('CEP com número faltando é recusado', 'erro:O CEP precisa ter 8 números.', 'cliente_a', null, pg_temp.salvar('00e1', '{"cep": "0100100"}'), 'cliente_a'),
('e-mail sem @ é recusado', 'erro:E-mail para notas inválido.', 'cliente_a', null, pg_temp.salvar('00e1', '{"email": "notas.clinica.com"}'), 'cliente_a'),
('UF que não existe é recusada', 'erro:UF inválida.', 'cliente_a', null, pg_temp.salvar('00e1', '{"uf": "XX"}'), 'cliente_a'),
('texto longo demais é recusado', 'erro:Texto longo demais em bairro.', 'cliente_a', null,
  pg_temp.salvar('00e1', '{"bairro": "' || repeat('a', 201) || '"}'), 'cliente_a'),
('dados que não são objeto são recusados', 'erro:Dados inválidos.', 'cliente_a', null, pg_temp.salvar('00e1', '[1]'), 'cliente_a'),
('recusa não grava nada', 'nulo', 'cliente_a',
  format('do $d$ begin perform public.central_salvar_dados_empresa(%L, %L::jsonb); exception when invalid_parameter_value then null; end $d$',
         pg_temp.id('00e1'), '{"razao_social": "Não Pode", "cnpj": "123"}'),
  format('select razao_social from public.empresas where id = %L', pg_temp.id('00e1')), null),

-- Responsável
('cria o responsável quando não há', '1:Ana/Sócia/(54) 99999-0000/ana@clinica.com', 'cliente_a',
  pg_temp.salvar('00e1', '{"responsavel": {"nome": "Ana", "cargo": "Sócia", "telefone": "(54) 99999-0000", "email": "ana@clinica.com"}}'),
  pg_temp.responsaveis('00e1'), null),
('atualiza o responsável que já existe, sem duplicar', '1:Bia/Gerente', 'cliente_a',
  pg_temp.como_dono(format('insert into public.contatos (empresa_id, nome, responsavel) values (%L, %L, true)', pg_temp.id('00e1'), 'Ana'))
    || pg_temp.salvar('00e1', '{"responsavel": {"nome": "Bia", "cargo": "Gerente"}}'),
  pg_temp.responsaveis('00e1'), null),
('outros contatos não mudam', 'Carlos|f', 'cliente_a',
  pg_temp.como_dono(format('insert into public.contatos (empresa_id, nome) values (%L, %L)', pg_temp.id('00e1'), 'Carlos'))
    || pg_temp.salvar('00e1', '{"responsavel": {"nome": "Bia"}}'),
  format('select concat_ws(%L, nome, responsavel) from public.contatos where empresa_id = %L and not responsavel', '|', pg_temp.id('00e1')), null),
('responsável todo vazio não cria nada', '0:', 'cliente_a',
  pg_temp.salvar('00e1', '{"responsavel": {"nome": "", "cargo": " "}}'), pg_temp.responsaveis('00e1'), null),
('responsável sem nome e com telefone é recusado', 'erro:Informe o nome do responsável.', 'cliente_a', null,
  pg_temp.salvar('00e1', '{"responsavel": {"telefone": "54 9999"}}'), 'cliente_a'),
('e-mail do responsável inválido é recusado', 'erro:E-mail do responsável inválido.', 'cliente_a', null,
  pg_temp.salvar('00e1', '{"responsavel": {"nome": "Ana", "email": "ana"}}'), 'cliente_a'),
('cliente lê o responsável', 'Ana', 'cliente_a',
  pg_temp.salvar('00e1', '{"responsavel": {"nome": "Ana"}}'),
  format('select d -> %L ->> %L from public.central_dados_empresa(%L) d', 'responsavel', 'nome', pg_temp.id('00e1')), 'cliente_a'),

-- Histórico (0013)
('mudança do cliente cai no histórico com quem fez', 'empresas|alterado|t|11.222.333/0001-81', 'cliente_a',
  pg_temp.salvar('00e1', '{"cnpj": "11.222.333/0001-81"}'),
  format('select concat_ws(%L, tabela, acao, por = %L, depois ->> %L) from public.historico order by id desc limit 1', '|', pg_temp.id('00c1'), 'cnpj'), null),
('salvar sem mudar nada não registra no histórico', '1', 'cliente_a',
  pg_temp.salvar('00e1', '{"cnpj": "11.222.333/0001-81"}') || '; ' || pg_temp.salvar('00e1', '{"cnpj": "11.222.333/0001-81"}'),
  'select count(*)::text from public.historico', null),
('cliente continua sem ler o histórico', '0', 'cliente_a',
  pg_temp.salvar('00e1', '{"cnpj": "11.222.333/0001-81"}'), 'select count(*)::text from public.historico', 'cliente_a');

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
