-- Domínio financeiro, primeira entrega: plano de contas, contas de caixa, lançamentos com rateio,
-- transferências, saldos e fluxo de caixa. Desenho: docs/axis-financeiro/plano-arquitetura-v2.md.
-- Tabelas em public com prefixo fin_ (F10), todas com empresa_id e chaves compostas (empresa_id, id),
-- de modo que um registro nunca aponta para outro de outra empresa.
-- Não muda nada do núcleo do diagnóstico: só usa public.empresas, public.perfis e public.eh_equipe().
-- Nada é removido pela API: não há regra de exclusão em nenhuma tabela fin_. Conta deixa de ser usada
-- por desativação; lançamento e transferência, por cancelamento.

-- ---------------------------------------------------------------------------
-- Permissão única (F1): por enquanto, só a equipe. Para liberar usuários das empresas no futuro,
-- muda só o corpo desta função.
-- ---------------------------------------------------------------------------

create function public.pode_usar_financeiro(p_empresa uuid, p_acao text)
returns boolean language sql stable set search_path = public as $$
  select p_empresa is not null and p_acao in ('ler', 'lancar', 'administrar') and public.eh_equipe();
$$;

-- ---------------------------------------------------------------------------
-- Seções fixas da DRE (F3): as 12 linhas da DRE v4. Só leitura.
-- ---------------------------------------------------------------------------

create table public.fin_dre_secoes (
  numero smallint primary key check (numero between 1 and 12),
  nome text not null unique,
  recebe_contas boolean not null
);

insert into public.fin_dre_secoes (numero, nome, recebe_contas) values
  (1, 'Receita bruta', true),
  (2, '(−) Deduções comerciais', true),
  (3, '(−) Tributos sobre o faturamento / regime', true),
  (4, 'Receita líquida', false),
  (5, '(−) Custos diretos variáveis', true),
  (6, '(−) Despesas variáveis', true),
  (7, 'Margem de contribuição', false),
  (8, '(−) Despesas operacionais', true),
  (9, 'Resultado operacional gerencial', false),
  (10, '(+/−) Resultado financeiro', true),
  (11, '(−) Tributos sobre o lucro', true),
  (12, 'Resultado gerencial do período', false);

-- ---------------------------------------------------------------------------
-- Plano de contas (seção 2.1)
-- ---------------------------------------------------------------------------

