-- Notas de compra (etapa 3 do estoque): a NF-e de mercadoria e a NFS-e que vem junto (ex.: franquia que cobra parte do preço
-- como serviço), com os itens ligados aos insumos. Delas sai o custo médio de cada insumo; os boletos viram contas a pagar
-- (ou se ligam às que já existem).
--   * Data de entrada: é a competência da compra e a data que vale para o custo médio.
--   * Custo de cada item = valor do item (produto − desconto + outras despesas + seguro + IPI + ICMS ST)
--                          + parte da NFS-e ligada à nota (na proporção do valor dos itens)
--                          + parte do frete da remessa (notas com a mesma remessa dividem o frete, na proporção do valor).
--   * Custo médio do insumo = (quantidade e custo da última contagem fechada + compras com entrada depois dela)
--                             ÷ quantidade total. Recomeça a cada contagem fechada. Sem compra depois da contagem, volta ao
--                             custo da contagem; sem contagem nem compra, o custo do insumo não muda.
--   * As compras da DRE continuam sendo os lançamentos (contas a pagar). A nota não lança nada sozinha: na gravação se escolhe
--     criar os boletos como contas a pagar previstas, ligar a lançamentos que já existem, ou deixar sem financeiro.
-- Não muda nenhum dado existente. Meses de CMV fechados e contagens fechadas não mudam (o custo deles já está gravado).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.fin_estoque_notas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  tipo text not null,                      -- produto (NF-e) ou servico (NFS-e)
  chave text,                              -- chave de acesso da NF-e (44 dígitos) ou identificação da NFS-e
  numero text,
  serie text,
  emissao date,
  entrada date not null,                   -- data de entrada no estoque = competência
  contraparte_id uuid,
  emitente_documento text,
  emitente_nome text not null,
  valor_total numeric(14, 2) not null,
  valor_frete numeric(14, 2) not null default 0,
  nota_produto_id uuid references public.fin_estoque_notas (id) on delete set null, -- NFS-e: a NF-e a que se refere
  remessa text,                            -- notas da mesma entrega dividem o frete
  origem text not null default 'manual',
  arquivo_nome text,
  informacoes text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_estoque_notas_empresa_id unique (empresa_id, id),
  constraint fin_estoque_notas_contraparte foreign key (empresa_id, contraparte_id) references public.fin_contrapartes (empresa_id, id),
  constraint fin_estoque_notas_tipo_valido check (tipo in ('produto', 'servico')),
  constraint fin_estoque_notas_origem_valida check (origem in ('xml', 'manual')),
  constraint fin_estoque_notas_emitente_nao_branco check (btrim(emitente_nome) <> ''),
  constraint fin_estoque_notas_valor_valido check (valor_total > 0),
  constraint fin_estoque_notas_frete_valido check (valor_frete >= 0 and (tipo = 'produto' or valor_frete = 0)),
  constraint fin_estoque_notas_servico_sem_remessa check (tipo = 'produto' or remessa is null),
  constraint fin_estoque_notas_produto_sem_referencia check (tipo = 'servico' or nota_produto_id is null)
);
create unique index fin_estoque_notas_chave_unica on public.fin_estoque_notas (empresa_id, tipo, chave) where chave is not null;
create index fin_estoque_notas_entrada_idx on public.fin_estoque_notas (empresa_id, entrada desc);
create index fin_estoque_notas_remessa_idx on public.fin_estoque_notas (empresa_id, remessa) where remessa is not null;
create index fin_estoque_notas_referencia_idx on public.fin_estoque_notas (nota_produto_id) where nota_produto_id is not null;

