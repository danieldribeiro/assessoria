-- Cartões de crédito e faturas (docs/axis-financeiro/fatura-cartao-proposta-v2.md, aprovada em 23/10/2026).
-- Cada compra no cartão é um lançamento próprio, com categoria (rateio), fornecedor e observações, e fica dentro
-- de uma fatura. Enquanto a fatura está aberta, as compras ficam previstas, com o vencimento da fatura. Pagar a
-- fatura marca todas as compras como realizadas na data do pagamento, numa transação. Assim:
--   - Resultado (DRE): cada compra entra uma vez, pela competência (a data da compra);
--   - Fluxo de caixa: a saída aparece na data do pagamento, distribuída pelas categorias das compras;
--   - Saldo: a conta de caixa que paga a fatura cai uma vez, pelo total.
-- A linha do extrato do banco ("PAGTO FATURA") pode ser conciliada com a fatura inteira.
-- Compra parcelada vira uma parcela por fatura, todas com a competência da compra.
-- Os lançamentos que já existem não mudam (ficam sem fatura). Não muda nada do núcleo do diagnóstico.

-- ---------------------------------------------------------------------------
-- Cartões
-- ---------------------------------------------------------------------------

create table public.fin_cartoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  -- Conta de caixa que paga a fatura: as compras do cartão saem dela quando a fatura é paga.
  conta_caixa_id uuid not null,
  dia_fechamento smallint not null,
  dia_vencimento smallint not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_cartoes_empresa_id unique (empresa_id, id),
  constraint fin_cartoes_caixa foreign key (empresa_id, conta_caixa_id) references public.fin_contas_caixa (empresa_id, id),
  constraint fin_cartoes_nome_nao_branco check (btrim(nome) <> ''),
  constraint fin_cartoes_dias_validos check (dia_fechamento between 1 and 31 and dia_vencimento between 1 and 31)
);
create unique index fin_cartoes_nome_unico on public.fin_cartoes (empresa_id, lower(btrim(nome)));

-- ---------------------------------------------------------------------------
-- Faturas: uma por cartão e mês de vencimento (referência)
-- ---------------------------------------------------------------------------

create table public.fin_faturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  cartao_id uuid not null,
  referencia date not null, -- primeiro dia do mês do vencimento
  data_fechamento date not null,
  data_vencimento date not null,
  situacao text not null default 'aberta',
  data_pagamento date,
  valor_pago numeric(14, 2),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fin_faturas_empresa_id unique (empresa_id, id),
  constraint fin_faturas_cartao foreign key (empresa_id, cartao_id) references public.fin_cartoes (empresa_id, id),
  constraint fin_faturas_referencia_unica unique (cartao_id, referencia),
  constraint fin_faturas_referencia_mes check (referencia = date_trunc('month', referencia)::date),
  constraint fin_faturas_datas check (data_fechamento <= data_vencimento),
  constraint fin_faturas_situacao_valida check (situacao in ('aberta', 'paga')),
  constraint fin_faturas_pagamento_coerente check (
    (situacao = 'aberta' and data_pagamento is null and valor_pago is null)
    or (situacao = 'paga' and data_pagamento is not null and valor_pago > 0))
);

-- ---------------------------------------------------------------------------
-- Lançamento: fatura (compra no cartão) e parcela
-- ---------------------------------------------------------------------------

alter table public.fin_lancamentos
  add column fatura_id uuid,
  add column compra_id uuid, -- mesmo valor nas parcelas de uma compra
  add column parcela smallint,
  add column parcelas smallint,
  add constraint fin_lancamentos_fatura foreign key (empresa_id, fatura_id) references public.fin_faturas (empresa_id, id),
  add constraint fin_lancamentos_parcela_valida check (
    (compra_id is null and parcela is null and parcelas is null)
    or (compra_id is not null and fatura_id is not null and parcelas between 1 and 48 and parcela between 1 and parcelas));
create index fin_lancamentos_fatura_idx on public.fin_lancamentos (fatura_id) where fatura_id is not null;
create index fin_lancamentos_compra_idx on public.fin_lancamentos (compra_id) where compra_id is not null;