create table public.fin_contas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  conta_pai_id uuid,
  codigo text not null,
  nome text not null,
  descricao text,
  tipo text not null,
  natureza text,
  classificacao text,
  comportamento_caixa text,
  dre_secao smallint references public.fin_dre_secoes (numero),
  custo_cmv boolean not null default false,
  ordem int not null default 0,
  ativa boolean not null default true,
  origem_modelo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_contas_empresa_id unique (empresa_id, id),
  constraint fin_contas_codigo_unico unique (empresa_id, codigo),
  constraint fin_contas_pai foreign key (empresa_id, conta_pai_id) references public.fin_contas (empresa_id, id),
  constraint fin_contas_codigo_nao_branco check (btrim(codigo) <> ''),
  constraint fin_contas_nome_nao_branco check (btrim(nome) <> ''),
  constraint fin_contas_tipo_valido check (tipo in ('grupo', 'analitica')),
  constraint fin_contas_natureza_valida check (natureza in ('receita', 'despesa', 'ativo', 'passivo', 'patrimonio_liquido')),
  constraint fin_contas_classificacao_valida check (classificacao in (
    'receita_bruta', 'deducao_comercial', 'tributo_sobre_faturamento', 'custo_direto_variavel', 'despesa_variavel',
    'despesa_operacional', 'receita_financeira', 'despesa_financeira', 'tributo_sobre_lucro', 'investimento',
    'financiamento', 'socios', 'transferencia')),
  constraint fin_contas_caixa_valido check (comportamento_caixa in (
    'operacional', 'investimento', 'financiamento', 'transferencia_interna', 'sem_caixa')),
  -- Grupo só soma: não tem classificação própria e pode indicar a seção da DRE que agrupa.
  constraint fin_contas_grupo_sem_classificacao check (
    tipo <> 'grupo' or (natureza is null and classificacao is null and comportamento_caixa is null and not custo_cmv)),
  -- Analítica recebe lançamento: natureza, classificação e caixa obrigatórios.
  constraint fin_contas_analitica_classificada check (
    tipo <> 'analitica' or (natureza is not null and classificacao is not null and comportamento_caixa is not null)),
  -- Matriz de coerência (coerencia-classificacoes.md, seção 1).
  constraint fin_contas_coerencia check (
    tipo <> 'analitica' or (classificacao, natureza, coalesce(dre_secao, 0), comportamento_caixa) in (
      ('receita_bruta', 'receita', 1, 'operacional'),
      ('deducao_comercial', 'despesa', 2, 'operacional'),
      ('deducao_comercial', 'despesa', 2, 'sem_caixa'),
      ('tributo_sobre_faturamento', 'despesa', 3, 'operacional'),
      ('custo_direto_variavel', 'despesa', 5, 'operacional'),
      ('custo_direto_variavel', 'despesa', 5, 'sem_caixa'),
      ('despesa_variavel', 'despesa', 6, 'operacional'),
      ('despesa_operacional', 'despesa', 8, 'operacional'),
      ('despesa_operacional', 'despesa', 8, 'sem_caixa'),
      ('receita_financeira', 'receita', 10, 'operacional'),
      ('despesa_financeira', 'despesa', 10, 'operacional'),
      ('despesa_financeira', 'despesa', 10, 'financiamento'),
      ('tributo_sobre_lucro', 'despesa', 11, 'operacional'),
      ('investimento', 'ativo', 0, 'investimento'),
      ('financiamento', 'passivo', 0, 'financiamento'),
      ('socios', 'patrimonio_liquido', 0, 'financiamento'),
      ('transferencia', 'ativo', 0, 'transferencia_interna'))),
  constraint fin_contas_cmv_so_custo check (not custo_cmv or classificacao = 'custo_direto_variavel'),
  -- As seções calculadas (4, 7, 9 e 12) nunca recebem conta.
  constraint fin_contas_secao_recebe_contas check (dre_secao is null or dre_secao in (1, 2, 3, 5, 6, 8, 10, 11))
);

-- Nome único entre irmãs, sem diferenciar maiúsculas (F6). Contas da raiz são irmãs entre si.
create unique index fin_contas_nome_entre_irmas on public.fin_contas (empresa_id, conta_pai_id, lower(btrim(nome))) nulls not distinct;
create index fin_contas_pai_idx on public.fin_contas (empresa_id, conta_pai_id);

-- Auditoria do plano de contas (regra 6).
create table public.fin_contas_eventos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null,
  conta_id uuid not null,
  acao text not null check (acao in ('criada', 'alterada')),
  antes jsonb,
  depois jsonb not null,
  por uuid,
  em timestamptz not null default now(),
  constraint fin_contas_eventos_conta foreign key (empresa_id, conta_id) references public.fin_contas (empresa_id, id)
);
create index fin_contas_eventos_conta_idx on public.fin_contas_eventos (conta_id, em);

-- ---------------------------------------------------------------------------
-- Contas de caixa (seção 3.1), com saldo inicial e data obrigatórios (3.3)
-- ---------------------------------------------------------------------------

create table public.fin_contas_caixa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  tipo text not null,
  saldo_inicial numeric(14, 2) not null,
  data_saldo_inicial date not null,
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_contas_caixa_empresa_id unique (empresa_id, id),
  constraint fin_contas_caixa_nome_nao_branco check (btrim(nome) <> ''),
  constraint fin_contas_caixa_tipo_valido check (tipo in ('banco', 'caixa', 'aplicacao'))
);
create unique index fin_contas_caixa_nome_unico on public.fin_contas_caixa (empresa_id, lower(btrim(nome)));

-- ---------------------------------------------------------------------------
-- Lançamentos e rateios (seção 3.1, V7)
-- ---------------------------------------------------------------------------

