-- Estoque e CMV, etapa 1 (proposta "Estoque e CMV no Axis", 2026-11-15).
-- Para empresas que vendem mercadoria (ex.: cafeteria), o CMV da DRE passa a ser
--   compras do mês + estoque inicial − estoque final,
-- com o estoque vindo de contagens no fim do mês. As compras continuam sendo os lançamentos de sempre; a variação
-- de estoque é calculada pela tela a partir das contagens fechadas e não vira lançamento (não mexe no caixa).
-- Tudo depende de uma chave por empresa, desligada por padrão: as clínicas não mudam em nada.
-- Não muda nenhum dado existente nem nenhuma regra do núcleo do diagnóstico ou do financeiro.

-- ---------------------------------------------------------------------------
-- Chave por empresa
-- ---------------------------------------------------------------------------

alter table public.empresas
  add column if not exists estoque_ativo boolean not null default false;

-- A empresa usa o controle de estoque? Roda como dono porque quem está na central não lê a tabela empresas.
create function public.fin_estoque_ligado(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select e.estoque_ativo from public.empresas e where e.id = p_empresa), false);
$$;

-- ---------------------------------------------------------------------------
-- Insumos: o que se conta e quanto custa cada unidade contada
-- ---------------------------------------------------------------------------

create table public.fin_estoque_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  categoria text,
  unidade text not null,                   -- a unidade em que o item é contado (un, kg, pct, cx...)
  custo_unitario numeric(14, 4),           -- custo de uma unidade contada; vazio = ainda sem custo
  fora_do_cmv boolean not null default false, -- limpeza, utensílios: contados, mas fora do CMV
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_estoque_itens_empresa_id unique (empresa_id, id),
  constraint fin_estoque_itens_nome_nao_branco check (btrim(nome) <> ''),
  constraint fin_estoque_itens_unidade_nao_branca check (btrim(unidade) <> ''),
  constraint fin_estoque_itens_custo_valido check (custo_unitario is null or custo_unitario >= 0)
);
create unique index fin_estoque_itens_nome_unico on public.fin_estoque_itens (empresa_id, lower(btrim(nome)));

-- ---------------------------------------------------------------------------
-- Contagens: uma por data, de rascunho a fechada
-- ---------------------------------------------------------------------------

create table public.fin_estoque_contagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  data date not null,                      -- o estoque vale para o fim deste dia
  situacao text not null default 'rascunho',
  arquivo_nome text,
  observacoes text,
  fechada_em timestamptz,
  fechada_por uuid references public.perfis (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_estoque_contagens_empresa_id unique (empresa_id, id),
  constraint fin_estoque_contagens_data_unica unique (empresa_id, data),
  constraint fin_estoque_contagens_situacao_valida check (situacao in ('rascunho', 'fechada')),
  constraint fin_estoque_contagens_fechamento_coerente check ((situacao = 'fechada') = (fechada_em is not null))
);

create table public.fin_estoque_contagem_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  contagem_id uuid not null,
  item_id uuid,
  nome_origem text not null,               -- como veio no arquivo
  categoria_origem text,
  unidade_origem text,
  quantidade numeric(14, 3) not null,
  custo_unitario numeric(14, 4),           -- fica gravado no fechamento, com o custo do insumo naquele momento
  fora_do_cmv boolean not null default false,
  ordem integer not null default 0,
  constraint fin_estoque_contagem_itens_contagem foreign key (empresa_id, contagem_id)
    references public.fin_estoque_contagens (empresa_id, id) on delete cascade,
  constraint fin_estoque_contagem_itens_item foreign key (empresa_id, item_id) references public.fin_estoque_itens (empresa_id, id),
  constraint fin_estoque_contagem_itens_quantidade_valida check (quantidade >= 0),
  constraint fin_estoque_contagem_itens_custo_valido check (custo_unitario is null or custo_unitario >= 0),
  constraint fin_estoque_contagem_itens_nome_nao_branco check (btrim(nome_origem) <> '')
);
create index fin_estoque_contagem_itens_contagem_idx on public.fin_estoque_contagem_itens (contagem_id, ordem);

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------

