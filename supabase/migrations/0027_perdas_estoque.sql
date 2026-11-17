-- Perdas de estoque: produtos vencidos, quebras, preparo errado, cortesias. Cada perda é anotada com a data, o insumo,
-- a quantidade (na unidade do insumo) e o motivo, e fica valorizada pelo custo do insumo no momento em que foi anotada.
-- Só informação: o CMV real não muda (a perda já está nele, porque sai do estoque contado). Na tela do CMV do mês as perdas
-- aparecem como a parte explicada da diferença entre o CMV real e o teórico.
-- Não muda nenhum dado existente.

create table public.fin_estoque_perdas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  data date not null,
  item_id uuid not null,
  quantidade numeric(14, 3) not null,
  motivo text not null,
  custo_unitario numeric(14, 4),           -- custo do insumo quando a perda foi anotada; vazio = insumo sem custo
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_estoque_perdas_item foreign key (empresa_id, item_id) references public.fin_estoque_itens (empresa_id, id),
  constraint fin_estoque_perdas_quantidade_valida check (quantidade > 0),
  constraint fin_estoque_perdas_motivo_valido check (motivo in ('vencido', 'quebra', 'preparo', 'cortesia', 'outro')),
  constraint fin_estoque_perdas_custo_valido check (custo_unitario is null or custo_unitario >= 0)
);
create index fin_estoque_perdas_data_idx on public.fin_estoque_perdas (empresa_id, data desc);

-- Grava o custo do insumo na hora de anotar (quando não vier informado). A perda não muda de empresa.
create function public.fin_estoque_perdas_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.empresa_id <> old.empresa_id then
    raise exception 'A perda não muda de empresa.' using errcode = 'check_violation', constraint = 'fin_estoque_perdas_empresa_fixa';
  end if;
  if new.custo_unitario is null and (tg_op = 'INSERT' or new.item_id is distinct from old.item_id) then
    select custo_unitario into new.custo_unitario from fin_estoque_itens where id = new.item_id;
  end if;
  return new;
end;
$$;
create trigger fin_estoque_perdas_validar before insert or update on public.fin_estoque_perdas
  for each row execute function public.fin_estoque_perdas_validar();
create trigger registrar_historico after insert or update or delete on public.fin_estoque_perdas
  for each row execute function public.registrar_historico();
revoke execute on function public.fin_estoque_perdas_validar() from public, anon, authenticated;

alter table public.fin_estoque_perdas enable row level security;
create policy ler on public.fin_estoque_perdas for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_estoque_perdas for insert to authenticated
  with check (public.pode_usar_financeiro(empresa_id, 'lancar') and public.fin_estoque_ligado(empresa_id));
create policy alterar on public.fin_estoque_perdas for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy apagar on public.fin_estoque_perdas for delete to authenticated using (public.pode_usar_financeiro(empresa_id, 'lancar'));
