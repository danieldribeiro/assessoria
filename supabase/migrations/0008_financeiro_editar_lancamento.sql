-- Edição de lançamentos. Até a 0007, um lançamento só podia ser liquidado ou cancelado; um erro de digitação
-- exigia cancelar e lançar de novo. Agora tudo pode ser corrigido enquanto o lançamento não estiver cancelado:
-- valor, direção, conta de caixa, datas, situação, descrição, documento e rateio.
-- O que continua valendo: soma exata do rateio (V7), nada antes do saldo inicial (V8), cancelado é final,
-- empresa e origem fixas. Nada é apagado: o rateio antigo fica marcado como substituído, e cada criação e
-- alteração do lançamento fica registrada com o antes e o depois.
-- Não muda nada do núcleo do diagnóstico.

-- ---------------------------------------------------------------------------
-- Rateio substituído: a linha antiga fica guardada; só valem as linhas com substituido_em vazio.
-- ---------------------------------------------------------------------------

alter table public.fin_lancamento_rateios add column substituido_em timestamptz;
create index fin_rateios_vigentes_idx on public.fin_lancamento_rateios (lancamento_id) where substituido_em is null;

-- Histórico dos lançamentos: criação, edição, liquidação e cancelamento, com o rateio antes e depois.
create table public.fin_lancamentos_eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null,
  lancamento_id uuid not null,
  acao text not null check (acao in ('criado', 'editado', 'realizado', 'cancelado')),
  antes jsonb,
  depois jsonb not null,
  por uuid,
  em timestamptz not null default now(),
  constraint fin_lancamentos_eventos_lancamento foreign key (empresa_id, lancamento_id) references public.fin_lancamentos (empresa_id, id)
);
create index fin_lancamentos_eventos_lancamento_idx on public.fin_lancamentos_eventos (lancamento_id, em);

alter table public.fin_lancamentos_eventos enable row level security;
create policy ler on public.fin_lancamentos_eventos for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));

-- Marcar o rateio antigo como substituído é uma alteração; só a equipe faz (F1).
create policy alterar on public.fin_lancamento_rateios for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Regras revistas
-- ---------------------------------------------------------------------------

-- Lançamento: tudo muda enquanto não estiver cancelado, menos empresa e origem.
create or replace function public.fin_lancamentos_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_caixa record;
begin
  select ativa, data_saldo_inicial into v_caixa from fin_contas_caixa where id = new.conta_caixa_id and empresa_id = new.empresa_id;

  if tg_op = 'INSERT' then
    if not v_caixa.ativa then
      raise exception 'A conta de caixa está inativa.' using errcode = 'check_violation', constraint = 'fin_lancamentos_caixa_ativa';
    end if;
    if new.situacao = 'cancelado' then
      raise exception 'Lançamento novo não nasce cancelado.' using errcode = 'check_violation', constraint = 'fin_lancamentos_transicao';
    end if;
  else
    if old.situacao = 'cancelado' then
      raise exception 'Lançamento cancelado não muda.' using errcode = 'check_violation', constraint = 'fin_lancamentos_cancelado_final';
    end if;
    if (new.empresa_id, new.origem_tipo, new.origem_id) is distinct from (old.empresa_id, old.origem_tipo, old.origem_id) then
      raise exception 'A empresa e a origem do lançamento não mudam.' using errcode = 'check_violation', constraint = 'fin_lancamentos_campos_fixos';
    end if;
    if new.conta_caixa_id <> old.conta_caixa_id and not v_caixa.ativa then
      raise exception 'A conta de caixa está inativa.' using errcode = 'check_violation', constraint = 'fin_lancamentos_caixa_ativa';
    end if;
  end if;

  if new.situacao = 'realizado' and new.data_liquidacao < v_caixa.data_saldo_inicial then
    raise exception 'A liquidação (%) é anterior ao saldo inicial da conta de caixa (%).',
      to_char(new.data_liquidacao, 'DD/MM/YYYY'), to_char(v_caixa.data_saldo_inicial, 'DD/MM/YYYY')
      using errcode = 'check_violation', constraint = 'fin_lancamentos_antes_do_saldo_inicial';
  end if;
  return new;
end;
$$;

