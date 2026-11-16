-- Fechar o CMV teórico de um mês: grava em cada produto vendido o custo da ficha naquele momento.
-- Enquanto o mês está aberto, o teórico usa o custo atual dos insumos (como na 0019). Depois de fechado, mudar o custo de
-- um insumo não mexe mais naquele mês. Reabrir apaga os custos gravados e o mês volta a usar o custo atual.
-- Mês fechado não pode ser apagado nem importado de novo: é preciso reabrir antes.
-- Não muda nenhum dado existente: todos os meses já importados continuam abertos.

alter table public.fin_estoque_vendas
  add column fechado_em timestamptz,
  add column fechado_por uuid references public.perfis (id);

alter table public.fin_estoque_vendas_itens
  add column custo_unitario numeric(14, 6),          -- custo da ficha por unidade vendida, gravado ao fechar; vazio = sem ficha ou mês aberto
  add column insumos_sem_custo integer not null default 0,
  add constraint fin_estoque_vendas_itens_custo_valido check (custo_unitario is null or custo_unitario >= 0),
  add constraint fin_estoque_vendas_itens_sem_custo_valido check (insumos_sem_custo >= 0);

create policy alterar on public.fin_estoque_vendas for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar'))
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_vendas_itens for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar'))
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));

-- Mês fechado não sai (apagar ou importar de novo o mesmo mês apagaria o que foi gravado).
create function public.fin_estoque_vendas_proteger()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.fechado_em is not null then
    raise exception 'O CMV deste mês está fechado. Reabra o mês antes de apagar ou importar as vendas de novo.'
      using errcode = 'check_violation', constraint = 'fin_estoque_vendas_fechada';
  end if;
  return old;
end;
$$;
create trigger fin_estoque_vendas_proteger before delete on public.fin_estoque_vendas
  for each row execute function public.fin_estoque_vendas_proteger();

create function public.fin_estoque_fechar_vendas(p_id uuid)
returns uuid language plpgsql set search_path = public as $$
declare
  v_empresa uuid;
  v_fechado timestamptz;
begin
  select empresa_id, fechado_em into v_empresa, v_fechado from fin_estoque_vendas where id = p_id;
  if v_empresa is null then
    raise exception 'Vendas não encontradas.' using errcode = 'check_violation', constraint = 'fin_estoque_vendas_nao_encontrada';
  end if;
  if not public.pode_usar_financeiro(v_empresa, 'lancar') then
    raise exception 'Sem permissão para fechar ou reabrir o CMV desta empresa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.fin_estoque_ligado(v_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  if v_fechado is not null then
    raise exception 'O CMV deste mês já está fechado.' using errcode = 'check_violation', constraint = 'fin_estoque_vendas_fechada';
  end if;
  -- Mesma conta da tela: soma de quantidade × custo atual de cada insumo da ficha; insumo sem custo fica fora e é contado.
  update fin_estoque_vendas_itens v
     set custo_unitario = c.custo, insumos_sem_custo = c.sem_custo
    from (select fi.produto_id,
                 coalesce(sum(fi.quantidade * i.custo_unitario), 0) as custo,
                 count(*) filter (where i.custo_unitario is null)::int as sem_custo
            from fin_estoque_ficha_itens fi
            join fin_estoque_itens i on i.id = fi.item_id
           where fi.empresa_id = v_empresa
           group by fi.produto_id) c
   where v.venda_id = p_id and v.produto_id = c.produto_id;
  update fin_estoque_vendas set fechado_em = now(), fechado_por = auth.uid() where id = p_id;
  return p_id;
end;
$$;

create function public.fin_estoque_reabrir_vendas(p_id uuid)
returns uuid language plpgsql set search_path = public as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from fin_estoque_vendas where id = p_id;
  if v_empresa is null then
    raise exception 'Vendas não encontradas.' using errcode = 'check_violation', constraint = 'fin_estoque_vendas_nao_encontrada';
  end if;
  if not public.pode_usar_financeiro(v_empresa, 'lancar') then
    raise exception 'Sem permissão para fechar ou reabrir o CMV desta empresa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.fin_estoque_ligado(v_empresa) then
    raise exception 'O controle de estoque está desligado nesta empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_desligado';
  end if;
  update fin_estoque_vendas_itens set custo_unitario = null, insumos_sem_custo = 0 where venda_id = p_id;
  update fin_estoque_vendas set fechado_em = null, fechado_por = null where id = p_id;
  return p_id;
end;
$$;

revoke execute on function public.fin_estoque_fechar_vendas(uuid), public.fin_estoque_reabrir_vendas(uuid) from public, anon;
grant execute on function public.fin_estoque_fechar_vendas(uuid), public.fin_estoque_reabrir_vendas(uuid) to authenticated;
revoke execute on function public.fin_estoque_vendas_proteger() from public, anon, authenticated;