-- ---------------------------------------------------------------------------
-- Extrato: a movimentação pode ser conciliada com uma fatura inteira
-- ---------------------------------------------------------------------------

alter table public.fin_extrato_movimentos
  add column fatura_id uuid,
  add constraint fin_movimentos_fatura foreign key (empresa_id, fatura_id) references public.fin_faturas (empresa_id, id),
  add constraint fin_movimentos_fatura_unica unique (fatura_id);
-- Conciliado tem exatamente um vínculo: lançamento, transferência ou fatura.
alter table public.fin_extrato_movimentos drop constraint fin_movimentos_situacao_coerente;
alter table public.fin_extrato_movimentos add constraint fin_movimentos_situacao_coerente check (
  (situacao = 'pendente' and num_nonnulls(lancamento_id, transferencia_id, fatura_id) = 0 and motivo is null and conciliado_em is null)
  or (situacao = 'conciliado' and num_nonnulls(lancamento_id, transferencia_id, fatura_id) = 1 and motivo is null and conciliado_em is not null)
  or (situacao = 'ignorado' and num_nonnulls(lancamento_id, transferencia_id, fatura_id) = 0 and btrim(coalesce(motivo, '')) <> '' and conciliado_em is not null));

-- ---------------------------------------------------------------------------
-- Datas da fatura
-- ---------------------------------------------------------------------------

-- Dia p_dia do mês de p_mes; se o mês tem menos dias, o último dia.
create function public.fin_dia_no_mes(p_mes date, p_dia int)
returns date language sql immutable set search_path = public as $$
  select date_trunc('month', p_mes)::date
         + (least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int) - 1);
$$;

-- Mês de vencimento (referência) da fatura em que cai uma compra feita em p_data. Compra antes do dia de
-- fechamento entra na fatura que fecha naquele mês; no dia do fechamento ou depois, na do mês seguinte.
-- Se o vencimento é num dia depois do fechamento, vence no mesmo mês do fechamento; senão, no mês seguinte.
create function public.fin_referencia_da_compra(p_cartao uuid, p_data date)
returns date language sql stable set search_path = public as $$
  select (date_trunc('month', p_data)
          + case when p_data < public.fin_dia_no_mes(p_data, c.dia_fechamento) then interval '0' else interval '1 month' end
          + case when c.dia_vencimento > c.dia_fechamento then interval '0' else interval '1 month' end)::date
  from fin_cartoes c where c.id = p_cartao;
$$;

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------

-- Cartão: empresa fixa; conta de caixa ativa; a conta que paga não muda depois da primeira fatura.
create function public.fin_cartoes_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.empresa_id <> old.empresa_id then
    raise exception 'O cartão não pode mudar de empresa.' using errcode = 'check_violation', constraint = 'fin_cartoes_empresa_fixa';
  end if;
  if (tg_op = 'INSERT' or new.conta_caixa_id <> old.conta_caixa_id)
     and not exists (select 1 from fin_contas_caixa where id = new.conta_caixa_id and ativa) then
    raise exception 'A conta de caixa está inativa.' using errcode = 'check_violation', constraint = 'fin_cartoes_caixa_ativa';
  end if;
  if tg_op = 'UPDATE' and new.conta_caixa_id <> old.conta_caixa_id and exists (select 1 from fin_faturas where cartao_id = new.id) then
    raise exception 'A conta que paga a fatura não muda depois da primeira fatura. Cadastre outro cartão.'
      using errcode = 'check_violation', constraint = 'fin_cartoes_caixa_fixa';
  end if;
  return new;
end;
$$;
create trigger fin_cartoes_validar before insert or update on public.fin_cartoes
  for each row execute function public.fin_cartoes_validar();
create trigger tocar_atualizado_em before update on public.fin_cartoes
  for each row execute function public.tocar_atualizado_em();

