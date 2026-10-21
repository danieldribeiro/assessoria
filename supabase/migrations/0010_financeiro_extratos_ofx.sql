-- Extratos bancários (OFX) e conciliação (docs/axis-financeiro/evolucao-modulo-financeiro.md, etapa 3).
-- O extrato é um espelho do banco para conferência: não mexe em saldo, fluxo, painel nem DRE, que continuam vindo
-- só dos lançamentos. Importar não cria lançamento. Cada movimentação fica pendente até ser relacionada a um
-- lançamento ou a uma transferência, virar um lançamento novo ou ser ignorada com motivo.
-- Duplicidade: cada movimentação tem uma chave única por conta de caixa (o identificador do banco, FITID, ou, sem
-- ele, data + valor + descrição + a posição entre as iguais no arquivo). Importar o mesmo arquivo de novo não grava nada.
-- Uma movimentação se liga a um lançamento só, e um lançamento a uma movimentação só.
-- Não muda nada do núcleo do diagnóstico.

-- ---------------------------------------------------------------------------
-- Arquivos importados
-- ---------------------------------------------------------------------------

create table public.fin_extratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  conta_caixa_id uuid not null,
  arquivo_nome text not null,
  arquivo_sha256 text not null,
  banco text,
  agencia text,
  conta text,
  periodo_inicio date,
  periodo_fim date,
  saldo_banco numeric(14, 2),
  saldo_banco_em date,
  lidas int not null default 0,
  novas int not null default 0,
  duplicadas int not null default 0,
  com_erro int not null default 0,
  importado_em timestamptz not null default now(),
  importado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_extratos_empresa_id unique (empresa_id, id),
  constraint fin_extratos_caixa foreign key (empresa_id, conta_caixa_id) references public.fin_contas_caixa (empresa_id, id),
  constraint fin_extratos_sha256_valido check (arquivo_sha256 ~ '^[0-9a-f]{64}$'),
  constraint fin_extratos_nome_nao_branco check (btrim(arquivo_nome) <> ''),
  constraint fin_extratos_contagens check (lidas >= 0 and novas >= 0 and duplicadas >= 0 and com_erro >= 0)
);
create index fin_extratos_caixa_idx on public.fin_extratos (empresa_id, conta_caixa_id, importado_em desc);

-- ---------------------------------------------------------------------------
-- Movimentações do extrato
-- ---------------------------------------------------------------------------

-- Para a movimentação apontar para a transferência da mesma empresa (chave composta, como nas outras tabelas fin_).
alter table public.fin_transferencias add constraint fin_transferencias_empresa_id unique (empresa_id, id);

