-- Dados da empresa preenchidos pelo próprio cliente na central (razão social, CNPJ, inscrições, endereço,
-- contato para notas e o responsável), para a assessoria não ter de pedir e digitar depois.
-- O cliente continua sem gravar direto em nenhuma tabela: tudo passa por estas duas funções, que conferem
-- o acesso à central da empresa e só mexem nos campos do cadastro. Nome, segmento, observações, logo e
-- tudo o mais continuam só com a equipe. Cada mudança cai no histórico (0013) com quem fez.
-- Não muda nenhuma tabela, regra ou dado existente; só acrescenta as funções.

-- Dados do cadastro desta empresa, para a tela "Dados da empresa" da central.
create or replace function public.central_dados_empresa(p_empresa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'nome', e.nome,
    'razao_social', e.razao_social, 'cnpj', e.cnpj,
    'inscricao_municipal', e.inscricao_municipal, 'inscricao_estadual', e.inscricao_estadual,
    'email', e.email, 'telefone', e.telefone,
    'cep', e.cep, 'logradouro', e.logradouro, 'numero', e.numero, 'complemento', e.complemento,
    'bairro', e.bairro, 'cidade', e.cidade, 'uf', e.uf, 'codigo_municipio', e.codigo_municipio,
    'responsavel', (select jsonb_build_object('nome', c.nome, 'cargo', c.cargo, 'telefone', c.telefone, 'email', c.email)
                    from public.contatos c
                    where c.empresa_id = e.id and c.responsavel
                    order by c.criado_em, c.id limit 1))
  from public.empresas e
  where e.id = p_empresa and public.pode_ver_empresa(p_empresa);
$$;

-- Grava o cadastro. Só os campos enviados mudam (vazio limpa o campo); chaves fora da lista são ignoradas.
-- "responsavel" atualiza o primeiro contato marcado como responsável, ou cria um se não houver.
create or replace function public.central_salvar_dados_empresa(p_empresa uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_campos constant text[] := array['razao_social', 'cnpj', 'inscricao_municipal', 'inscricao_estadual', 'email',
    'telefone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'codigo_municipio'];
  v_ufs constant text[] := array['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  v jsonb := '{}';
  r jsonb := '{}';
  k text;
  t text;
  v_novo public.empresas;
  v_resp uuid;
begin
  if p_empresa is null or not public.pode_ver_empresa(p_empresa) then
    raise exception 'Sem acesso a esta empresa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_dados) is distinct from 'object' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;

  foreach k in array v_campos loop
    continue when not p_dados ? k;
    t := nullif(btrim(p_dados ->> k), '');
    if length(t) > 200 then raise exception 'Texto longo demais em %.', k using errcode = '22023'; end if;
    v := v || jsonb_build_object(k, t);
  end loop;

  if v ->> 'cnpj' is not null and length(regexp_replace(v ->> 'cnpj', '\D', '', 'g')) <> 14 then
    raise exception 'O CNPJ precisa ter 14 números.' using errcode = '22023';
  end if;
  if v ->> 'cep' is not null and length(regexp_replace(v ->> 'cep', '\D', '', 'g')) <> 8 then
    raise exception 'O CEP precisa ter 8 números.' using errcode = '22023';
  end if;
  if v ->> 'email' is not null and v ->> 'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail para notas inválido.' using errcode = '22023';
  end if;
  if v ->> 'uf' is not null then
    v := v || jsonb_build_object('uf', upper(v ->> 'uf'));
    if not (v ->> 'uf' = any (v_ufs)) then raise exception 'UF inválida.' using errcode = '22023'; end if;
  end if;

  select * into v_novo from jsonb_populate_record((select e from public.empresas e where e.id = p_empresa), v);
  update public.empresas e set
    razao_social = v_novo.razao_social, cnpj = v_novo.cnpj,
    inscricao_municipal = v_novo.inscricao_municipal, inscricao_estadual = v_novo.inscricao_estadual,
    email = v_novo.email, telefone = v_novo.telefone, cep = v_novo.cep, logradouro = v_novo.logradouro,
    numero = v_novo.numero, complemento = v_novo.complemento, bairro = v_novo.bairro, cidade = v_novo.cidade,
    uf = v_novo.uf, codigo_municipio = v_novo.codigo_municipio
  where e.id = p_empresa
    and (e.razao_social, e.cnpj, e.inscricao_municipal, e.inscricao_estadual, e.email, e.telefone, e.cep,
         e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf, e.codigo_municipio)
        is distinct from
        (v_novo.razao_social, v_novo.cnpj, v_novo.inscricao_municipal, v_novo.inscricao_estadual, v_novo.email,
         v_novo.telefone, v_novo.cep, v_novo.logradouro, v_novo.numero, v_novo.complemento, v_novo.bairro,
         v_novo.cidade, v_novo.uf, v_novo.codigo_municipio);

  if jsonb_typeof(p_dados -> 'responsavel') = 'object' then
    foreach k in array array['nome', 'cargo', 'telefone', 'email'] loop
      t := nullif(btrim(p_dados -> 'responsavel' ->> k), '');
      if length(t) > 200 then raise exception 'Texto longo demais no responsável.' using errcode = '22023'; end if;
      r := r || jsonb_build_object(k, t);
    end loop;
    if r ->> 'email' is not null and r ->> 'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'E-mail do responsável inválido.' using errcode = '22023';
    end if;

    select c.id into v_resp from public.contatos c
    where c.empresa_id = p_empresa and c.responsavel order by c.criado_em, c.id limit 1;

    if r ->> 'nome' is null then
      -- Sem nome não há responsável para criar; com outros campos preenchidos, avisa.
      if coalesce(r ->> 'cargo', r ->> 'telefone', r ->> 'email') is not null then
        raise exception 'Informe o nome do responsável.' using errcode = '22023';
      end if;
    elsif v_resp is null then
      insert into public.contatos (empresa_id, nome, cargo, telefone, email, responsavel)
      values (p_empresa, r ->> 'nome', r ->> 'cargo', r ->> 'telefone', r ->> 'email', true);
    else
      update public.contatos c
      set nome = r ->> 'nome', cargo = r ->> 'cargo', telefone = r ->> 'telefone', email = r ->> 'email'
      where c.id = v_resp
        and (c.nome, c.cargo, c.telefone, c.email) is distinct from (r ->> 'nome', r ->> 'cargo', r ->> 'telefone', r ->> 'email');
    end if;
  end if;
end;
$$;

revoke execute on function public.central_dados_empresa(uuid), public.central_salvar_dados_empresa(uuid, jsonb)
  from public, anon;
grant execute on function public.central_dados_empresa(uuid), public.central_salvar_dados_empresa(uuid, jsonb)
  to authenticated;