create table public.fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  direcao text not null,
  valor_total numeric(14, 2) not null,
  conta_caixa_id uuid not null,
  data_competencia date not null,
  data_vencimento date,
  data_liquidacao date,
  situacao text not null,
  descricao text not null,
  documento text,
  origem_tipo text,
  origem_id uuid,
  juros_nao_segregados boolean not null default false,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_lancamentos_empresa_id unique (empresa_id, id),
  constraint fin_lancamentos_conta_caixa foreign key (empresa_id, conta_caixa_id) references public.fin_contas_caixa (empresa_id, id),
  constraint fin_lancamentos_origem_unica unique (empresa_id, origem_tipo, origem_id),
  constraint fin_lancamentos_direcao_valida check (direcao in ('entrada', 'saida')),
  constraint fin_lancamentos_valor_positivo check (valor_total > 0),
  constraint fin_lancamentos_situacao_valida check (situacao in ('previsto', 'realizado', 'cancelado')),
  constraint fin_lancamentos_descricao_nao_branca check (btrim(descricao) <> ''),
  constraint fin_lancamentos_origem_completa check ((origem_tipo is null) = (origem_id is null)),
  constraint fin_lancamentos_realizado_liquidado check (situacao <> 'realizado' or data_liquidacao is not null),
  constraint fin_lancamentos_previsto_vencimento check (situacao <> 'previsto' or (data_vencimento is not null and data_liquidacao is null)),
  constraint fin_lancamentos_cancelado_data check ((situacao = 'cancelado') = (cancelado_em is not null))
);
create index fin_lancamentos_liquidacao_idx on public.fin_lancamentos (empresa_id, data_liquidacao) where situacao = 'realizado';
create index fin_lancamentos_vencimento_idx on public.fin_lancamentos (empresa_id, data_vencimento) where situacao = 'previsto';

create table public.fin_lancamento_rateios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  lancamento_id uuid not null,
  conta_id uuid not null,
  valor numeric(14, 2) not null,
  criado_em timestamptz not null default now(),
  constraint fin_rateios_lancamento foreign key (empresa_id, lancamento_id) references public.fin_lancamentos (empresa_id, id),
  constraint fin_rateios_conta foreign key (empresa_id, conta_id) references public.fin_contas (empresa_id, id),
  constraint fin_rateios_valor_positivo check (valor > 0)
);
create index fin_rateios_lancamento_idx on public.fin_lancamento_rateios (lancamento_id);
create index fin_rateios_conta_idx on public.fin_lancamento_rateios (empresa_id, conta_id);

-- ---------------------------------------------------------------------------
-- Transferências entre contas de caixa: ficam fora das entradas e saídas
-- ---------------------------------------------------------------------------

create table public.fin_transferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  conta_origem_id uuid not null,
  conta_destino_id uuid not null,
  valor numeric(14, 2) not null,
  data date not null,
  situacao text not null default 'realizado',
  descricao text,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis (id),
  constraint fin_transferencias_origem foreign key (empresa_id, conta_origem_id) references public.fin_contas_caixa (empresa_id, id),
  constraint fin_transferencias_destino foreign key (empresa_id, conta_destino_id) references public.fin_contas_caixa (empresa_id, id),
  constraint fin_transferencias_contas_diferentes check (conta_origem_id <> conta_destino_id),
  constraint fin_transferencias_valor_positivo check (valor > 0),
  constraint fin_transferencias_situacao_valida check (situacao in ('realizado', 'cancelado')),
  constraint fin_transferencias_cancelado_data check ((situacao = 'cancelado') = (cancelado_em is not null))
);
create index fin_transferencias_data_idx on public.fin_transferencias (empresa_id, data) where situacao = 'realizado';

-- ---------------------------------------------------------------------------
-- Gatilhos: regras que dependem de outras linhas
-- ---------------------------------------------------------------------------

-- Plano de contas: pai é grupo, analítica não tem filhos, sem ciclos, empresa fixa,
-- classificação imutável depois do primeiro lançamento (F5).
create function public.fin_contas_validar()
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
       and exists (select 1 from fin_lancamento_rateios where conta_id = new.id) then
      raise exception 'A classificação de uma conta já usada em lançamento não muda. Crie uma conta nova.'
        using errcode = 'check_violation', constraint = 'fin_contas_classificacao_imutavel';
    end if;
  end if;
  return new;
end;
$$;

create trigger fin_contas_validar before insert or update on public.fin_contas
  for each row execute function public.fin_contas_validar();

create trigger tocar_atualizado_em before update on public.fin_contas
  for each row execute function public.tocar_atualizado_em();

