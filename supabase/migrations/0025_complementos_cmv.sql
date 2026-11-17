-- Complementos do CMV do mês: adicionais cobrados à parte (leite de aveia, leite sem lactose, chantilly...) que o
-- relatório de vendas por produto do PDV não traz. São digitados no mês, como linhas das vendas marcadas como complemento,
-- cada uma ligada a um produto com ficha própria (ex.: "Leite de aveia (adicional)" = a dose média de leite de aveia).
-- Entram no CMV teórico e no fechamento do mês como qualquer produto vendido.
-- Importar o relatório do PDV de novo mantém os complementos já digitados. Mês fechado não aceita mudança nos complementos.
-- Não muda nenhum dado existente: as linhas que já existem ficam como não complemento.

alter table public.fin_estoque_vendas_itens add column complemento boolean not null default false;

-- Mês fechado: não entra nem sai linha (fechar e reabrir só alteram as linhas, e apagar o mês já é barrado pela 0023).
create function public.fin_estoque_vendas_itens_proteger()
returns trigger language plpgsql set search_path = public as $$
declare v_venda uuid := case when tg_op = 'DELETE' then old.venda_id else new.venda_id end;
begin
  if exists (select 1 from fin_estoque_vendas where id = v_venda and fechado_em is not null) then
    raise exception 'O CMV deste mês está fechado. Reabra o mês antes de mudar as vendas ou os complementos.'
      using errcode = 'check_violation', constraint = 'fin_estoque_vendas_fechada';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger fin_estoque_vendas_itens_proteger before insert or delete on public.fin_estoque_vendas_itens
  for each row execute function public.fin_estoque_vendas_itens_proteger();
revoke execute on function public.fin_estoque_vendas_itens_proteger() from public, anon, authenticated;

-- Importar de novo o mesmo mês (0020) passa a guardar os complementos e devolvê-los no mês novo.
create or replace function public.fin_estoque_importar_vendas(p_empresa uuid, p_mes date, p_arquivo text, p_itens jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_produto uuid;
  v_chave text;
  v_mapa_produtos jsonb;
  v_complementos jsonb;
  v_ordem integer;
  e record;
begin
  if not public.fin_estoque_ligado(p_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O relatório não tem vendas.' using errcode = 'check_violation', constraint = 'fin_estoque_vendas_vazia';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('produto_id', i.produto_id, 'nome', i.nome_origem, 'categoria', i.categoria_origem,
                                               'quantidade', i.quantidade, 'valor', i.valor) order by i.ordem), '[]')
    into v_complementos
    from fin_estoque_vendas_itens i join fin_estoque_vendas v on v.id = i.venda_id
   where v.empresa_id = p_empresa and v.mes = p_mes and i.complemento;
  delete from fin_estoque_vendas where empresa_id = p_empresa and mes = p_mes;
  insert into fin_estoque_vendas (empresa_id, mes, arquivo_nome) values (p_empresa, p_mes, nullif(btrim(p_arquivo), ''))
  returning id into v_id;
  select coalesce(jsonb_object_agg(lower(btrim(nome)), id), '{}') into v_mapa_produtos from fin_estoque_produtos where empresa_id = p_empresa;

  for e in select x.valor, x.ordem from jsonb_array_elements(p_itens) with ordinality x(valor, ordem) loop
    v_chave := lower(btrim(e.valor ->> 'nome'));
    v_produto := (v_mapa_produtos ->> v_chave)::uuid;
    if v_produto is null then
      insert into fin_estoque_produtos (empresa_id, nome, categoria)
      values (p_empresa, btrim(e.valor ->> 'nome'), nullif(btrim(e.valor ->> 'categoria'), ''))
      returning id into v_produto;
      v_mapa_produtos := v_mapa_produtos || jsonb_build_object(v_chave, v_produto);
    end if;
    insert into fin_estoque_vendas_itens (empresa_id, venda_id, produto_id, nome_origem, categoria_origem, quantidade, valor, ordem)
    values (p_empresa, v_id, v_produto, btrim(e.valor ->> 'nome'), nullif(btrim(e.valor ->> 'categoria'), ''),
            (e.valor ->> 'quantidade')::numeric, (e.valor ->> 'valor')::numeric, e.ordem::int);
  end loop;

  v_ordem := jsonb_array_length(p_itens);
  for e in select x.valor from jsonb_array_elements(v_complementos) x(valor) loop
    v_ordem := v_ordem + 1;
    insert into fin_estoque_vendas_itens (empresa_id, venda_id, produto_id, nome_origem, categoria_origem, quantidade, valor, ordem, complemento)
    values (p_empresa, v_id, (e.valor ->> 'produto_id')::uuid, e.valor ->> 'nome', e.valor ->> 'categoria',
            (e.valor ->> 'quantidade')::numeric, (e.valor ->> 'valor')::numeric, v_ordem, true);
  end loop;
  return v_id;