-- Fatura: cartão e referência fixos; datas só mudam com a fatura aberta; paga conciliada não volta a aberta.
create function public.fin_faturas_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.situacao <> 'aberta' then
      raise exception 'Fatura nova nasce aberta.' using errcode = 'check_violation', constraint = 'fin_faturas_transicao';
    end if;
    return new;
  end if;
  if (new.empresa_id, new.cartao_id, new.referencia) is distinct from (old.empresa_id, old.cartao_id, old.referencia) then
    raise exception 'O cartão e o mês da fatura não mudam.' using errcode = 'check_violation', constraint = 'fin_faturas_campos_fixos';
  end if;
  if old.situacao = 'paga' and (new.data_fechamento, new.data_vencimento) is distinct from (old.data_fechamento, old.data_vencimento) then
    raise exception 'As datas de uma fatura paga não mudam.' using errcode = 'check_violation', constraint = 'fin_faturas_campos_fixos';
  end if;
  if old.situacao = 'paga' and new.situacao = 'aberta' and exists (select 1 from fin_extrato_movimentos where fatura_id = new.id) then
    raise exception 'O pagamento desta fatura está conciliado com o extrato. Desfaça a conciliação antes.'
      using errcode = 'check_violation', constraint = 'fin_faturas_conciliada';
  end if;
  return new;
end;
$$;
create trigger fin_faturas_validar before insert or update on public.fin_faturas
  for each row execute function public.fin_faturas_validar();
create trigger tocar_atualizado_em before update on public.fin_faturas
  for each row execute function public.tocar_atualizado_em();

-- Lançamento entrando numa fatura (ou trocando de fatura): a fatura precisa estar aberta.
create function public.fin_lancamentos_fatura_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fatura_id is not null and (tg_op = 'INSERT' or new.fatura_id is distinct from old.fatura_id)
     and not exists (select 1 from fin_faturas where id = new.fatura_id and situacao = 'aberta') then
    raise exception 'Essa fatura já foi paga. Desfaça o pagamento para mudar as compras dela.'
      using errcode = 'check_violation', constraint = 'fin_faturas_fechada';
  end if;
  if tg_op = 'UPDATE' and old.fatura_id is not null and new.fatura_id is distinct from old.fatura_id
     and exists (select 1 from fin_faturas where id = old.fatura_id and situacao = 'paga') then
    raise exception 'Essa fatura já foi paga. Desfaça o pagamento para mudar as compras dela.'
      using errcode = 'check_violation', constraint = 'fin_faturas_fechada';
  end if;
  return new;
end;
$$;
create trigger fin_lancamentos_fatura_validar before insert or update on public.fin_lancamentos
  for each row execute function public.fin_lancamentos_fatura_validar();

-- Coerência da fatura com as compras, conferida no fim da transação (como a soma exata do rateio):
--   - toda compra não cancelada sai da conta de caixa do cartão;
--   - fatura aberta: compras previstas, com o vencimento da fatura;
--   - fatura paga: compras realizadas na data do pagamento, somando (saídas − entradas) o valor pago.
create function public.fin_fatura_conferir(p_fatura uuid)
returns void language plpgsql set search_path = public as $$
declare
  v_fatura record;
  v_total numeric;
begin
  select f.*, c.conta_caixa_id into v_fatura from fin_faturas f join fin_cartoes c on c.id = f.cartao_id where f.id = p_fatura;
  if v_fatura.id is null then return; end if;
  if exists (select 1 from fin_lancamentos where fatura_id = p_fatura and situacao <> 'cancelado' and conta_caixa_id <> v_fatura.conta_caixa_id) then
    raise exception 'Compra no cartão sai da conta de caixa que paga a fatura.' using errcode = 'check_violation', constraint = 'fin_faturas_mesma_caixa';
  end if;
  if v_fatura.situacao = 'aberta' then
    if exists (select 1 from fin_lancamentos where fatura_id = p_fatura and situacao <> 'cancelado'
               and (situacao <> 'previsto' or data_vencimento <> v_fatura.data_vencimento)) then
      raise exception 'Compra no cartão fica prevista, com o vencimento da fatura, até a fatura ser paga. Para pagar, use Pagar fatura.'
        using errcode = 'check_violation', constraint = 'fin_faturas_compras_abertas';
    end if;
  else
    if exists (select 1 from fin_lancamentos where fatura_id = p_fatura and situacao <> 'cancelado'
               and (situacao <> 'realizado' or data_liquidacao <> v_fatura.data_pagamento)) then
      raise exception 'As compras de uma fatura paga ficam realizadas na data do pagamento.'
        using errcode = 'check_violation', constraint = 'fin_faturas_compras_pagas';
    end if;
    select coalesce(sum(case when direcao = 'saida' then valor_total else -valor_total end), 0) into v_total
      from fin_lancamentos where fatura_id = p_fatura and situacao <> 'cancelado';
    if v_total <> v_fatura.valor_pago then
      raise exception 'Essa fatura já foi paga. Desfaça o pagamento para mudar as compras dela.'
        using errcode = 'check_violation', constraint = 'fin_faturas_total_pago';
    end if;
  end if;
