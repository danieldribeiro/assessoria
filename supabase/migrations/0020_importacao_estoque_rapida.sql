-- Importações de fichas e de vendas mais rápidas (0019 estourava o tempo limite de 8 s com as fichas da GoCoffee).
-- Causa: a busca do insumo e do produto pelo nome usa lower(btrim(nome)), que não pode passar na frente da regra de acesso
-- (RLS); o banco lia todos os insumos da empresa e checava a permissão de cada um, a cada linha (~25 ms por linha).
-- Agora cada importação lê os insumos e os produtos da empresa uma vez só, num mapa nome → id, e consulta o mapa.
-- Mesmo comportamento da 0019 (mesmas regras, mesmas mensagens, mesmo retorno). Não muda nenhum dado.

create or replace function public.fin_estoque_importar_fichas(p_empresa uuid, p_fichas jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  f record;
  l record;
  v_produto uuid;
  v_item uuid;
  v_chave text;
  v_mapa_itens jsonb;
  v_mapa_produtos jsonb;
  v_produtos_novos integer := 0;
  v_insumos_novos integer := 0;
begin
  if not public.fin_estoque_ligado(p_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if jsonb_typeof(p_fichas) <> 'array' or jsonb_array_length(p_fichas) = 0 then
    raise exception 'A planilha não tem fichas.' using errcode = 'check_violation', constraint = 'fin_estoque_ficha_invalida';
  end if;
  select coalesce(jsonb_object_agg(lower(btrim(nome)), id), '{}') into v_mapa_itens from fin_estoque_itens where empresa_id = p_empresa;
  select coalesce(jsonb_object_agg(lower(btrim(nome)), id), '{}') into v_mapa_produtos from fin_estoque_produtos where empresa_id = p_empresa;

  for f in select e.valor from jsonb_array_elements(p_fichas) e(valor) loop
    v_chave := lower(btrim(f.valor ->> 'produto'));
    v_produto := (v_mapa_produtos ->> v_chave)::uuid;
    if v_produto is null then
      insert into fin_estoque_produtos (empresa_id, nome, categoria)
      values (p_empresa, btrim(f.valor ->> 'produto'), nullif(btrim(f.valor ->> 'categoria'), ''))
      returning id into v_produto;
      v_mapa_produtos := v_mapa_produtos || jsonb_build_object(v_chave, v_produto);
      v_produtos_novos := v_produtos_novos + 1;
    end if;
    delete from fin_estoque_ficha_itens where produto_id = v_produto;
    for l in
      select btrim(i.valor ->> 'insumo') as insumo, coalesce(nullif(btrim(i.valor ->> 'unidade'), ''), 'un') as unidade,
             (i.valor ->> 'quantidade')::numeric as quantidade, i.ordem::int as ordem
        from jsonb_array_elements(f.valor -> 'itens') with ordinality i(valor, ordem)
    loop
      v_item := (v_mapa_itens ->> lower(l.insumo))::uuid;
      if v_item is null then
        insert into fin_estoque_itens (empresa_id, nome, unidade) values (p_empresa, l.insumo, l.unidade) returning id into v_item;
        v_mapa_itens := v_mapa_itens || jsonb_build_object(lower(l.insumo), v_item);
        v_insumos_novos := v_insumos_novos + 1;
      end if;
      insert into fin_estoque_ficha_itens (empresa_id, produto_id, item_id, quantidade, ordem)
      values (p_empresa, v_produto, v_item, l.quantidade, l.ordem)
      on conflict (produto_id, item_id) do update set quantidade = fin_estoque_ficha_itens.quantidade + excluded.quantidade;
    end loop;
  end loop;
  return jsonb_build_object('fichas', jsonb_array_length(p_fichas), 'produtos_novos', v_produtos_novos, 'insumos_novos', v_insumos_novos);
end;
$$;

create or replace function public.fin_estoque_importar_vendas(p_empresa uuid, p_mes date, p_arquivo text, p_itens jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_produto uuid;
  v_chave text;
  v_mapa_produtos jsonb;
  e record;
begin
  if not public.fin_estoque_ligado(p_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O relatório não tem vendas.' using errcode = 'check_violation', constraint = 'fin_estoque_vendas_vazia';
  end if;
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
  return v_id;
end;
$$;

-- create or replace mantém as permissões da 0019 (só authenticated executa).