create table public.fin_estoque_notas_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nota_id uuid not null,
  ordem integer not null default 0,
  codigo text,
  descricao text not null,
  unidade text,
  quantidade numeric(14, 4) not null,      -- na unidade da nota
  valor numeric(14, 2) not null,           -- valor do item, sem frete e sem serviço
  servico numeric(14, 2) not null default 0, -- parte da NFS-e (calculada)
  frete numeric(14, 2) not null default 0,   -- parte do frete da remessa (calculada)
  custo numeric(14, 2) generated always as (valor + servico + frete) stored,
  item_id uuid,                            -- o insumo; vazio = não é insumo (não entra no custo médio)
  fator numeric(14, 4) not null default 1, -- quantas unidades do insumo vêm em 1 unidade da nota (ex.: caixa com 12 → 12)
  constraint fin_estoque_notas_itens_nota foreign key (empresa_id, nota_id) references public.fin_estoque_notas (empresa_id, id) on delete cascade,
  constraint fin_estoque_notas_itens_item foreign key (empresa_id, item_id) references public.fin_estoque_itens (empresa_id, id),
  constraint fin_estoque_notas_itens_descricao_nao_branca check (btrim(descricao) <> ''),
  constraint fin_estoque_notas_itens_quantidade_valida check (quantidade > 0),
  constraint fin_estoque_notas_itens_valor_valido check (valor >= 0),
  constraint fin_estoque_notas_itens_fator_valido check (fator > 0)
);
create index fin_estoque_notas_itens_nota_idx on public.fin_estoque_notas_itens (nota_id, ordem);
create index fin_estoque_notas_itens_item_idx on public.fin_estoque_notas_itens (empresa_id, item_id) where item_id is not null;

-- De-para: o código (ou a descrição) do item no fornecedor → o insumo, para a próxima nota já vir ligada.
-- O fornecedor é a raiz do CNPJ (8 dígitos): matriz e filiais usam os mesmos códigos.
create table public.fin_estoque_depara (
  empresa_id uuid not null references public.empresas (id),
  fornecedor text not null,
  chave text not null,                     -- código do item, ou a descrição em minúsculas quando não há código
  item_id uuid,
  fator numeric(14, 4) not null default 1,
  ignorar boolean not null default false,  -- não é insumo
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, fornecedor, chave),
  constraint fin_estoque_depara_item foreign key (empresa_id, item_id) references public.fin_estoque_itens (empresa_id, id) on delete cascade,
  constraint fin_estoque_depara_coerente check (ignorar = (item_id is null)),
  constraint fin_estoque_depara_fator_valido check (fator > 0)
);

-- Lançamentos (boletos) da nota. Um lançamento pode pagar mais de uma nota (ex.: boleto único da NF-e com a NFS-e).
create table public.fin_estoque_notas_lancamentos (
  empresa_id uuid not null,
  nota_id uuid not null,
  lancamento_id uuid not null,
  primary key (nota_id, lancamento_id),
  constraint fin_estoque_notas_lancamentos_nota foreign key (empresa_id, nota_id) references public.fin_estoque_notas (empresa_id, id) on delete cascade,
  constraint fin_estoque_notas_lancamentos_lancamento foreign key (empresa_id, lancamento_id) references public.fin_lancamentos (empresa_id, id)
);
create index fin_estoque_notas_lancamentos_lancamento_idx on public.fin_estoque_notas_lancamentos (lancamento_id);

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------

-- A nota não muda de empresa nem de tipo; a NFS-e só se liga a NF-e da mesma empresa.
create function public.fin_estoque_notas_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.empresa_id, new.tipo) is distinct from (old.empresa_id, old.tipo) then
    raise exception 'A nota não muda de empresa nem de tipo.' using errcode = 'check_violation', constraint = 'fin_estoque_notas_fixa';
  end if;
  if new.nota_produto_id is not null and not exists (
       select 1 from fin_estoque_notas where id = new.nota_produto_id and empresa_id = new.empresa_id and tipo = 'produto') then
    raise exception 'A nota de serviço só se liga a uma NF-e de produtos da mesma empresa.'
      using errcode = 'check_violation', constraint = 'fin_estoque_notas_referencia_valida';
  end if;
  return new;
end;
$$;
create trigger fin_estoque_notas_validar before insert or update on public.fin_estoque_notas
  for each row execute function public.fin_estoque_notas_validar();
create trigger tocar_atualizado_em before update on public.fin_estoque_notas
  for each row execute function public.tocar_atualizado_em();
create trigger registrar_historico after insert or update or delete on public.fin_estoque_notas
  for each row execute function public.registrar_historico();