create function public.fin_estoque_itens_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.empresa_id <> old.empresa_id then
    raise exception 'O insumo não pode mudar de empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_itens_empresa_fixa';
  end if;
  return new;
end;
$$;

-- Contagem fechada não muda; só volta para rascunho (reabrir). Empresa nunca muda.
create function public.fin_estoque_contagens_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.situacao = 'fechada' then
      raise exception 'Contagem fechada não pode ser apagada. Reabra antes.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_fechada';
    end if;
    return old;
  end if;
  if new.empresa_id <> old.empresa_id then
    raise exception 'A contagem não pode mudar de empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_contagens_empresa_fixa';
  end if;
  if old.situacao = 'fechada' and new.situacao = 'fechada' then
    raise exception 'Contagem fechada não muda. Reabra antes.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_fechada';
  end if;
  -- Fechar por qualquer caminho exige custo em toda linha contada que entra no CMV.
  if old.situacao = 'rascunho' and new.situacao = 'fechada' and exists (
       select 1 from fin_estoque_contagem_itens
        where contagem_id = new.id and not fora_do_cmv and quantidade > 0 and custo_unitario is null) then
    raise exception 'Há itens contados sem custo.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_sem_custo';
  end if;
  return new;
end;
$$;

-- Linhas de contagem fechada não mudam. Exceção: a própria função de fechamento grava o custo antes de fechar,
-- quando a contagem ainda é rascunho.
create function public.fin_estoque_contagem_itens_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_contagem uuid := case when tg_op = 'DELETE' then old.contagem_id else new.contagem_id end;
begin
  if tg_op = 'UPDATE' and (new.empresa_id, new.contagem_id) is distinct from (old.empresa_id, old.contagem_id) then
    raise exception 'A linha não muda de contagem.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_itens_fixa';
  end if;
  if exists (select 1 from fin_estoque_contagens where id = v_contagem and situacao = 'fechada') then
    raise exception 'Contagem fechada não muda. Reabra antes.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_fechada';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger fin_estoque_itens_validar before update on public.fin_estoque_itens
  for each row execute function public.fin_estoque_itens_validar();
create trigger tocar_atualizado_em before update on public.fin_estoque_itens
  for each row execute function public.tocar_atualizado_em();
create trigger fin_estoque_contagens_validar before update or delete on public.fin_estoque_contagens
  for each row execute function public.fin_estoque_contagens_validar();
create trigger tocar_atualizado_em before update on public.fin_estoque_contagens
  for each row execute function public.tocar_atualizado_em();
create trigger fin_estoque_contagem_itens_validar before insert or update or delete on public.fin_estoque_contagem_itens
  for each row execute function public.fin_estoque_contagem_itens_validar();

-- Histórico (0013): insumos e contagens. As linhas da contagem ficam fora para não encher o histórico a cada importação.
create trigger registrar_historico after insert or update or delete on public.fin_estoque_itens
  for each row execute function public.registrar_historico();
create trigger registrar_historico after insert or update or delete on public.fin_estoque_contagens
  for each row execute function public.registrar_historico();

-- ---------------------------------------------------------------------------
-- Acesso: mesma regra do financeiro (F1). Gravar exige a chave da empresa ligada.
-- ---------------------------------------------------------------------------

alter table public.fin_estoque_itens enable row level security;
create policy ler on public.fin_estoque_itens for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_itens for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_itens for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_contagens enable row level security;
create policy ler on public.fin_estoque_contagens for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_contagens for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_contagens for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy apagar on public.fin_estoque_contagens for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

alter table public.fin_estoque_contagem_itens enable row level security;
create policy ler on public.fin_estoque_contagem_itens for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_contagem_itens for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_contagem_itens for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy apagar on public.fin_estoque_contagem_itens for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Importar uma contagem (ex.: a planilha do Omnia), numa transação só.
-- p_itens: [{ "nome", "categoria", "unidade", "quantidade" }]. Cada nome vira (ou reaproveita) um insumo da empresa,
-- pelo nome sem diferença de maiúsculas. Roda com as permissões de quem chama (RLS vale).
-- ---------------------------------------------------------------------------