end;
$$;

-- Grava os complementos de um mês, trocando os que já existiam. p_itens: [{ "nome", "quantidade", "valor" }].
-- Cada nome vira (ou reaproveita) um produto da empresa, na categoria Complementos, onde fica a ficha dele.
create function public.fin_estoque_salvar_complementos(p_venda uuid, p_itens jsonb)
returns integer language plpgsql set search_path = public as $$
declare
  v_empresa uuid;
  v_fechado timestamptz;
  v_produto uuid;
  v_chave text;
  v_nome text;
  v_mapa jsonb;
  v_ordem integer;
  v_qtd integer := 0;
  e record;
begin
  select empresa_id, fechado_em into v_empresa, v_fechado from fin_estoque_vendas where id = p_venda;
  if v_empresa is null then
    raise exception 'Vendas não encontradas.' using errcode = 'check_violation', constraint = 'fin_estoque_vendas_nao_encontrada';
  end if;
  if not public.pode_usar_financeiro(v_empresa, 'lancar') then
    raise exception 'Sem permissão para mudar os complementos desta empresa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.fin_estoque_ligado(v_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if v_fechado is not null then
    raise exception 'O CMV deste mês está fechado. Reabra o mês antes de mudar os complementos.'
      using errcode = 'check_violation', constraint = 'fin_estoque_vendas_fechada';
  end if;
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Complementos inválidos.' using errcode = 'check_violation', constraint = 'fin_estoque_complementos_invalidos';
  end if;

  delete from fin_estoque_vendas_itens where venda_id = p_venda and complemento;
  select coalesce(max(ordem), 0) into v_ordem from fin_estoque_vendas_itens where venda_id = p_venda;
  select coalesce(jsonb_object_agg(lower(btrim(nome)), id), '{}') into v_mapa from fin_estoque_produtos where empresa_id = v_empresa;

  for e in select x.valor from jsonb_array_elements(p_itens) with ordinality x(valor, ordem) order by x.ordem loop
    v_nome := btrim(coalesce(e.valor ->> 'nome', ''));
    if v_nome = '' then
      raise exception 'Informe o nome de cada complemento.' using errcode = 'check_violation', constraint = 'fin_estoque_vendas_itens_nome_nao_branco';
    end if;
    v_chave := lower(v_nome);
    v_produto := (v_mapa ->> v_chave)::uuid;
    if v_produto is null then
      insert into fin_estoque_produtos (empresa_id, nome, categoria) values (v_empresa, v_nome, 'Complementos') returning id into v_produto;
      v_mapa := v_mapa || jsonb_build_object(v_chave, v_produto);
    end if;
    v_ordem := v_ordem + 1;
    insert into fin_estoque_vendas_itens (empresa_id, venda_id, produto_id, nome_origem, categoria_origem, quantidade, valor, ordem, complemento)
    values (v_empresa, p_venda, v_produto, v_nome, 'Complementos', (e.valor ->> 'quantidade')::numeric, (e.valor ->> 'valor')::numeric, v_ordem, true);
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end;
$$;

revoke execute on function public.fin_estoque_salvar_complementos(uuid, jsonb) from public, anon;
grant execute on function public.fin_estoque_salvar_complementos(uuid, jsonb) to authenticated;