-- O lançamento ligado é uma saída da mesma empresa.
create function public.fin_estoque_notas_lancamentos_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from fin_lancamentos where id = new.lancamento_id and empresa_id = new.empresa_id and direcao = 'saida') then
    raise exception 'A nota só se liga a pagamentos (saídas) da mesma empresa.'
      using errcode = 'check_violation', constraint = 'fin_estoque_notas_lancamentos_saida';
  end if;
  return new;
end;
$$;
create trigger fin_estoque_notas_lancamentos_validar before insert or update on public.fin_estoque_notas_lancamentos
  for each row execute function public.fin_estoque_notas_lancamentos_validar();

-- ---------------------------------------------------------------------------
-- Acesso: mesma regra do estoque. Gravar exige a chave da empresa ligada.
-- ---------------------------------------------------------------------------

alter table public.fin_estoque_notas enable row level security;
create policy ler on public.fin_estoque_notas for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_notas for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_notas for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy apagar on public.fin_estoque_notas for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_notas_itens enable row level security;
create policy ler on public.fin_estoque_notas_itens for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_notas_itens for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_notas_itens for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy apagar on public.fin_estoque_notas_itens for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_depara enable row level security;
create policy ler on public.fin_estoque_depara for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_depara for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_depara for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy apagar on public.fin_estoque_depara for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_notas_lancamentos enable row level security;
create policy ler on public.fin_estoque_notas_lancamentos for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_notas_lancamentos for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy apagar on public.fin_estoque_notas_lancamentos for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Rateio e custo médio
-- ---------------------------------------------------------------------------

-- Divide p_total entre as linhas na proporção do peso, em centavos, sem perder centavo (as sobras vão para as maiores frações;
-- empate: a ordem). Pesos todos zero: por igual. Mesma regra de ratearCentavos (src/lib/financeiro/notas.ts).
create function public.fin_estoque_ratear(p_total numeric, p_pesos numeric[])
returns numeric[] language sql immutable set search_path = public as $$
  with base as (
    select o as i, greatest(coalesce(p, 0), 0) as p from unnest(p_pesos) with ordinality u(p, o)
  ), usado as (
    select i, case when (select sum(p) from base) > 0 then p else 1 end as p from base
  ), bruto as (
    select i, round(abs(p_total) * 100) * p / (select sum(p) from usado) as b from usado
  ), partes as (
    select i, floor(b) as piso, b - floor(b) as fracao,
           row_number() over (order by b - floor(b) desc, i) as pos
      from bruto
  )
  select coalesce(array_agg(((piso + case when pos <= round(abs(p_total) * 100) - (select sum(piso) from partes) then 1 else 0 end)
                             * sign(p_total) / 100)::numeric(14, 2) order by i), '{}')
    from partes;
$$;

-- Refaz a parte do serviço e do frete nos itens das notas de produto informadas (e das notas da mesma remessa).
create function public.fin_estoque_notas_ratear(p_empresa uuid, p_notas uuid[])
returns void language plpgsql set search_path = public as $$
declare
  v_notas uuid[];
  v_nota uuid;
  v_grupo uuid[];
  v_partes numeric[];
  v_ids uuid[];
  v_total numeric;
  v_feitas uuid[] := '{}';