create table public.fin_extrato_movimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  extrato_id uuid not null,
  conta_caixa_id uuid not null,
  data date not null,
  valor numeric(14, 2) not null, -- crédito positivo, débito negativo
  tipo_ofx text,
  descricao text not null,
  fitid text,
  documento text,
  chave text not null,
  situacao text not null default 'pendente',
  lancamento_id uuid,
  transferencia_id uuid,
  motivo text,
  conciliado_em timestamptz,
  conciliado_por uuid references public.perfis (id),
  criado_em timestamptz not null default now(),
  constraint fin_movimentos_empresa_id unique (empresa_id, id),
  constraint fin_movimentos_extrato foreign key (empresa_id, extrato_id) references public.fin_extratos (empresa_id, id),
  constraint fin_movimentos_caixa foreign key (empresa_id, conta_caixa_id) references public.fin_contas_caixa (empresa_id, id),
  constraint fin_movimentos_lancamento foreign key (empresa_id, lancamento_id) references public.fin_lancamentos (empresa_id, id),
  constraint fin_movimentos_transferencia foreign key (empresa_id, transferencia_id) references public.fin_transferencias (empresa_id, id),
  constraint fin_movimentos_chave_unica unique (empresa_id, conta_caixa_id, chave),
  constraint fin_movimentos_lancamento_unico unique (lancamento_id),
  constraint fin_movimentos_transferencia_unica unique (transferencia_id, conta_caixa_id),
  constraint fin_movimentos_valor_nao_zero check (valor <> 0),
  constraint fin_movimentos_descricao_nao_branca check (btrim(descricao) <> ''),
  constraint fin_movimentos_chave_nao_branca check (btrim(chave) <> ''),
  constraint fin_movimentos_situacao_valida check (situacao in ('pendente', 'conciliado', 'ignorado')),
  -- Pendente não tem vínculo; conciliado tem exatamente um (lançamento ou transferência); ignorado tem motivo.
  constraint fin_movimentos_situacao_coerente check (
    (situacao = 'pendente' and lancamento_id is null and transferencia_id is null and motivo is null and conciliado_em is null)
    or (situacao = 'conciliado' and (lancamento_id is null) <> (transferencia_id is null) and motivo is null and conciliado_em is not null)
    or (situacao = 'ignorado' and lancamento_id is null and transferencia_id is null and btrim(coalesce(motivo, '')) <> '' and conciliado_em is not null))
);
create index fin_movimentos_caixa_data_idx on public.fin_extrato_movimentos (empresa_id, conta_caixa_id, data);
create index fin_movimentos_pendentes_idx on public.fin_extrato_movimentos (empresa_id, data) where situacao = 'pendente';
create index fin_movimentos_extrato_idx on public.fin_extrato_movimentos (extrato_id);

-- O que veio do banco não muda; só a conciliação. A conciliação confere conta de caixa, sentido e valor.
create function public.fin_movimentos_validar()
returns trigger language plpgsql set search_path = public as $$
declare
  v_lanc record;
  v_transf record;
  v_direcao text := (array['saida', 'entrada'])[(new.valor > 0)::int + 1];
begin
  if tg_op = 'INSERT' then
    if new.situacao <> 'pendente' then
      raise exception 'Movimentação importada nasce pendente.' using errcode = 'check_violation', constraint = 'fin_movimentos_transicao';
    end if;
    if not exists (select 1 from fin_extratos where id = new.extrato_id and conta_caixa_id = new.conta_caixa_id) then
      raise exception 'A movimentação e o extrato precisam ser da mesma conta de caixa.'
        using errcode = 'check_violation', constraint = 'fin_movimentos_caixa_do_extrato';
    end if;
    return new;
  end if;

  if (new.empresa_id, new.extrato_id, new.conta_caixa_id, new.data, new.valor, new.tipo_ofx, new.descricao, new.fitid, new.documento, new.chave)
     is distinct from
     (old.empresa_id, old.extrato_id, old.conta_caixa_id, old.data, old.valor, old.tipo_ofx, old.descricao, old.fitid, old.documento, old.chave) then
    raise exception 'O que veio do banco não muda; só a conciliação.' using errcode = 'check_violation', constraint = 'fin_movimentos_campos_fixos';
  end if;
  if old.situacao <> 'pendente' and new.situacao <> 'pendente' then
    raise exception 'Desfaça a conciliação antes de conciliar de outro jeito.'
      using errcode = 'check_violation', constraint = 'fin_movimentos_transicao';
  end if;

  if new.lancamento_id is not null then
    select direcao, valor_total, conta_caixa_id, situacao into v_lanc from fin_lancamentos where id = new.lancamento_id;
    if v_lanc.situacao <> 'realizado' then
      raise exception 'Só lançamento realizado é conciliado.' using errcode = 'check_violation', constraint = 'fin_movimentos_lancamento_realizado';
    end if;
    if v_lanc.conta_caixa_id <> new.conta_caixa_id then
      raise exception 'O lançamento é de outra conta de caixa.' using errcode = 'check_violation', constraint = 'fin_movimentos_mesma_caixa';
    end if;
    if v_lanc.direcao <> v_direcao or v_lanc.valor_total <> abs(new.valor) then
      raise exception 'O lançamento precisa ter o mesmo sentido e o mesmo valor da movimentação (%).', abs(new.valor)
        using errcode = 'check_violation', constraint = 'fin_movimentos_mesmo_valor';
    end if;
  end if;

  if new.transferencia_id is not null then
    select conta_origem_id, conta_destino_id, valor, situacao into v_transf from fin_transferencias where id = new.transferencia_id;
    if v_transf.situacao <> 'realizado' then
      raise exception 'A transferência está cancelada.' using errcode = 'check_violation', constraint = 'fin_movimentos_transferencia_realizada';
    end if;
    if (v_direcao = 'entrada' and new.conta_caixa_id <> v_transf.conta_destino_id)
       or (v_direcao = 'saida' and new.conta_caixa_id <> v_transf.conta_origem_id) then
      raise exception 'A transferência não sai (ou não chega) nesta conta de caixa.'
        using errcode = 'check_violation', constraint = 'fin_movimentos_mesma_caixa';
    end if;
    if v_transf.valor <> abs(new.valor) then
      raise exception 'A transferência precisa ter o mesmo valor da movimentação (%).', abs(new.valor)
        using errcode = 'check_violation', constraint = 'fin_movimentos_mesmo_valor';
    end if;
  end if;

  if new.situacao <> 'pendente' and old.situacao = 'pendente' then
    new.conciliado_em := now();
    new.conciliado_por := auth.uid();
  elsif new.situacao = 'pendente' then
    new.conciliado_em := null;
    new.conciliado_por := null;
  end if;
  return new;