end;
$$;

create function public.fin_faturas_conferir_gatilho()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'fin_faturas' then
    perform public.fin_fatura_conferir(new.id);
  else
    if new.fatura_id is not null then perform public.fin_fatura_conferir(new.fatura_id); end if;
    if tg_op = 'UPDATE' and old.fatura_id is not null and old.fatura_id is distinct from new.fatura_id then
      perform public.fin_fatura_conferir(old.fatura_id);
    end if;
  end if;
  return null;
end;
$$;
create constraint trigger fin_faturas_coerentes after insert or update on public.fin_faturas
  deferrable initially deferred for each row execute function public.fin_faturas_conferir_gatilho();
create constraint trigger fin_lancamentos_fatura_coerente after insert or update on public.fin_lancamentos
  deferrable initially deferred for each row execute function public.fin_faturas_conferir_gatilho();

-- Movimentação do extrato: regras da 0010, mais a conciliação com fatura (paga, da mesma conta de caixa,
-- saída do mesmo valor pago).
create or replace function public.fin_movimentos_validar()
returns trigger language plpgsql set search_path = public as $$
declare
  v_lanc record;
  v_transf record;
  v_fatura record;
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
    select direcao, valor_total, conta_caixa_id, situacao, fatura_id into v_lanc from fin_lancamentos where id = new.lancamento_id;
    if v_lanc.fatura_id is not null then
      raise exception 'Compra no cartão não é conciliada sozinha: relacione a movimentação com a fatura.'
        using errcode = 'check_violation', constraint = 'fin_movimentos_compra_no_cartao';
    end if;
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

  if new.fatura_id is not null then
    select f.situacao, f.valor_pago, c.conta_caixa_id into v_fatura
      from fin_faturas f join fin_cartoes c on c.id = f.cartao_id where f.id = new.fatura_id;
    if v_fatura.situacao <> 'paga' then
      raise exception 'Só fatura paga é conciliada.' using errcode = 'check_violation', constraint = 'fin_movimentos_fatura_paga';
    end if;
    if v_fatura.conta_caixa_id <> new.conta_caixa_id then
      raise exception 'A fatura é paga por outra conta de caixa.' using errcode = 'check_violation', constraint = 'fin_movimentos_mesma_caixa';
    end if;
    if v_direcao <> 'saida' or v_fatura.valor_pago <> abs(new.valor) then
      raise exception 'O pagamento da fatura precisa ser uma saída do mesmo valor (%).', v_fatura.valor_pago
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

-- ---------------------------------------------------------------------------
-- Regras de acesso
-- ---------------------------------------------------------------------------

alter table public.fin_cartoes enable row level security;
alter table public.fin_faturas enable row level security;

create policy ler on public.fin_cartoes for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_cartoes for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'administrar'));
create policy alterar on public.fin_cartoes for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'administrar')) with check (public.pode_usar_financeiro(empresa_id, 'administrar'));

-- Faturas nascem ao lançar uma compra; quem lança cria a fatura.
create policy ler on public.fin_faturas for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_faturas for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy alterar on public.fin_faturas for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Funções. Rodam com a permissão de quem chama (as regras acima valem).
-- ---------------------------------------------------------------------------