begin
  -- As notas de produto pedidas + as da mesma remessa.
  select coalesce(array_agg(distinct n.id), '{}') into v_notas
    from fin_estoque_notas n
   where n.empresa_id = p_empresa and n.tipo = 'produto'
     and (n.id = any (p_notas)
          or n.remessa in (select r.remessa from fin_estoque_notas r where r.id = any (p_notas) and r.remessa is not null and r.empresa_id = p_empresa));

  foreach v_nota in array v_notas loop
    -- Serviço: as NFS-e ligadas a esta nota, rateadas entre os itens dela.
    select coalesce(sum(valor_total), 0) into v_total from fin_estoque_notas where nota_produto_id = v_nota;
    select array_agg(id order by ordem, id), array_agg(valor order by ordem, id) into v_ids, v_partes
      from fin_estoque_notas_itens where nota_id = v_nota;
    if v_ids is not null then
      v_partes := public.fin_estoque_ratear(v_total, v_partes);
      update fin_estoque_notas_itens i set servico = x.parte
        from unnest(v_ids, v_partes) x(id, parte) where i.id = x.id and i.servico is distinct from x.parte;
    end if;

    -- Frete: o da remessa inteira (ou só o desta nota), rateado entre todos os itens da remessa.
    if v_nota = any (v_feitas) then continue; end if;
    select coalesce(array_agg(n.id), array[v_nota]) into v_grupo
      from fin_estoque_notas n, fin_estoque_notas a
     where a.id = v_nota and n.empresa_id = a.empresa_id and n.tipo = 'produto'
       and (n.id = a.id or (a.remessa is not null and n.remessa = a.remessa));
    v_feitas := v_feitas || v_grupo;
    select coalesce(sum(valor_frete), 0) into v_total from fin_estoque_notas where id = any (v_grupo);
    select array_agg(i.id order by n.entrada, n.chave, n.criado_em, n.id, i.ordem, i.id), array_agg(i.valor order by n.entrada, n.chave, n.criado_em, n.id, i.ordem, i.id)
      into v_ids, v_partes
      from fin_estoque_notas_itens i join fin_estoque_notas n on n.id = i.nota_id
     where i.nota_id = any (v_grupo);
    if v_ids is not null then
      v_partes := public.fin_estoque_ratear(v_total, v_partes);
      update fin_estoque_notas_itens i set frete = x.parte
        from unnest(v_ids, v_partes) x(id, parte) where i.id = x.id and i.frete is distinct from x.parte;
    end if;
  end loop;
end;
$$;

-- Custo médio de um insumo: a última contagem fechada (quantidade × custo gravado) + as compras com entrada depois dela.
-- Nulo quando não há nem contagem com o insumo nem compra: aí o custo do insumo fica como está.
create function public.fin_estoque_custo_medio(p_empresa uuid, p_item uuid)
returns numeric language sql stable set search_path = public as $$
  with contagem as (
    select c.id, c.data from fin_estoque_contagens c
     where c.empresa_id = p_empresa and c.situacao = 'fechada' order by c.data desc limit 1
  ), inicial as (
    select coalesce(sum(l.quantidade), 0) as qtd,
           coalesce(sum(l.quantidade * coalesce(l.custo_unitario, 0)), 0) as valor,
           max(l.custo_unitario) filter (where l.custo_unitario is not null) as custo
      from fin_estoque_contagem_itens l join contagem c on c.id = l.contagem_id
     where l.item_id = p_item
  ), compras as (
    select coalesce(sum(i.quantidade * i.fator), 0) as qtd, coalesce(sum(i.custo), 0) as valor, count(*) as linhas
      from fin_estoque_notas_itens i join fin_estoque_notas n on n.id = i.nota_id
     where i.empresa_id = p_empresa and i.item_id = p_item
       and n.entrada > coalesce((select data from contagem), '-infinity'::date)
  )
  select case
           when compras.linhas > 0 and inicial.qtd + compras.qtd > 0
             then round((inicial.valor + compras.valor) / (inicial.qtd + compras.qtd), 4)
           when compras.linhas = 0 then inicial.custo
         end
    from inicial, compras;
$$;

-- Grava o custo médio nos insumos informados (o custo que as fichas e as próximas contagens usam).
create function public.fin_estoque_atualizar_custos(p_empresa uuid, p_itens uuid[])
returns integer language plpgsql set search_path = public as $$
declare v_qtd integer;
begin
  update fin_estoque_itens i set custo_unitario = m.custo
    from (select x.id, public.fin_estoque_custo_medio(p_empresa, x.id) as custo from unnest(p_itens) x(id)) m
   where i.id = m.id and i.empresa_id = p_empresa and m.custo is not null and i.custo_unitario is distinct from m.custo;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gravar e apagar nota
-- ---------------------------------------------------------------------------