end;
$$;

create trigger fin_movimentos_validar before insert or update on public.fin_extrato_movimentos
  for each row execute function public.fin_movimentos_validar();

-- ---------------------------------------------------------------------------
-- Lançamento e transferência conciliados ficam presos à movimentação: valor, sentido, conta de caixa e situação
-- só mudam depois de desfazer a conciliação. Os demais campos (descrição, contas do rateio, fornecedor...) mudam.
-- ---------------------------------------------------------------------------

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
    if (new.direcao, new.valor_total, new.conta_caixa_id, new.situacao) is distinct from (old.direcao, old.valor_total, old.conta_caixa_id, old.situacao)
       and exists (select 1 from fin_extrato_movimentos where lancamento_id = new.id) then
      raise exception 'Este lançamento está conciliado com o extrato. Desfaça a conciliação para mudar valor, sentido, conta de caixa ou situação.'
        using errcode = 'check_violation', constraint = 'fin_lancamentos_conciliado';
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

create or replace function public.fin_transferencias_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.situacao <> 'realizado' then
      raise exception 'Transferência nova nasce realizada.' using errcode = 'check_violation', constraint = 'fin_transferencias_transicao';
    end if;
    if exists (select 1 from fin_contas_caixa where id in (new.conta_origem_id, new.conta_destino_id) and not ativa) then
      raise exception 'Uma das contas de caixa está inativa.' using errcode = 'check_violation', constraint = 'fin_transferencias_caixa_ativa';
    end if;
    if exists (select 1 from fin_contas_caixa where id in (new.conta_origem_id, new.conta_destino_id) and data_saldo_inicial > new.data) then
      raise exception 'A data é anterior ao saldo inicial de uma das contas de caixa.'
        using errcode = 'check_violation', constraint = 'fin_transferencias_antes_do_saldo_inicial';
    end if;
  else
    if old.situacao = 'cancelado' then
      raise exception 'Transferência cancelada não muda.' using errcode = 'check_violation', constraint = 'fin_transferencias_cancelada_final';
    end if;
    if (new.empresa_id, new.conta_origem_id, new.conta_destino_id, new.valor, new.data)
       is distinct from (old.empresa_id, old.conta_origem_id, old.conta_destino_id, old.valor, old.data) then
      raise exception 'Contas, valor e data não mudam. Cancele e registre de novo.'
        using errcode = 'check_violation', constraint = 'fin_transferencias_campos_fixos';
    end if;
    if new.situacao = 'cancelado' and exists (select 1 from fin_extrato_movimentos where transferencia_id = new.id) then
      raise exception 'Esta transferência está conciliada com o extrato. Desfaça a conciliação antes de cancelar.'
        using errcode = 'check_violation', constraint = 'fin_transferencias_conciliada';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Regras de acesso: ler com 'ler'; importar e conciliar com 'lancar'. Nada é removido pela API.