-- Rateio: depois de gravado, a única mudança aceita é marcar a linha como substituída.
create or replace function public.fin_rateios_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_conta record;
begin
  if tg_op = 'UPDATE' then
    if old.substituido_em is null and new.substituido_em is not null
       and (new.empresa_id, new.lancamento_id, new.conta_id, new.valor) = (old.empresa_id, old.lancamento_id, old.conta_id, old.valor) then
      return new;
    end if;
    raise exception 'O rateio não muda depois de gravado. Edite o lançamento para trocar o rateio.'
      using errcode = 'check_violation', constraint = 'fin_rateios_fixos';
  end if;
  if new.substituido_em is not null then
    raise exception 'Linha nova de rateio não nasce substituída.' using errcode = 'check_violation', constraint = 'fin_rateios_fixos';
  end if;
  select tipo, ativa, comportamento_caixa into v_conta from fin_contas where id = new.conta_id and empresa_id = new.empresa_id;
  if v_conta.tipo <> 'analitica' then
    raise exception 'Só conta analítica recebe lançamento.' using errcode = 'check_violation', constraint = 'fin_rateios_conta_analitica';
  end if;
  if not v_conta.ativa then
    raise exception 'A conta está inativa.' using errcode = 'check_violation', constraint = 'fin_rateios_conta_ativa';
  end if;
  if v_conta.comportamento_caixa not in ('operacional', 'investimento', 'financiamento') then
    raise exception 'Essa conta não movimenta caixa (sem caixa ou transferência interna).'
      using errcode = 'check_violation', constraint = 'fin_rateios_conta_movimenta_caixa';
  end if;
  if exists (select 1 from fin_lancamentos where id = new.lancamento_id and situacao = 'cancelado') then
    raise exception 'O lançamento está cancelado.' using errcode = 'check_violation', constraint = 'fin_rateios_lancamento_cancelado';
  end if;
  return new;
end;
$$;

-- Soma exata (V7) só com as linhas vigentes.
create or replace function public.fin_rateios_conferir_soma()
returns trigger language plpgsql set search_path = public as $$
declare
  v_lancamento uuid := coalesce((to_jsonb(new) ->> 'lancamento_id')::uuid, new.id); -- o gatilho serve às duas tabelas
  v_total numeric;
  v_soma numeric;
begin
  select valor_total into v_total from fin_lancamentos where id = v_lancamento;
  select coalesce(sum(valor), 0) into v_soma from fin_lancamento_rateios where lancamento_id = v_lancamento and substituido_em is null;
  if v_soma <> v_total then
    raise exception 'O rateio soma % e o lançamento é de %. A soma precisa ser exata.', v_soma, v_total
      using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;
  return null;
end;
$$;

-- Plano de contas: a classificação fica fixa quando a conta está num rateio vigente (F5). Se a única
-- linha que usava a conta foi corrigida para outra conta, a classificação volta a poder mudar.
create or replace function public.fin_contas_validar()
returns trigger language plpgsql set search_path = public as $$
declare
  v_tipo_pai text;
  v_cursor uuid;
  v_passos int := 0;
begin
  if tg_op = 'UPDATE' and new.empresa_id <> old.empresa_id then
    raise exception 'A conta não pode mudar de empresa.' using errcode = 'check_violation', constraint = 'fin_contas_empresa_fixa';
  end if;

  if new.conta_pai_id is not null then
    select tipo into v_tipo_pai from fin_contas where id = new.conta_pai_id and empresa_id = new.empresa_id;
    if v_tipo_pai is distinct from 'grupo' then
      raise exception 'A conta-mãe precisa ser um grupo.' using errcode = 'check_violation', constraint = 'fin_contas_pai_e_grupo';
    end if;
    -- Ciclo: subindo a partir da nova mãe, não pode chegar à própria conta.
    v_cursor := new.conta_pai_id;
    while v_cursor is not null loop
      if v_cursor = new.id then
        raise exception 'Essa mudança criaria um ciclo no plano de contas.' using errcode = 'check_violation', constraint = 'fin_contas_sem_ciclo';
      end if;
      v_passos := v_passos + 1;
      exit when v_passos > 1000;
      select conta_pai_id into v_cursor from fin_contas where id = v_cursor;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    if new.tipo = 'analitica' and old.tipo = 'grupo'
       and exists (select 1 from fin_contas where conta_pai_id = new.id) then
      raise exception 'Um grupo com contas dentro não pode virar analítica.' using errcode = 'check_violation', constraint = 'fin_contas_analitica_sem_filhos';
    end if;
    if (new.tipo, new.natureza, new.classificacao, new.comportamento_caixa, new.dre_secao, new.custo_cmv)
         is distinct from (old.tipo, old.natureza, old.classificacao, old.comportamento_caixa, old.dre_secao, old.custo_cmv)
       and exists (select 1 from fin_lancamento_rateios where conta_id = new.id and substituido_em is null) then
      raise exception 'A classificação de uma conta já usada em lançamento não muda. Crie uma conta nova.'
        using errcode = 'check_violation', constraint = 'fin_contas_classificacao_imutavel';
    end if;
  end if;
  return new;
end;
$$;

-- Fluxo de caixa só com as linhas vigentes do rateio.
create or replace function public.fin_fluxo_caixa(p_empresa uuid, p_inicio date, p_fim date, p_base text)
returns table (conta_id uuid, mes date, entradas numeric, saidas numeric)
language sql stable set search_path = public as $$
  select r.conta_id, date_trunc('month', d.data)::date,
         coalesce(sum(r.valor) filter (where l.direcao = 'entrada'), 0),
         coalesce(sum(r.valor) filter (where l.direcao = 'saida'), 0)
  from fin_lancamentos l
  join fin_lancamento_rateios r on r.lancamento_id = l.id and r.substituido_em is null
  cross join lateral (select case when p_base = 'previsto' then l.data_vencimento else l.data_liquidacao end as data) d
  where l.empresa_id = p_empresa
    and l.situacao = case when p_base = 'previsto' then 'previsto' else 'realizado' end
    and d.data between p_inicio and p_fim
  group by r.conta_id, date_trunc('month', d.data);
