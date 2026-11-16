-- Estoque e CMV, etapa 2: fichas técnicas e vendas do PDV, para o CMV teórico.
-- CMV teórico do mês = soma, em cada produto vendido, de quantidade vendida × custo da ficha técnica.
-- O custo da ficha vem dos insumos (fin_estoque_itens.custo_unitario), então acompanha os custos atuais.
-- Comparado com o CMV real (linha 5 da DRE com a variação de estoque), mostra perdas, desperdício e porções fora da ficha.
-- Depende da 0018 (insumos e chave estoque_ativo). Não muda nenhum dado existente.

-- ---------------------------------------------------------------------------
-- Produtos vendidos e as fichas técnicas
-- ---------------------------------------------------------------------------

-- Produto como aparece no relatório de vendas do PDV (o nome é a ligação entre os meses).
create table public.fin_estoque_produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  categoria text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_estoque_produtos_empresa_id unique (empresa_id, id),
  constraint fin_estoque_produtos_nome_nao_branco check (btrim(nome) <> '')
);
create unique index fin_estoque_produtos_nome_unico on public.fin_estoque_produtos (empresa_id, lower(btrim(nome)));

-- Ficha técnica: quanto de cada insumo vai em uma unidade do produto, na unidade do insumo (kg, un, L, porção...).
create table public.fin_estoque_ficha_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  produto_id uuid not null,
  item_id uuid not null,
  quantidade numeric(14, 6) not null,
  ordem integer not null default 0,
  constraint fin_estoque_ficha_itens_produto foreign key (empresa_id, produto_id)
    references public.fin_estoque_produtos (empresa_id, id) on delete cascade,
  constraint fin_estoque_ficha_itens_item foreign key (empresa_id, item_id) references public.fin_estoque_itens (empresa_id, id),
  constraint fin_estoque_ficha_itens_quantidade_valida check (quantidade > 0),
  constraint fin_estoque_ficha_itens_insumo_unico unique (produto_id, item_id)
);
create index fin_estoque_ficha_itens_item_idx on public.fin_estoque_ficha_itens (item_id);

-- ---------------------------------------------------------------------------
-- Vendas do PDV: um relatório por mês (importar de novo o mesmo mês substitui)
-- ---------------------------------------------------------------------------

create table public.fin_estoque_vendas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  mes date not null,
  arquivo_nome text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_estoque_vendas_empresa_id unique (empresa_id, id),
  constraint fin_estoque_vendas_mes_unico unique (empresa_id, mes),
  constraint fin_estoque_vendas_mes_valido check (extract(day from mes) = 1)
);

create table public.fin_estoque_vendas_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  venda_id uuid not null,
  produto_id uuid,
  nome_origem text not null,
  categoria_origem text,
  quantidade numeric(14, 3) not null,
  valor numeric(14, 2),                    -- total vendido do produto no mês, se o relatório trouxer
  ordem integer not null default 0,
  constraint fin_estoque_vendas_itens_venda foreign key (empresa_id, venda_id)
    references public.fin_estoque_vendas (empresa_id, id) on delete cascade,
  constraint fin_estoque_vendas_itens_produto foreign key (empresa_id, produto_id) references public.fin_estoque_produtos (empresa_id, id),
  constraint fin_estoque_vendas_itens_quantidade_valida check (quantidade >= 0),
  constraint fin_estoque_vendas_itens_nome_nao_branco check (btrim(nome_origem) <> '')
);
create index fin_estoque_vendas_itens_venda_idx on public.fin_estoque_vendas_itens (venda_id, ordem);

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------

create function public.fin_estoque_produtos_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.empresa_id <> old.empresa_id then
    raise exception 'O produto não pode mudar de empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_produtos_empresa_fixa';
  end if;
  return new;
end;
$$;

create trigger fin_estoque_produtos_validar before update on public.fin_estoque_produtos
  for each row execute function public.fin_estoque_produtos_validar();
create trigger tocar_atualizado_em before update on public.fin_estoque_produtos
  for each row execute function public.tocar_atualizado_em();

-- Histórico (0013): produtos e importações de vendas. As linhas das fichas e das vendas ficam fora.
create trigger registrar_historico after insert or update or delete on public.fin_estoque_produtos
  for each row execute function public.registrar_historico();
create trigger registrar_historico after insert or update or delete on public.fin_estoque_vendas
  for each row execute function public.registrar_historico();

-- ---------------------------------------------------------------------------
-- Acesso: igual à 0018. Gravar exige a chave do estoque ligada.
-- ---------------------------------------------------------------------------

alter table public.fin_estoque_produtos enable row level security;
create policy ler on public.fin_estoque_produtos for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_produtos for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_produtos for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_ficha_itens enable row level security;
create policy ler on public.fin_estoque_ficha_itens for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_ficha_itens for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_ficha_itens for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy apagar on public.fin_estoque_ficha_itens for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_vendas enable row level security;
create policy ler on public.fin_estoque_vendas for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_vendas for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy apagar on public.fin_estoque_vendas for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_vendas_itens enable row level security;
create policy ler on public.fin_estoque_vendas_itens for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_vendas_itens for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy apagar on public.fin_estoque_vendas_itens for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Funções (com as permissões de quem chama: RLS vale)
-- ---------------------------------------------------------------------------

-- Produto pelo nome (sem diferença de maiúsculas e espaços nas pontas); cria se não existir.
create function public.fin_estoque_produto_por_nome(p_empresa uuid, p_nome text, p_categoria text)
returns uuid language plpgsql set search_path = public as $$
declare v uuid;
begin
  select id into v from fin_estoque_produtos where empresa_id = p_empresa and lower(btrim(nome)) = lower(btrim(p_nome));
  if v is null then
    insert into fin_estoque_produtos (empresa_id, nome, categoria) values (p_empresa, btrim(p_nome), nullif(btrim(p_categoria), ''))
    returning id into v;
  end if;
  return v;