-- ---------------------------------------------------------------------------

alter table public.fin_extratos enable row level security;
alter table public.fin_extrato_movimentos enable row level security;
create policy ler on public.fin_extratos for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_extratos for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy alterar on public.fin_extratos for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy ler on public.fin_extrato_movimentos for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_extrato_movimentos for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy alterar on public.fin_extrato_movimentos for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Funções. Rodam com a permissão de quem chama (as regras acima valem).
-- ---------------------------------------------------------------------------

-- Grava o arquivo e as movimentações novas numa transação; as que já existem (mesma chave na conta de caixa)
-- são contadas como duplicadas e não gravadas. p_movimentos: [{"data", "valor", "tipo_ofx", "descricao", "fitid",
-- "documento", "chave"}, ...]. Devolve {"extrato_id", "novas", "duplicadas"}.
create function public.fin_importar_extrato(
  p_empresa uuid, p_conta_caixa uuid, p_arquivo_nome text, p_arquivo_sha256 text, p_banco text, p_agencia text,
  p_conta text, p_periodo_inicio date, p_periodo_fim date, p_saldo_banco numeric, p_saldo_banco_em date,
  p_lidas int, p_com_erro int, p_movimentos jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_extrato uuid;
  v_total int;
  v_novas int;
begin
  if jsonb_typeof(p_movimentos) <> 'array' then
    raise exception 'Movimentações em formato inválido.' using errcode = 'check_violation', constraint = 'fin_extratos_formato';
  end if;
  v_total := jsonb_array_length(p_movimentos);
  insert into fin_extratos (empresa_id, conta_caixa_id, arquivo_nome, arquivo_sha256, banco, agencia, conta,
                            periodo_inicio, periodo_fim, saldo_banco, saldo_banco_em, lidas, com_erro)
  values (p_empresa, p_conta_caixa, p_arquivo_nome, lower(p_arquivo_sha256), p_banco, p_agencia, p_conta,
          p_periodo_inicio, p_periodo_fim, p_saldo_banco, p_saldo_banco_em, coalesce(p_lidas, v_total), coalesce(p_com_erro, 0))
  returning id into v_extrato;

  with novas as (
    insert into fin_extrato_movimentos (empresa_id, extrato_id, conta_caixa_id, data, valor, tipo_ofx, descricao, fitid, documento, chave)
    select p_empresa, v_extrato, p_conta_caixa, (m ->> 'data')::date, (m ->> 'valor')::numeric(14, 2), m ->> 'tipo_ofx',
           m ->> 'descricao', nullif(m ->> 'fitid', ''), nullif(m ->> 'documento', ''), m ->> 'chave'
    from jsonb_array_elements(p_movimentos) m
    on conflict (empresa_id, conta_caixa_id, chave) do nothing
    returning 1)
  select count(*) into v_novas from novas;

  update fin_extratos set novas = v_novas, duplicadas = v_total - v_novas where id = v_extrato;
  return jsonb_build_object('extrato_id', v_extrato, 'novas', v_novas, 'duplicadas', v_total - v_novas);
end;
$$;

-- Relaciona a movimentação a um lançamento que já existe. Se o lançamento ainda está previsto, ele passa a
-- realizado na data do banco, na mesma transação.
create function public.fin_conciliar(p_movimento uuid, p_lancamento uuid)
returns void language plpgsql set search_path = public as $$
declare v_mov record;
begin
  select * into v_mov from fin_extrato_movimentos where id = p_movimento for update;
  if v_mov.id is null then
    raise exception 'Movimentação não encontrada.' using errcode = 'check_violation', constraint = 'fin_movimentos_nao_encontrada';
  end if;
  if v_mov.situacao <> 'pendente' then
    raise exception 'Esta movimentação já foi conciliada ou ignorada.' using errcode = 'check_violation', constraint = 'fin_movimentos_transicao';
  end if;
  update fin_lancamentos set situacao = 'realizado', data_liquidacao = v_mov.data
  where id = p_lancamento and empresa_id = v_mov.empresa_id and situacao = 'previsto';
  update fin_extrato_movimentos set situacao = 'conciliado', lancamento_id = p_lancamento where id = p_movimento;
end;
$$;

-- Cria o lançamento a partir da movimentação (realizado, na data do banco, com o valor e o sentido dela) e já concilia.
-- A origem do lançamento aponta para a movimentação, e a origem é única: a mesma movimentação não gera dois lançamentos.
create function public.fin_lancar_do_extrato(
  p_movimento uuid, p_competencia date, p_descricao text, p_documento text, p_juros_nao_segregados boolean,
  p_rateios jsonb, p_contraparte uuid default null, p_observacoes text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v_mov record;
  v_id uuid;
begin
  select * into v_mov from fin_extrato_movimentos where id = p_movimento for update;
  if v_mov.id is null then
    raise exception 'Movimentação não encontrada.' using errcode = 'check_violation', constraint = 'fin_movimentos_nao_encontrada';
  end if;
  if v_mov.situacao <> 'pendente' then
    raise exception 'Esta movimentação já foi conciliada ou ignorada.' using errcode = 'check_violation', constraint = 'fin_movimentos_transicao';
  end if;
  if jsonb_typeof(p_rateios) <> 'array' or jsonb_array_length(p_rateios) = 0 then
    raise exception 'Informe ao menos uma conta no rateio.' using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;
  insert into fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, situacao, data_competencia, data_liquidacao,
                               descricao, documento, juros_nao_segregados, contraparte_id, observacoes, origem_tipo, origem_id)
  values (v_mov.empresa_id, case when v_mov.valor > 0 then 'entrada' else 'saida' end, abs(v_mov.valor), v_mov.conta_caixa_id,
          'realizado', coalesce(p_competencia, v_mov.data), v_mov.data, coalesce(nullif(btrim(p_descricao), ''), v_mov.descricao),
          coalesce(nullif(btrim(p_documento), ''), v_mov.documento), coalesce(p_juros_nao_segregados, false), p_contraparte,
          nullif(btrim(p_observacoes), ''), 'extrato', v_mov.id)
  returning id into v_id;
  insert into fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor)
  select v_mov.empresa_id, v_id, (r ->> 'conta_id')::uuid, (r ->> 'valor')::numeric from jsonb_array_elements(p_rateios) r;
  update fin_extrato_movimentos set situacao = 'conciliado', lancamento_id = v_id where id = p_movimento;
  return v_id;
end;
$$;

revoke execute on function
  public.fin_importar_extrato(uuid, uuid, text, text, text, text, text, date, date, numeric, date, int, int, jsonb),
  public.fin_conciliar(uuid, uuid),
  public.fin_lancar_do_extrato(uuid, date, text, text, boolean, jsonb, uuid, text)
  from public, anon;
grant execute on function
  public.fin_importar_extrato(uuid, uuid, text, text, text, text, text, date, date, numeric, date, int, int, jsonb),
  public.fin_conciliar(uuid, uuid),
  public.fin_lancar_do_extrato(uuid, date, text, text, boolean, jsonb, uuid, text)
  to authenticated;