$$;

-- ---------------------------------------------------------------------------
-- Histórico: um evento por criação ou alteração do lançamento. Roda como dono para gravar sem regra de inserção.
-- No evento de alteração vai também o rateio de antes e o de depois.
-- ---------------------------------------------------------------------------

create function public.fin_lancamentos_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_acao text;
  v_rateio_antes jsonb;
  v_rateio_depois jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('conta_id', conta_id, 'valor', valor) order by conta_id, valor), '[]')
    into v_rateio_depois from fin_lancamento_rateios where lancamento_id = new.id and substituido_em is null;
  if tg_op = 'INSERT' then
    insert into fin_lancamentos_eventos (empresa_id, lancamento_id, acao, antes, depois, por)
    values (new.empresa_id, new.id, 'criado', null, to_jsonb(new) - 'atualizado_em', auth.uid());
    return null;
  end if;
  v_acao := case when new.situacao = 'cancelado' then 'cancelado'
                 when old.situacao = 'previsto' and new.situacao = 'realizado' then 'realizado'
                 else 'editado' end;
  -- Linhas substituídas nesta mesma transação são o rateio de antes; sem substituição, o rateio não mudou.
  select jsonb_agg(jsonb_build_object('conta_id', conta_id, 'valor', valor) order by conta_id, valor)
    into v_rateio_antes from fin_lancamento_rateios where lancamento_id = new.id and substituido_em = now();
  insert into fin_lancamentos_eventos (empresa_id, lancamento_id, acao, antes, depois, por)
  values (new.empresa_id, new.id, v_acao,
          (to_jsonb(old) - 'atualizado_em') || jsonb_build_object('rateio', coalesce(v_rateio_antes, v_rateio_depois)),
          (to_jsonb(new) - 'atualizado_em') || jsonb_build_object('rateio', v_rateio_depois), auth.uid());
  return null;
end;
$$;

create trigger fin_lancamentos_auditar after insert or update on public.fin_lancamentos
  for each row execute function public.fin_lancamentos_auditar();

-- ---------------------------------------------------------------------------
-- Edição completa: troca os campos e, se mudou, o rateio, numa transação. Roda com a permissão de quem chama.
-- p_rateios no mesmo formato de fin_lancar: [{"conta_id": "...", "valor": 123.45}, ...]
-- ---------------------------------------------------------------------------

create function public.fin_editar_lancamento(
  p_id uuid, p_direcao text, p_valor_total numeric, p_conta_caixa uuid, p_situacao text, p_competencia date,
  p_vencimento date, p_liquidacao date, p_descricao text, p_documento text, p_juros_nao_segregados boolean,
  p_rateios jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_empresa uuid;
  v_atual jsonb;
  v_novo jsonb;
begin
  select empresa_id into v_empresa from fin_lancamentos where id = p_id;
  if v_empresa is null then
    raise exception 'Lançamento não encontrado.' using errcode = 'check_violation', constraint = 'fin_lancamentos_nao_encontrado';
  end if;
  if p_situacao not in ('previsto', 'realizado') then
    raise exception 'Na edição, a situação é previsto ou realizado. Para cancelar, use Cancelar.'
      using errcode = 'check_violation', constraint = 'fin_lancamentos_transicao';
  end if;
  if jsonb_typeof(p_rateios) <> 'array' or jsonb_array_length(p_rateios) = 0 then
    raise exception 'Informe ao menos uma conta no rateio.' using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('conta_id', conta_id, 'valor', valor) order by conta_id, valor), '[]')
    into v_atual from fin_lancamento_rateios where lancamento_id = p_id and substituido_em is null;
  select jsonb_agg(jsonb_build_object('conta_id', c, 'valor', v) order by c, v) into v_novo
    from (select (r ->> 'conta_id')::uuid c, (r ->> 'valor')::numeric(14, 2) v from jsonb_array_elements(p_rateios) r) x;

  if v_novo is distinct from v_atual then
    update fin_lancamento_rateios set substituido_em = now() where lancamento_id = p_id and substituido_em is null;
    insert into fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor)
    select v_empresa, p_id, (r ->> 'conta_id')::uuid, (r ->> 'valor')::numeric from jsonb_array_elements(p_rateios) r;
  end if;

  update fin_lancamentos set
    direcao = p_direcao, valor_total = p_valor_total, conta_caixa_id = p_conta_caixa, situacao = p_situacao,
    data_competencia = p_competencia,
    data_vencimento = case when p_situacao = 'previsto' then p_vencimento else data_vencimento end,
    data_liquidacao = case when p_situacao = 'realizado' then p_liquidacao end,
    descricao = p_descricao, documento = p_documento, juros_nao_segregados = coalesce(p_juros_nao_segregados, false)
  where id = p_id;
  return p_id;
end;
$$;

revoke execute on function public.fin_editar_lancamento(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb) from public, anon;
grant execute on function public.fin_editar_lancamento(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb) to authenticated;