-- Fatura do cartão no mês de vencimento p_referencia; cria se ainda não existe.
create function public.fin_obter_fatura(p_cartao uuid, p_referencia date)
returns uuid language plpgsql set search_path = public as $$
declare
  v_cartao record;
  v_ref date := date_trunc('month', p_referencia)::date;
  v_id uuid;
begin
  select * into v_cartao from fin_cartoes where id = p_cartao;
  if v_cartao.id is null then
    raise exception 'Cartão não encontrado.' using errcode = 'check_violation', constraint = 'fin_cartoes_nao_encontrado';
  end if;
  insert into fin_faturas (empresa_id, cartao_id, referencia, data_fechamento, data_vencimento)
  values (v_cartao.empresa_id, p_cartao, v_ref,
          public.fin_dia_no_mes((v_ref - case when v_cartao.dia_vencimento > v_cartao.dia_fechamento then interval '0' else interval '1 month' end)::date,
                                v_cartao.dia_fechamento),
          public.fin_dia_no_mes(v_ref, v_cartao.dia_vencimento))
  on conflict (cartao_id, referencia) do nothing;
  select id into v_id from fin_faturas where cartao_id = p_cartao and referencia = v_ref;
  return v_id;
end;
$$;

-- Compra no cartão, à vista ou parcelada. Cada parcela é um lançamento previsto na fatura do mês, com a
-- competência da compra (p_competencia, ou a data da compra) e o rateio proporcional; centavos que sobram na
-- divisão vão para a primeira parcela e, no rateio, para a maior conta. p_primeira_fatura: mês de vencimento
-- da fatura da primeira parcela; vazio, calcula pelo dia de fechamento. Entrada = estorno ou crédito na fatura.
-- p_rateios: [{"conta_id": "...", "valor": 123.45}, ...], somando p_valor_total. Devolve o id da compra.
create function public.fin_lancar_no_cartao(
  p_cartao uuid, p_direcao text, p_valor_total numeric, p_data_compra date, p_parcelas int, p_primeira_fatura date,
  p_descricao text, p_documento text, p_rateios jsonb, p_contraparte uuid default null, p_observacoes text default null,
  p_competencia date default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v_cartao record;
  v_compra uuid := gen_random_uuid();
  v_total int := round(p_valor_total * 100);
  v_n int := coalesce(p_parcelas, 1);
  v_ref date;
  v_fatura record;
  v_fatura_id uuid;
  v_parcela int;
  v_id uuid;
  v_linhas jsonb;
  v_soma int;
  v_i int;
begin
  select * into v_cartao from fin_cartoes where id = p_cartao;
  if v_cartao.id is null then
    raise exception 'Cartão não encontrado.' using errcode = 'check_violation', constraint = 'fin_cartoes_nao_encontrado';
  end if;
  if not v_cartao.ativo then
    raise exception 'O cartão está inativo.' using errcode = 'check_violation', constraint = 'fin_cartoes_ativo';
  end if;
  if v_n not between 1 and 48 then
    raise exception 'Parcelas: de 1 a 48.' using errcode = 'check_violation', constraint = 'fin_lancamentos_parcela_valida';
  end if;
  if p_valor_total is null or p_valor_total <= 0 or p_valor_total * 100 <> v_total then
    raise exception 'O valor precisa ser maior que zero, com até duas casas decimais.' using errcode = 'check_violation', constraint = 'fin_lancamentos_valor_positivo';
  end if;
  if v_total < v_n then
    raise exception 'O valor é pequeno demais para tantas parcelas.' using errcode = 'check_violation', constraint = 'fin_lancamentos_parcela_valida';
  end if;
  if jsonb_typeof(p_rateios) <> 'array' or jsonb_array_length(p_rateios) = 0 then
    raise exception 'Informe ao menos uma conta no rateio.' using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;
  select sum(round((r ->> 'valor')::numeric * 100)) into v_soma from jsonb_array_elements(p_rateios) r;
  if v_soma <> v_total then
    raise exception 'O rateio soma % e a compra é de %. A soma precisa ser exata.', v_soma / 100.0, p_valor_total
      using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;

  v_ref := coalesce(date_trunc('month', p_primeira_fatura)::date, public.fin_referencia_da_compra(p_cartao, p_data_compra));
  for v_i in 1 .. v_n loop
    v_parcela := v_total / v_n + case when v_i = 1 then v_total % v_n else 0 end;
    v_fatura_id := public.fin_obter_fatura(p_cartao, (v_ref + make_interval(months => v_i - 1))::date);
    select * into v_fatura from fin_faturas where id = v_fatura_id;
    if v_fatura.situacao <> 'aberta' then
      raise exception 'A fatura de % já foi paga. Escolha outra fatura ou desfaça o pagamento.', to_char(v_fatura.referencia, 'MM/YYYY')
        using errcode = 'check_violation', constraint = 'fin_faturas_fechada';
    end if;

    insert into fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, situacao, data_competencia, data_vencimento,
                                 descricao, documento, contraparte_id, observacoes, fatura_id, compra_id, parcela, parcelas)
    values (v_cartao.empresa_id, p_direcao, v_parcela / 100.0, v_cartao.conta_caixa_id, 'previsto',
            coalesce(p_competencia, p_data_compra), v_fatura.data_vencimento,
            btrim(p_descricao) || case when v_n > 1 then format(' (%s/%s)', v_i, v_n) else '' end,
            nullif(btrim(p_documento), ''), p_contraparte, nullif(btrim(p_observacoes), ''), v_fatura.id, v_compra, v_i, v_n)
    returning id into v_id;

    -- Rateio proporcional, em centavos; a diferença do arredondamento vai para a maior conta.
    with linhas as (
      select (r ->> 'conta_id')::uuid conta, round((r ->> 'valor')::numeric * 100)::int centavos, ord
      from jsonb_array_elements(p_rateios) with ordinality as x(r, ord)),
    proporcional as (
      select conta, ord, centavos, round(centavos::numeric * v_parcela / v_total)::int valor from linhas),
    ajuste as (
      select conta, valor + case when ord = (select ord from proporcional order by centavos desc, ord limit 1)
                                 then v_parcela - (select sum(valor) from proporcional) else 0 end valor
      from proporcional)
    select jsonb_agg(jsonb_build_object('conta', conta, 'valor', valor)) into v_linhas from ajuste;

    insert into fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor)
    select v_cartao.empresa_id, v_id, (l ->> 'conta')::uuid, (l ->> 'valor')::int / 100.0
    from jsonb_array_elements(v_linhas) l where (l ->> 'valor')::int > 0;
  end loop;
  return v_compra;
