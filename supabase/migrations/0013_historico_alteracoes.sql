-- Histórico de alterações fora do financeiro, no mesmo modelo do financeiro (fin_lancamentos_eventos):
-- cada criação, alteração e exclusão nos diagnósticos, cadastros e acessos fica registrada com quem, quando,
-- o antes e o depois. Numa exclusão, a linha inteira fica guardada no histórico, e é dali que se recupera
-- o que foi apagado por engano.
-- Só a equipe lê. Ninguém grava, altera ou apaga o histórico pela API: só o próprio banco, pelo gatilho.
-- Não muda nenhuma tabela nem regra existente; só acrescenta o histórico e os gatilhos.
-- De quebra, tira das funções de gatilho do financeiro a permissão de chamada direta pela API (aviso do Supabase).

create table public.historico (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text not null,
  empresa_id uuid,      -- sem chave estrangeira: o histórico fica mesmo depois de a empresa ser excluída
  diagnostico_id uuid,
  acao text not null check (acao in ('criado', 'alterado', 'excluido', 'entrou')),
  antes jsonb,          -- na alteração, só os campos que mudaram; na exclusão, a linha inteira
  depois jsonb,         -- na alteração, só os campos que mudaram; na criação, a linha inteira
  por uuid,             -- quem fez; vazio quando a mudança veio de fora do sistema (ex.: SQL Editor)
  em timestamptz not null default now()
);
create index historico_empresa_idx on public.historico (empresa_id, em desc);
create index historico_diagnostico_idx on public.historico (diagnostico_id, em desc);
create index historico_registro_idx on public.historico (tabela, registro_id, em desc);

alter table public.historico enable row level security;
create policy ler on public.historico for select to authenticated using (public.eh_equipe());
revoke insert, update, delete, truncate on public.historico from public, anon, authenticated;

create function public.registrar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'atualizado_em' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'atualizado_em' end;
  v_linha jsonb := coalesce(v_new, v_old);
  v_antes jsonb := v_old;
  v_depois jsonb := v_new;
  v_acao text := case tg_op when 'INSERT' then 'criado' when 'UPDATE' then 'alterado' else 'excluido' end;
  v_empresa uuid;
  v_diag uuid;
begin
  if tg_op = 'UPDATE' then
    if v_old = v_new then return null; end if; -- só o atualizado_em mudou
    select jsonb_object_agg(o.key, o.value) into v_antes from jsonb_each(v_old) o where o.value is distinct from v_new -> o.key;
    select jsonb_object_agg(n.key, n.value) into v_depois from jsonb_each(v_new) n where n.value is distinct from v_old -> n.key;
    -- Entrada do cliente na central: guarda uma por hora, não uma por página aberta.
    if tg_table_name = 'acessos_central' and v_depois ? 'ultimo_acesso' and (select count(*) from jsonb_object_keys(v_depois)) = 1 then
      if old.ultimo_acesso is not null and new.ultimo_acesso < old.ultimo_acesso + interval '1 hour' then return null; end if;
      v_acao := 'entrou';
    end if;
  end if;

  v_diag := case when tg_table_name = 'diagnosticos' then (v_linha ->> 'id')::uuid else (v_linha ->> 'diagnostico_id')::uuid end;
  v_empresa := case when tg_table_name = 'empresas' then (v_linha ->> 'id')::uuid else (v_linha ->> 'empresa_id')::uuid end;
  if v_empresa is null and v_diag is not null then
    select empresa_id into v_empresa from diagnosticos where id = v_diag;
    -- Itens apagados junto com o diagnóstico: ele já saiu da tabela, mas a exclusão dele acabou de entrar aqui.
    if v_empresa is null then
      select h.empresa_id into v_empresa from historico h
      where h.tabela = 'diagnosticos' and h.registro_id = v_diag::text order by h.id desc limit 1;
    end if;
  end if;

  insert into historico (tabela, registro_id, empresa_id, diagnostico_id, acao, antes, depois, por)
  values (tg_table_name, v_linha ->> 'id', v_empresa, v_diag, v_acao, v_antes, v_depois, auth.uid());
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['empresas', 'contatos', 'diagnosticos', 'solicitacoes', 'indicadores', 'achados',
                           'oportunidades', 'acoes', 'acessos_central', 'perfis', 'assessoria'] loop
    execute format('create trigger registrar_historico after insert or update or delete on public.%I
                    for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- Funções de gatilho não são chamadas pela API; o gatilho continua disparando sem essa permissão.
revoke execute on function public.registrar_historico(), public.fin_contas_auditar(), public.fin_lancamentos_auditar()
  from public, anon, authenticated;