-- Grava uma nota (nova, ou trocando a existente em p_id) com os itens, o de-para e o financeiro, numa transação só.
-- p_nota: { tipo, chave, numero, serie, emissao, entrada, contraparte_id, emitente_documento, emitente_nome, valor_total,
--           valor_frete, nota_produto_id, remessa, origem, arquivo_nome, informacoes, observacoes,
--           itens: [{ codigo, descricao, unidade, quantidade, valor, item_id, fator, criar_insumo: { nome, unidade, categoria } }],
--           financeiro: { modo: "criar" | "ligar" | "nenhum" | "manter", conta_caixa_id, conta_id,
--                         duplicatas: [{ numero, vencimento, valor }], lancamentos: [uuid] } }
-- Roda com as permissões de quem chama (RLS vale).
create function public.fin_estoque_salvar_nota(p_empresa uuid, p_id uuid, p_nota jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid := p_id;
  v_tipo text := p_nota ->> 'tipo';
  v_doc text := nullif(regexp_replace(coalesce(p_nota ->> 'emitente_documento', ''), '\D', '', 'g'), '');
  v_fornecedor text;
  v_nome text := btrim(coalesce(p_nota ->> 'emitente_nome', ''));
  v_contraparte uuid := nullif(p_nota ->> 'contraparte_id', '')::uuid;
  v_fin jsonb := coalesce(p_nota -> 'financeiro', '{"modo":"nenhum"}');
  v_modo text;
  v_antigos uuid[] := '{}';
  v_notas_ratear uuid[] := '{}';
  v_itens uuid[];
  v_item uuid;
  v_chave text;
  v_ordem integer := 0;
  v_soma numeric;
  v_qtd integer;
  v_numero text;
  v_valor numeric;
  e record;
  d record;
begin
  if not public.pode_usar_financeiro(p_empresa, 'lancar') then
    raise exception 'Sem permissão para lançar notas nesta empresa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.fin_estoque_ligado(p_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if jsonb_typeof(p_nota -> 'itens') is distinct from 'array' then
    raise exception 'Nota inválida.' using errcode = 'check_violation', constraint = 'fin_estoque_notas_invalida';
  end if;
  if v_tipo = 'produto' and jsonb_array_length(p_nota -> 'itens') = 0 then
    raise exception 'A nota de produtos precisa de ao menos um item.' using errcode = 'check_violation', constraint = 'fin_estoque_notas_sem_itens';
  end if;
  if v_tipo = 'servico' and jsonb_array_length(p_nota -> 'itens') > 0 then
    raise exception 'A nota de serviço não tem itens: o valor dela é rateado entre os itens da NF-e ligada.'
      using errcode = 'check_violation', constraint = 'fin_estoque_notas_servico_sem_itens';
  end if;
  v_fornecedor := case when length(v_doc) = 14 then left(v_doc, 8) else coalesce(v_doc, '') end;

  -- Fornecedor: o informado, ou o cadastrado com o mesmo CNPJ (ou a mesma raiz), ou o mesmo nome; senão, cadastra.
  if v_contraparte is null and v_nome <> '' then
    select id into v_contraparte from fin_contrapartes
     where empresa_id = p_empresa and v_doc is not null
       and (documento = v_doc or (length(v_doc) = 14 and left(documento, 8) = left(v_doc, 8)))
     order by (documento = v_doc) desc, ativa desc, nome limit 1;
    if v_contraparte is null then
      select id into v_contraparte from fin_contrapartes where empresa_id = p_empresa and lower(btrim(nome)) = lower(v_nome);
    end if;
    if v_contraparte is null then
      insert into fin_contrapartes (empresa_id, nome, tipo, documento)
      values (p_empresa, v_nome, 'fornecedor', case when length(v_doc) in (11, 14) then v_doc end)
      returning id into v_contraparte;
    end if;
  end if;

  if v_id is null then
    insert into fin_estoque_notas (empresa_id, tipo, chave, numero, serie, emissao, entrada, contraparte_id, emitente_documento, emitente_nome,
                                   valor_total, valor_frete, nota_produto_id, remessa, origem, arquivo_nome, informacoes, observacoes)
    values (p_empresa, v_tipo, nullif(btrim(p_nota ->> 'chave'), ''), nullif(btrim(p_nota ->> 'numero'), ''), nullif(btrim(p_nota ->> 'serie'), ''),
            (p_nota ->> 'emissao')::date, (p_nota ->> 'entrada')::date, v_contraparte, v_doc, v_nome,
            (p_nota ->> 'valor_total')::numeric, coalesce((p_nota ->> 'valor_frete')::numeric, 0), nullif(p_nota ->> 'nota_produto_id', '')::uuid,
            nullif(btrim(p_nota ->> 'remessa'), ''), coalesce(p_nota ->> 'origem', 'manual'), nullif(btrim(p_nota ->> 'arquivo_nome'), ''),
            nullif(btrim(p_nota ->> 'informacoes'), ''), nullif(btrim(p_nota ->> 'observacoes'), ''))
    returning id into v_id;
  else
    -- O que a versão anterior afetava também é refeito: as notas de produto ligadas e os insumos dos itens antigos.
    select coalesce(array_agg(distinct item_id) filter (where item_id is not null), '{}') into v_antigos from fin_estoque_notas_itens where nota_id = v_id;
    select array_remove(array[n.id, n.nota_produto_id] || coalesce(array_agg(r.id), '{}'), null) into v_notas_ratear
      from fin_estoque_notas n left join fin_estoque_notas r on r.empresa_id = n.empresa_id and r.remessa = n.remessa and n.remessa is not null
     where n.id = v_id and n.empresa_id = p_empresa group by n.id, n.nota_produto_id;
    if v_notas_ratear is null then
      raise exception 'Nota não encontrada.' using errcode = 'check_violation', constraint = 'fin_estoque_notas_nao_encontrada';
    end if;
    update fin_estoque_notas set chave = nullif(btrim(p_nota ->> 'chave'), ''), numero = nullif(btrim(p_nota ->> 'numero'), ''),
           serie = nullif(btrim(p_nota ->> 'serie'), ''), emissao = (p_nota ->> 'emissao')::date, entrada = (p_nota ->> 'entrada')::date,
           contraparte_id = v_contraparte, emitente_documento = v_doc, emitente_nome = v_nome,
           valor_total = (p_nota ->> 'valor_total')::numeric, valor_frete = coalesce((p_nota ->> 'valor_frete')::numeric, 0),
           nota_produto_id = nullif(p_nota ->> 'nota_produto_id', '')::uuid, remessa = nullif(btrim(p_nota ->> 'remessa'), ''),
           observacoes = nullif(btrim(p_nota ->> 'observacoes'), ''), tipo = v_tipo
     where id = v_id;
    delete from fin_estoque_notas_itens where nota_id = v_id;
  end if;

  -- Itens: cada um ligado ao insumo (ou criando um), e o de-para atualizado para a próxima nota.
  for e in select x.valor from jsonb_array_elements(p_nota -> 'itens') with ordinality x(valor, ordem) order by x.ordem loop
    v_item := nullif(e.valor ->> 'item_id', '')::uuid;
    if v_item is null and jsonb_typeof(e.valor -> 'criar_insumo') = 'object' then
      select id into v_item from fin_estoque_itens
       where empresa_id = p_empresa and lower(btrim(nome)) = lower(btrim(e.valor -> 'criar_insumo' ->> 'nome'));
      if v_item is null then
        insert into fin_estoque_itens (empresa_id, nome, unidade, categoria)
        values (p_empresa, btrim(e.valor -> 'criar_insumo' ->> 'nome'), coalesce(nullif(btrim(e.valor -> 'criar_insumo' ->> 'unidade'), ''), 'un'),
                nullif(btrim(e.valor -> 'criar_insumo' ->> 'categoria'), ''))
        returning id into v_item;
      end if;
    end if;
    v_ordem := v_ordem + 1;
    insert into fin_estoque_notas_itens (empresa_id, nota_id, ordem, codigo, descricao, unidade, quantidade, valor, item_id, fator)
    values (p_empresa, v_id, v_ordem, nullif(btrim(e.valor ->> 'codigo'), ''), btrim(coalesce(e.valor ->> 'descricao', '')),
            nullif(btrim(e.valor ->> 'unidade'), ''), (e.valor ->> 'quantidade')::numeric, (e.valor ->> 'valor')::numeric,
            v_item, coalesce((e.valor ->> 'fator')::numeric, 1));
    v_chave := coalesce(nullif(btrim(e.valor ->> 'codigo'), ''), lower(btrim(e.valor ->> 'descricao')));
    if v_fornecedor <> '' and v_chave <> '' then
      insert into fin_estoque_depara (empresa_id, fornecedor, chave, item_id, fator, ignorar)
      values (p_empresa, v_fornecedor, v_chave, v_item, case when v_item is null then 1 else coalesce((e.valor ->> 'fator')::numeric, 1) end, v_item is null)
      on conflict (empresa_id, fornecedor, chave) do update
        set item_id = excluded.item_id, fator = excluded.fator, ignorar = excluded.ignorar, atualizado_em = now();
    end if;
  end loop;

  -- Financeiro.
  v_modo := coalesce(v_fin ->> 'modo', 'nenhum');
  if v_modo not in ('criar', 'ligar', 'nenhum', 'manter') then
    raise exception 'Escolha o que fazer com o pagamento da nota.' using errcode = 'check_violation', constraint = 'fin_estoque_notas_financeiro_invalido';
  end if;
  if v_modo <> 'manter' then
    delete from fin_estoque_notas_lancamentos where nota_id = v_id;
  end if;
  if v_modo = 'criar' then
    if jsonb_typeof(v_fin -> 'duplicatas') is distinct from 'array' or jsonb_array_length(v_fin -> 'duplicatas') = 0 then
      raise exception 'Informe os vencimentos da nota.' using errcode = 'check_violation', constraint = 'fin_estoque_notas_sem_vencimentos';
    end if;
    select sum((x ->> 'valor')::numeric), count(*) into v_soma, v_qtd from jsonb_array_elements(v_fin -> 'duplicatas') x;
    if v_soma <> (p_nota ->> 'valor_total')::numeric then
      raise exception 'A soma dos vencimentos (%) não bate com o total da nota (%).', v_soma, (p_nota ->> 'valor_total')::numeric
        using errcode = 'check_violation', constraint = 'fin_estoque_notas_vencimentos_soma';
    end if;
    v_numero := coalesce(case when v_tipo = 'servico' then 'NFS ' else 'NF ' end || nullif(btrim(p_nota ->> 'numero'), ''), case when v_tipo = 'servico' then 'NFS' else 'NF' end);
    for d in select x.valor, x.ordem from jsonb_array_elements(v_fin -> 'duplicatas') with ordinality x(valor, ordem) order by x.ordem loop
      v_valor := (d.valor ->> 'valor')::numeric;
      insert into fin_estoque_notas_lancamentos (empresa_id, nota_id, lancamento_id)
      values (p_empresa, v_id, public.fin_lancar(
        p_empresa, 'saida', v_valor, nullif(v_fin ->> 'conta_caixa_id', '')::uuid, 'previsto', (p_nota ->> 'entrada')::date,
        (d.valor ->> 'vencimento')::date, null,
        v_numero || ' · ' || v_nome || case when v_qtd > 1 then ' (' || d.ordem || '/' || v_qtd || ')' else '' end,
        v_numero, false, jsonb_build_array(jsonb_build_object('conta_id', v_fin ->> 'conta_id', 'valor', v_valor)), v_contraparte, null));
    end loop;
  elsif v_modo = 'ligar' then
    insert into fin_estoque_notas_lancamentos (empresa_id, nota_id, lancamento_id)
    select distinct p_empresa, v_id, x::uuid from jsonb_array_elements_text(coalesce(v_fin -> 'lancamentos', '[]')) x;
  end if;

  -- Rateio de serviço e frete, e custo médio dos insumos tocados (os de agora e os da versão anterior).
  select v_notas_ratear || array_remove(array[n.id, n.nota_produto_id], null) into v_notas_ratear from fin_estoque_notas n where n.id = v_id;
  perform public.fin_estoque_notas_ratear(p_empresa, v_notas_ratear);
  select coalesce(array_agg(distinct i.item_id), '{}') into v_itens
    from fin_estoque_notas_itens i join fin_estoque_notas n on n.id = i.nota_id
   where i.item_id is not null and (n.id = any (v_notas_ratear) or n.remessa in (select remessa from fin_estoque_notas where id = any (v_notas_ratear)));
  perform public.fin_estoque_atualizar_custos(p_empresa, v_itens || v_antigos);
  return v_id;
end;
$$;

-- Apaga a nota. Os lançamentos ligados continuam (só o vínculo sai); o rateio e o custo médio são refeitos.
create function public.fin_estoque_apagar_nota(p_id uuid)
returns void language plpgsql set search_path = public as $$
declare
  v_empresa uuid;
  v_notas uuid[];
  v_itens uuid[];
begin
  select n.empresa_id, array_remove(array[n.nota_produto_id] || coalesce(array_agg(r.id) filter (where r.id <> n.id), '{}'), null)
    into v_empresa, v_notas
    from fin_estoque_notas n left join fin_estoque_notas r on r.empresa_id = n.empresa_id and r.remessa = n.remessa and n.remessa is not null
   where n.id = p_id group by n.id;
  if v_empresa is null then
    raise exception 'Nota não encontrada.' using errcode = 'check_violation', constraint = 'fin_estoque_notas_nao_encontrada';
  end if;
  if not public.pode_usar_financeiro(v_empresa, 'lancar') then
    raise exception 'Sem permissão para apagar notas desta empresa.' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(array_agg(distinct item_id) filter (where item_id is not null), '{}') into v_itens from fin_estoque_notas_itens where nota_id = p_id;
  -- As NFS-e ligadas a esta NF-e ficam soltas (sem nota de produto); o valor delas deixa de entrar no custo.
  delete from fin_estoque_notas where id = p_id;
  perform public.fin_estoque_notas_ratear(v_empresa, v_notas);
  select v_itens || coalesce(array_agg(distinct i.item_id) filter (where i.item_id is not null), '{}') into v_itens
    from fin_estoque_notas_itens i where i.nota_id = any (v_notas);
  perform public.fin_estoque_atualizar_custos(v_empresa, v_itens);
end;
$$;

-- Fechar uma contagem recomeça o custo médio: os insumos com nota de compra passam a partir dela.
-- (Chamado pela tela depois de fechar; também pode ser chamado à mão para refazer todos os custos médios.)
create function public.fin_estoque_recalcular_custos(p_empresa uuid)
returns integer language plpgsql set search_path = public as $$
begin
  if not public.pode_usar_financeiro(p_empresa, 'lancar') then
    raise exception 'Sem permissão para mudar os custos desta empresa.' using errcode = 'insufficient_privilege';
  end if;
  return public.fin_estoque_atualizar_custos(p_empresa,
    (select coalesce(array_agg(distinct item_id), '{}') from fin_estoque_notas_itens where empresa_id = p_empresa and item_id is not null));
end;
$$;

-- As funções internas rodam com as permissões de quem chama (RLS vale): podem ficar abertas a quem está logado.
revoke execute on function public.fin_estoque_salvar_nota(uuid, uuid, jsonb), public.fin_estoque_apagar_nota(uuid),
  public.fin_estoque_recalcular_custos(uuid), public.fin_estoque_custo_medio(uuid, uuid), public.fin_estoque_notas_ratear(uuid, uuid[]),
  public.fin_estoque_atualizar_custos(uuid, uuid[]), public.fin_estoque_ratear(numeric, numeric[]) from public, anon;
grant execute on function public.fin_estoque_salvar_nota(uuid, uuid, jsonb), public.fin_estoque_apagar_nota(uuid),
  public.fin_estoque_recalcular_custos(uuid), public.fin_estoque_custo_medio(uuid, uuid), public.fin_estoque_notas_ratear(uuid, uuid[]),
  public.fin_estoque_atualizar_custos(uuid, uuid[]), public.fin_estoque_ratear(numeric, numeric[]) to authenticated;
revoke execute on function public.fin_estoque_notas_validar(), public.fin_estoque_notas_lancamentos_validar() from public, anon, authenticated;