end;
$$;

-- Paga a fatura: todas as compras não canceladas passam a realizadas na data do pagamento, e a fatura guarda o
-- valor pago (saídas − entradas).
create function public.fin_pagar_fatura(p_fatura uuid, p_data date)
returns numeric language plpgsql set search_path = public as $$
declare
  v_fatura record;
  v_total numeric;
begin
  select * into v_fatura from fin_faturas where id = p_fatura for update;
  if v_fatura.id is null then
    raise exception 'Fatura não encontrada.' using errcode = 'check_violation', constraint = 'fin_faturas_nao_encontrada';
  end if;
  if v_fatura.situacao <> 'aberta' then
    raise exception 'Essa fatura já foi paga.' using errcode = 'check_violation', constraint = 'fin_faturas_transicao';
  end if;
  if p_data is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'check_violation', constraint = 'fin_faturas_pagamento_coerente';
  end if;
  select coalesce(sum(case when direcao = 'saida' then valor_total else -valor_total end), 0) into v_total
    from fin_lancamentos where fatura_id = p_fatura and situacao <> 'cancelado';
  if v_total <= 0 then
    raise exception 'A fatura não tem valor a pagar.' using errcode = 'check_violation', constraint = 'fin_faturas_total_positivo';
  end if;
  update fin_faturas set situacao = 'paga', data_pagamento = p_data, valor_pago = v_total where id = p_fatura;
  update fin_lancamentos set situacao = 'realizado', data_liquidacao = p_data
  where fatura_id = p_fatura and situacao = 'previsto';
  return v_total;