-- Registra cada criação e alteração de conta. Roda como dono para gravar o evento sem regra de inserção.
create function public.fin_contas_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.fin_contas_eventos (empresa_id, conta_id, acao, antes, depois, por)
  values (new.empresa_id, new.id, case when tg_op = 'INSERT' then 'criada' else 'alterada' end,
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'atualizado_em' end, to_jsonb(new) - 'atualizado_em', auth.uid());
  return null;
end;
$$;

create trigger fin_contas_auditar after insert or update on public.fin_contas
  for each row execute function public.fin_contas_auditar();

-- Contas de caixa: empresa fixa; a data do saldo inicial não pode passar de um movimento já registrado.
create function public.fin_contas_caixa_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.empresa_id <> old.empresa_id then
    raise exception 'A conta de caixa não pode mudar de empresa.' using errcode = 'check_violation', constraint = 'fin_contas_caixa_empresa_fixa';
  end if;
  if new.data_saldo_inicial > old.data_saldo_inicial and (
       exists (select 1 from fin_lancamentos where conta_caixa_id = new.id and situacao = 'realizado' and data_liquidacao < new.data_saldo_inicial)
       or exists (select 1 from fin_transferencias where new.id in (conta_origem_id, conta_destino_id) and situacao = 'realizado' and data < new.data_saldo_inicial)) then
    raise exception 'Há movimentos realizados antes dessa data. Eles já estariam contidos no saldo inicial.'
      using errcode = 'check_violation', constraint = 'fin_contas_caixa_data_antes_de_movimento';
  end if;
  return new;
end;
$$;

create trigger fin_contas_caixa_validar before update on public.fin_contas_caixa
  for each row execute function public.fin_contas_caixa_validar();
create trigger tocar_atualizado_em before update on public.fin_contas_caixa
  for each row execute function public.tocar_atualizado_em();

-- Lançamentos: conta de caixa ativa; liquidação nunca antes do saldo inicial (V8);
-- só liquidar, cancelar ou corrigir descrição, documento, vencimento (se previsto) e a marca de juros.
create function public.fin_lancamentos_validar()
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
    if (new.empresa_id, new.direcao, new.valor_total, new.conta_caixa_id, new.data_competencia, new.origem_tipo, new.origem_id)
       is distinct from (old.empresa_id, old.direcao, old.valor_total, old.conta_caixa_id, old.data_competencia, old.origem_tipo, old.origem_id) then
      raise exception 'Valor, direção, conta de caixa, competência e origem não mudam. Cancele e lance de novo.'
        using errcode = 'check_violation', constraint = 'fin_lancamentos_campos_fixos';
    end if;
    if old.situacao = 'realizado' and new.situacao = 'previsto' then
      raise exception 'Lançamento realizado não volta a previsto. Cancele e lance de novo.'
        using errcode = 'check_violation', constraint = 'fin_lancamentos_transicao';
    end if;
    if old.situacao = 'realizado' and new.situacao = 'realizado' and new.data_liquidacao <> old.data_liquidacao then
      raise exception 'A data de liquidação de um lançamento realizado não muda. Cancele e lance de novo.'
        using errcode = 'check_violation', constraint = 'fin_lancamentos_liquidacao_fixa';
    end if;
    if old.situacao = 'realizado' and new.data_vencimento is distinct from old.data_vencimento then
      raise exception 'O vencimento de um lançamento realizado não muda.' using errcode = 'check_violation', constraint = 'fin_lancamentos_liquidacao_fixa';
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

create trigger fin_lancamentos_validar before insert or update on public.fin_lancamentos
  for each row execute function public.fin_lancamentos_validar();
create trigger tocar_atualizado_em before update on public.fin_lancamentos
  for each row execute function public.tocar_atualizado_em();

-- Rateios: conta analítica, ativa e que movimenta caixa; lançamento não cancelado; sem alteração depois de gravado.
create function public.fin_rateios_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_conta record;
begin
  if tg_op = 'UPDATE' then
    raise exception 'O rateio não muda depois de gravado. Cancele o lançamento e lance de novo.'
      using errcode = 'check_violation', constraint = 'fin_rateios_fixos';
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

create trigger fin_rateios_validar before insert or update on public.fin_lancamento_rateios
  for each row execute function public.fin_rateios_validar();

