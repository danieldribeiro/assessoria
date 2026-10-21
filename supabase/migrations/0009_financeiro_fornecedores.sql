-- Fornecedores e clientes, e observações nos lançamentos (docs/axis-financeiro/evolucao-modulo-financeiro.md, etapa 2).
-- Cada lançamento tem no máximo um fornecedor ou cliente: despesas de fornecedores diferentes ficam, por isso,
-- em lançamentos separados. Nada é juntado automaticamente. Os lançamentos que já existem ficam sem fornecedor
-- e sem observação (nada é preenchido para trás).
-- Não muda nada do núcleo do diagnóstico.

-- ---------------------------------------------------------------------------
-- Cadastro de fornecedores e clientes, por empresa
-- ---------------------------------------------------------------------------

create table public.fin_contrapartes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  tipo text not null,
  documento text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_contrapartes_empresa_id unique (empresa_id, id),
  constraint fin_contrapartes_nome_nao_branco check (btrim(nome) <> ''),
  constraint fin_contrapartes_tipo_valido check (tipo in ('fornecedor', 'cliente', 'ambos')),
  -- CPF (11) ou CNPJ (14), só dígitos.
  constraint fin_contrapartes_documento_valido check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$')
);
create unique index fin_contrapartes_nome_unico on public.fin_contrapartes (empresa_id, lower(btrim(nome)));
create unique index fin_contrapartes_documento_unico on public.fin_contrapartes (empresa_id, documento) where documento is not null;

create function public.fin_contrapartes_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.empresa_id <> old.empresa_id then
    raise exception 'O cadastro não pode mudar de empresa.' using errcode = 'check_violation', constraint = 'fin_contrapartes_empresa_fixa';
  end if;
  return new;
end;
$$;

create trigger fin_contrapartes_validar before update on public.fin_contrapartes
  for each row execute function public.fin_contrapartes_validar();
create trigger tocar_atualizado_em before update on public.fin_contrapartes
  for each row execute function public.tocar_atualizado_em();

alter table public.fin_contrapartes enable row level security;
create policy ler on public.fin_contrapartes for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
-- Quem lança cadastra o fornecedor na hora.
create policy criar on public.fin_contrapartes for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy alterar on public.fin_contrapartes for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Lançamento: fornecedor ou cliente (opcional) e observações
-- ---------------------------------------------------------------------------

alter table public.fin_lancamentos
  add column contraparte_id uuid,
  add column observacoes text,
  add constraint fin_lancamentos_contraparte foreign key (empresa_id, contraparte_id) references public.fin_contrapartes (empresa_id, id),
  add constraint fin_lancamentos_observacoes_nao_branca check (observacoes is null or btrim(observacoes) <> '');
create index fin_lancamentos_contraparte_idx on public.fin_lancamentos (empresa_id, contraparte_id) where contraparte_id is not null;

-- Regras da 0008, mais: fornecedor ou cliente inativo (ou de outra empresa) não entra em lançamento novo nem trocado.
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

  if new.contraparte_id is not null and (tg_op = 'INSERT' or new.contraparte_id is distinct from old.contraparte_id)
     and not exists (select 1 from fin_contrapartes where id = new.contraparte_id and empresa_id = new.empresa_id and ativa) then
    raise exception 'O fornecedor ou cliente está inativo ou não é desta empresa.' using errcode = 'check_violation', constraint = 'fin_lancamentos_contraparte_ativa';
  end if;

  if new.situacao = 'realizado' and new.data_liquidacao < v_caixa.data_saldo_inicial then
    raise exception 'A liquidação (%) é anterior ao saldo inicial da conta de caixa (%).',
      to_char(new.data_liquidacao, 'DD/MM/YYYY'), to_char(v_caixa.data_saldo_inicial, 'DD/MM/YYYY')
      using errcode = 'check_violation', constraint = 'fin_lancamentos_antes_do_saldo_inicial';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções de gravação com os dois campos novos. As versões antigas ficam guardadas com outro nome e sem
-- permissão de uso; os parâmetros novos têm valor padrão, então quem chama sem eles continua funcionando.
-- ---------------------------------------------------------------------------

alter function public.fin_lancar(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb)
  rename to fin_lancar_0007;
alter function public.fin_editar_lancamento(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb)
  rename to fin_editar_lancamento_0008;
revoke execute on function public.fin_lancar_0007(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb),
  public.fin_editar_lancamento_0008(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb)
  from public, anon, authenticated;

create function public.fin_lancar(
  p_empresa uuid, p_direcao text, p_valor_total numeric, p_conta_caixa uuid, p_situacao text, p_competencia date,
  p_vencimento date, p_liquidacao date, p_descricao text, p_documento text, p_juros_nao_segregados boolean,
  p_rateios jsonb, p_contraparte uuid default null, p_observacoes text default null)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_rateios) <> 'array' or jsonb_array_length(p_rateios) = 0 then
    raise exception 'Informe ao menos uma conta no rateio.' using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;
  insert into fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, situacao, data_competencia,
                               data_vencimento, data_liquidacao, descricao, documento, juros_nao_segregados,
                               contraparte_id, observacoes)
  values (p_empresa, p_direcao, p_valor_total, p_conta_caixa, p_situacao, p_competencia, p_vencimento, p_liquidacao, p_descricao, p_documento,
          coalesce(p_juros_nao_segregados, false), p_contraparte, nullif(btrim(p_observacoes), ''))
  returning id into v_id;
  insert into fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor)
  select p_empresa, v_id, (r ->> 'conta_id')::uuid, (r ->> 'valor')::numeric from jsonb_array_elements(p_rateios) r;
  return v_id;
end;
$$;

create function public.fin_editar_lancamento(
  p_id uuid, p_direcao text, p_valor_total numeric, p_conta_caixa uuid, p_situacao text, p_competencia date,
  p_vencimento date, p_liquidacao date, p_descricao text, p_documento text, p_juros_nao_segregados boolean,
  p_rateios jsonb, p_contraparte uuid default null, p_observacoes text default null)
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
    descricao = p_descricao, documento = p_documento, juros_nao_segregados = coalesce(p_juros_nao_segregados, false),
    contraparte_id = p_contraparte, observacoes = nullif(btrim(p_observacoes), '')
  where id = p_id;
  return p_id;
end;
$$;

revoke execute on function
  public.fin_lancar(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb, uuid, text),
  public.fin_editar_lancamento(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb, uuid, text)
  from public, anon;
grant execute on function
  public.fin_lancar(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb, uuid, text),
  public.fin_editar_lancamento(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb, uuid, text)
  to authenticated;