end;
$$;

-- Troca a ficha de um produto. p_itens: [{ "item_id", "quantidade" }]. Lista vazia = produto sem ficha.
create function public.fin_estoque_salvar_ficha(p_produto uuid, p_itens jsonb)
returns uuid language plpgsql set search_path = public as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from fin_estoque_produtos where id = p_produto;
  if v_empresa is null then
    raise exception 'Produto não encontrado.' using errcode = 'check_violation', constraint = 'fin_estoque_produto_nao_encontrado';
  end if;
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Ficha inválida.' using errcode = 'check_violation', constraint = 'fin_estoque_ficha_invalida';
  end if;
  delete from fin_estoque_ficha_itens where produto_id = p_produto;
  insert into fin_estoque_ficha_itens (empresa_id, produto_id, item_id, quantidade, ordem)
  select v_empresa, p_produto, (e.valor ->> 'item_id')::uuid, (e.valor ->> 'quantidade')::numeric, e.ordem::int
    from jsonb_array_elements(p_itens) with ordinality e(valor, ordem);
  return p_produto;
end;
$$;

-- Importa fichas de uma planilha. p_fichas: [{ "produto", "categoria", "itens": [{ "insumo", "unidade", "quantidade" }] }].
-- Cria o produto e o insumo que não existirem (insumo novo entra sem custo) e troca a ficha de cada produto da lista.
create function public.fin_estoque_importar_fichas(p_empresa uuid, p_fichas jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  f record;
  l record;
  v_produto uuid;
  v_item uuid;
  v_produtos integer := (select count(*) from fin_estoque_produtos where empresa_id = p_empresa);
  v_insumos integer := (select count(*) from fin_estoque_itens where empresa_id = p_empresa);
begin
  if not public.fin_estoque_ligado(p_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if jsonb_typeof(p_fichas) <> 'array' or jsonb_array_length(p_fichas) = 0 then
    raise exception 'A planilha não tem fichas.' using errcode = 'check_violation', constraint = 'fin_estoque_ficha_invalida';
  end if;
  for f in select e.valor from jsonb_array_elements(p_fichas) e(valor) loop
    v_produto := public.fin_estoque_produto_por_nome(p_empresa, f.valor ->> 'produto', f.valor ->> 'categoria');
    delete from fin_estoque_ficha_itens where produto_id = v_produto;
    for l in
      select btrim(i.valor ->> 'insumo') as insumo, coalesce(nullif(btrim(i.valor ->> 'unidade'), ''), 'un') as unidade,
             (i.valor ->> 'quantidade')::numeric as quantidade, i.ordem::int as ordem
        from jsonb_array_elements(f.valor -> 'itens') with ordinality i(valor, ordem)
    loop
      select id into v_item from fin_estoque_itens where empresa_id = p_empresa and lower(btrim(nome)) = lower(l.insumo);
      if v_item is null then
        insert into fin_estoque_itens (empresa_id, nome, unidade) values (p_empresa, l.insumo, l.unidade) returning id into v_item;
      end if;
      insert into fin_estoque_ficha_itens (empresa_id, produto_id, item_id, quantidade, ordem)
      values (p_empresa, v_produto, v_item, l.quantidade, l.ordem)
      on conflict (produto_id, item_id) do update set quantidade = fin_estoque_ficha_itens.quantidade + excluded.quantidade;
    end loop;
  end loop;
  return jsonb_build_object(
    'fichas', jsonb_array_length(p_fichas),
    'produtos_novos', (select count(*) from fin_estoque_produtos where empresa_id = p_empresa) - v_produtos,
    'insumos_novos', (select count(*) from fin_estoque_itens where empresa_id = p_empresa) - v_insumos);
end;
$$;

-- Importa o relatório de vendas de um mês (substitui o que havia nesse mês). p_itens: [{ "nome", "categoria", "quantidade", "valor" }].
-- Cada nome vira (ou reaproveita) um produto; produto novo entra sem ficha.
create function public.fin_estoque_importar_vendas(p_empresa uuid, p_mes date, p_arquivo text, p_itens jsonb)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
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
  insert into fin_estoque_vendas_itens (empresa_id, venda_id, produto_id, nome_origem, categoria_origem, quantidade, valor, ordem)
  select p_empresa, v_id, public.fin_estoque_produto_por_nome(p_empresa, e.valor ->> 'nome', e.valor ->> 'categoria'),
         btrim(e.valor ->> 'nome'), nullif(btrim(e.valor ->> 'categoria'), ''), (e.valor ->> 'quantidade')::numeric,
         (e.valor ->> 'valor')::numeric, e.ordem::int
    from jsonb_array_elements(p_itens) with ordinality e(valor, ordem);
  return v_id;
end;
$$;

revoke execute on function public.fin_estoque_produto_por_nome(uuid, text, text), public.fin_estoque_salvar_ficha(uuid, jsonb),
  public.fin_estoque_importar_fichas(uuid, jsonb), public.fin_estoque_importar_vendas(uuid, date, text, jsonb) from public, anon;
grant execute on function public.fin_estoque_produto_por_nome(uuid, text, text), public.fin_estoque_salvar_ficha(uuid, jsonb),
  public.fin_estoque_importar_fichas(uuid, jsonb), public.fin_estoque_importar_vendas(uuid, date, text, jsonb) to authenticated;
revoke execute on function public.fin_estoque_produtos_validar() from public, anon, authenticated;