-- Soma exata (V7): ao fim da transação, os rateios de cada lançamento somam o valor total.
create function public.fin_rateios_conferir_soma()
returns trigger language plpgsql set search_path = public as $$
declare
  v_lancamento uuid := coalesce((to_jsonb(new) ->> 'lancamento_id')::uuid, new.id); -- o gatilho serve às duas tabelas
  v_total numeric;
  v_soma numeric;
begin
  select valor_total into v_total from fin_lancamentos where id = v_lancamento;
  select coalesce(sum(valor), 0) into v_soma from fin_lancamento_rateios where lancamento_id = v_lancamento;
  if v_soma <> v_total then
    raise exception 'O rateio soma % e o lançamento é de %. A soma precisa ser exata.', v_soma, v_total
      using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;
  return null;
end;
$$;

create constraint trigger fin_lancamentos_soma_exata after insert or update on public.fin_lancamentos
  deferrable initially deferred for each row execute function public.fin_rateios_conferir_soma();
create constraint trigger fin_rateios_soma_exata after insert or update on public.fin_lancamento_rateios
  deferrable initially deferred for each row execute function public.fin_rateios_conferir_soma();

-- Transferências: contas ativas ao criar; data nunca antes do saldo inicial das duas contas;
-- depois de gravada, só cancelar ou corrigir a descrição.
create function public.fin_transferencias_validar()
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
  end if;
  return new;
end;
$$;

create trigger fin_transferencias_validar before insert or update on public.fin_transferencias
  for each row execute function public.fin_transferencias_validar();
create trigger tocar_atualizado_em before update on public.fin_transferencias
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Regras de acesso (seção 5): uma única função para todas as tabelas
-- ---------------------------------------------------------------------------

alter table public.fin_dre_secoes enable row level security;
alter table public.fin_contas enable row level security;
alter table public.fin_contas_eventos enable row level security;
alter table public.fin_contas_caixa enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_lancamento_rateios enable row level security;
alter table public.fin_transferencias enable row level security;

-- As seções da DRE não pertencem a uma empresa: leitura para quem usa o financeiro.
create policy ler on public.fin_dre_secoes for select to authenticated using (public.eh_equipe());

create policy ler on public.fin_contas for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_contas for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'administrar'));
create policy alterar on public.fin_contas for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'administrar')) with check (public.pode_usar_financeiro(empresa_id, 'administrar'));

create policy ler on public.fin_contas_eventos for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));

create policy ler on public.fin_contas_caixa for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_contas_caixa for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'administrar'));
create policy alterar on public.fin_contas_caixa for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'administrar')) with check (public.pode_usar_financeiro(empresa_id, 'administrar'));

create policy ler on public.fin_lancamentos for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_lancamentos for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy alterar on public.fin_lancamentos for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

create policy ler on public.fin_lancamento_rateios for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_lancamento_rateios for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

create policy ler on public.fin_transferencias for select to authenticated using (public.pode_usar_financeiro(empresa_id, 'ler'));
create policy criar on public.fin_transferencias for insert to authenticated with check (public.pode_usar_financeiro(empresa_id, 'lancar'));
create policy alterar on public.fin_transferencias for update to authenticated
  using (public.pode_usar_financeiro(empresa_id, 'lancar')) with check (public.pode_usar_financeiro(empresa_id, 'lancar'));

-- ---------------------------------------------------------------------------
-- Funções de gravação e consulta. Rodam com a permissão de quem chama (as regras acima valem).
-- ---------------------------------------------------------------------------