create function public.fin_estoque_importar_contagem(p_empresa uuid, p_data date, p_arquivo text, p_itens jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_item uuid;
  r record;
begin
  if not public.fin_estoque_ligado(p_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A contagem não tem itens.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_vazia';
  end if;

  insert into fin_estoque_contagens (empresa_id, data, arquivo_nome) values (p_empresa, p_data, nullif(btrim(p_arquivo), ''))
  returning id into v_id;

  for r in
    select e.ordem::int as ordem, btrim(e.valor ->> 'nome') as nome, nullif(btrim(e.valor ->> 'categoria'), '') as categoria,
           coalesce(nullif(btrim(e.valor ->> 'unidade'), ''), 'un') as unidade, (e.valor ->> 'quantidade')::numeric as quantidade
    from jsonb_array_elements(p_itens) with ordinality e(valor, ordem)
  loop
    select id into v_item from fin_estoque_itens where empresa_id = p_empresa and lower(btrim(nome)) = lower(r.nome);
    if v_item is null then
      insert into fin_estoque_itens (empresa_id, nome, categoria, unidade) values (p_empresa, r.nome, r.categoria, r.unidade)
      returning id into v_item;
    end if;
    insert into fin_estoque_contagem_itens (empresa_id, contagem_id, item_id, nome_origem, categoria_origem, unidade_origem, quantidade, ordem)
    values (p_empresa, v_id, v_item, r.nome, r.categoria, r.unidade, r.quantidade, r.ordem);
  end loop;
  return v_id;
end;
$$;

-- Fechar: grava em cada linha o custo e o "fora do CMV" do insumo naquele momento. Recusa se alguma linha que entra
-- no CMV ficar sem custo.
create function public.fin_estoque_fechar_contagem(p_id uuid)
returns uuid language plpgsql set search_path = public as $$
declare
  v_situacao text;
  v_faltam integer;
begin
  select situacao into v_situacao from fin_estoque_contagens where id = p_id;
  if v_situacao is null then
    raise exception 'Contagem não encontrada.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_nao_encontrada';
  end if;
  if v_situacao = 'fechada' then
    raise exception 'A contagem já está fechada.' using errcode = 'check_violation', constraint = 'fin_estoque_contagem_fechada';
  end if;

  update fin_estoque_contagem_itens l
     set custo_unitario = i.custo_unitario, fora_do_cmv = i.fora_do_cmv
    from fin_estoque_itens i
   where l.contagem_id = p_id and i.id = l.item_id;

  select count(*) into v_faltam from fin_estoque_contagem_itens
   where contagem_id = p_id and not fora_do_cmv and quantidade > 0 and custo_unitario is null;
  if v_faltam > 0 then
    raise exception '% itens contados ainda estão sem custo. Informe o custo na aba Insumos ou marque como fora do CMV.', v_faltam
      using errcode = 'check_violation', constraint = 'fin_estoque_contagem_sem_custo';
  end if;

  update fin_estoque_contagens set situacao = 'fechada', fechada_em = now(), fechada_por = auth.uid() where id = p_id;
  return p_id;
end;
$$;

revoke execute on function public.fin_estoque_ligado(uuid), public.fin_estoque_importar_contagem(uuid, date, text, jsonb),
  public.fin_estoque_fechar_contagem(uuid) from public, anon;
grant execute on function public.fin_estoque_ligado(uuid), public.fin_estoque_importar_contagem(uuid, date, text, jsonb),
  public.fin_estoque_fechar_contagem(uuid) to authenticated;
revoke execute on function public.fin_estoque_itens_validar(), public.fin_estoque_contagens_validar(),
  public.fin_estoque_contagem_itens_validar() from public, anon, authenticated;