end;
$$;

-- Desfaz o pagamento: as compras voltam a previstas, com o vencimento da fatura. Recusado se o pagamento
-- estiver conciliado com o extrato.
create function public.fin_desfazer_pagamento_fatura(p_fatura uuid)
returns void language plpgsql set search_path = public as $$
declare v_fatura record;
begin
  select * into v_fatura from fin_faturas where id = p_fatura for update;
  if v_fatura.id is null then
    raise exception 'Fatura não encontrada.' using errcode = 'check_violation', constraint = 'fin_faturas_nao_encontrada';
  end if;
  if v_fatura.situacao <> 'paga' then
    raise exception 'Essa fatura não está paga.' using errcode = 'check_violation', constraint = 'fin_faturas_transicao';
  end if;
  update fin_faturas set situacao = 'aberta', data_pagamento = null, valor_pago = null where id = p_fatura;
  update fin_lancamentos set situacao = 'previsto', data_liquidacao = null, data_vencimento = v_fatura.data_vencimento
  where fatura_id = p_fatura and situacao = 'realizado';
end;
$$;

-- Muda o fechamento e o vencimento de uma fatura aberta (por exemplo, vencimento que caiu num feriado);
-- as compras dela acompanham o novo vencimento.
create function public.fin_ajustar_fatura(p_fatura uuid, p_fechamento date, p_vencimento date)
returns void language plpgsql set search_path = public as $$
begin
  update fin_faturas set data_fechamento = p_fechamento, data_vencimento = p_vencimento where id = p_fatura and situacao = 'aberta';
  if not found then
    raise exception 'Só as datas de uma fatura aberta mudam.' using errcode = 'check_violation', constraint = 'fin_faturas_campos_fixos';
  end if;
  update fin_lancamentos set data_vencimento = p_vencimento where fatura_id = p_fatura and situacao = 'previsto';
end;
$$;

-- Relaciona a movimentação do extrato com a fatura inteira. Se a fatura ainda está aberta, ela é paga na data
-- do banco, na mesma transação.
create function public.fin_conciliar_fatura(p_movimento uuid, p_fatura uuid)
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
  if exists (select 1 from fin_faturas where id = p_fatura and empresa_id = v_mov.empresa_id and situacao = 'aberta') then
    perform public.fin_pagar_fatura(p_fatura, v_mov.data);
  end if;
  update fin_extrato_movimentos set situacao = 'conciliado', fatura_id = p_fatura where id = p_movimento;
end;
$$;

revoke execute on function
  public.fin_dia_no_mes(date, int),
  public.fin_referencia_da_compra(uuid, date),
  public.fin_fatura_conferir(uuid),
  public.fin_obter_fatura(uuid, date),
  public.fin_lancar_no_cartao(uuid, text, numeric, date, int, date, text, text, jsonb, uuid, text, date),
  public.fin_pagar_fatura(uuid, date),
  public.fin_desfazer_pagamento_fatura(uuid),
  public.fin_ajustar_fatura(uuid, date, date),
  public.fin_conciliar_fatura(uuid, uuid)
  from public, anon;
-- A conferência roda nos gatilhos, com a permissão de quem grava: quem lança precisa poder executá-la.
grant execute on function
  public.fin_dia_no_mes(date, int),
  public.fin_referencia_da_compra(uuid, date),
  public.fin_fatura_conferir(uuid),
  public.fin_obter_fatura(uuid, date),
  public.fin_lancar_no_cartao(uuid, text, numeric, date, int, date, text, text, jsonb, uuid, text, date),
  public.fin_pagar_fatura(uuid, date),
  public.fin_desfazer_pagamento_fatura(uuid),
  public.fin_ajustar_fatura(uuid, date, date),
  public.fin_conciliar_fatura(uuid, uuid)
  to authenticated;