-- Grava o lançamento e o rateio juntos, numa transação; a soma exata é conferida no fim. p_rateios: [{"conta_id": "...", "valor": 123.45}, ...]
create function public.fin_lancar(
  p_empresa uuid, p_direcao text, p_valor_total numeric, p_conta_caixa uuid, p_situacao text, p_competencia date,
  p_vencimento date, p_liquidacao date, p_descricao text, p_documento text, p_juros_nao_segregados boolean,
  p_rateios jsonb)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_rateios) <> 'array' or jsonb_array_length(p_rateios) = 0 then
    raise exception 'Informe ao menos uma conta no rateio.' using errcode = 'check_violation', constraint = 'fin_rateios_soma_exata';
  end if;
  insert into fin_lancamentos (empresa_id, direcao, valor_total, conta_caixa_id, situacao, data_competencia,
                               data_vencimento, data_liquidacao, descricao, documento, juros_nao_segregados)
  values (p_empresa, p_direcao, p_valor_total, p_conta_caixa, p_situacao, p_competencia, p_vencimento, p_liquidacao, p_descricao, p_documento,
          coalesce(p_juros_nao_segregados, false))
  returning id into v_id;
  insert into fin_lancamento_rateios (empresa_id, lancamento_id, conta_id, valor)
  select p_empresa, v_id, (r ->> 'conta_id')::uuid, (r ->> 'valor')::numeric from jsonb_array_elements(p_rateios) r;
  return v_id;
end;
$$;

-- Saldo de cada conta de caixa ao fim do dia p_data. Vazio (null) se a conta só começa depois.
create function public.fin_saldos(p_empresa uuid, p_data date)
returns table (conta_caixa_id uuid, nome text, tipo text, ativa boolean, saldo_inicial numeric, data_saldo_inicial date,
               entradas numeric, saidas numeric, transferencias_recebidas numeric, transferencias_enviadas numeric, saldo numeric)
language sql stable set search_path = public as $$
  select c.id, c.nome, c.tipo, c.ativa, c.saldo_inicial, c.data_saldo_inicial, m.entradas, m.saidas, t.recebidas, t.enviadas,
         case when c.data_saldo_inicial <= p_data then c.saldo_inicial + m.entradas - m.saidas + t.recebidas - t.enviadas end
  from fin_contas_caixa c
  cross join lateral (
    select coalesce(sum(l.valor_total) filter (where l.direcao = 'entrada'), 0) entradas,
           coalesce(sum(l.valor_total) filter (where l.direcao = 'saida'), 0) saidas
    from fin_lancamentos l
    where l.conta_caixa_id = c.id and l.situacao = 'realizado' and l.data_liquidacao <= p_data) m
  cross join lateral (
    select coalesce(sum(x.valor) filter (where x.conta_destino_id = c.id), 0) recebidas,
           coalesce(sum(x.valor) filter (where x.conta_origem_id = c.id), 0) enviadas
    from fin_transferencias x
    where c.id in (x.conta_origem_id, x.conta_destino_id) and x.situacao = 'realizado' and x.data <= p_data) t
  where c.empresa_id = p_empresa
  order by c.ordem, c.nome;
$$;

-- Fluxo de caixa por conta analítica e por mês (seção 3.2). Base 'realizado': lançamentos realizados,
-- pela data de liquidação. Base 'previsto': lançamentos previstos, pelo vencimento.
-- Transferências não entram: ficam à parte.
create function public.fin_fluxo_caixa(p_empresa uuid, p_inicio date, p_fim date, p_base text)
returns table (conta_id uuid, mes date, entradas numeric, saidas numeric)
language sql stable set search_path = public as $$
  select r.conta_id, date_trunc('month', d.data)::date,
         coalesce(sum(r.valor) filter (where l.direcao = 'entrada'), 0),
         coalesce(sum(r.valor) filter (where l.direcao = 'saida'), 0)
  from fin_lancamentos l
  join fin_lancamento_rateios r on r.lancamento_id = l.id
  cross join lateral (select case when p_base = 'previsto' then l.data_vencimento else l.data_liquidacao end as data) d
  where l.empresa_id = p_empresa
    and l.situacao = case when p_base = 'previsto' then 'previsto' else 'realizado' end
    and d.data between p_inicio and p_fim
  group by r.conta_id, date_trunc('month', d.data);
$$;

-- Ninguém sem login executa as funções financeiras.
revoke execute on function public.pode_usar_financeiro(uuid, text), public.fin_lancar(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb),
  public.fin_saldos(uuid, date), public.fin_fluxo_caixa(uuid, date, date, text) from public, anon;
grant execute on function public.pode_usar_financeiro(uuid, text), public.fin_lancar(uuid, text, numeric, uuid, text, date, date, date, text, text, boolean, jsonb),
  public.fin_saldos(uuid, date), public.fin_fluxo_caixa(uuid, date, date, text) to authenticated;
