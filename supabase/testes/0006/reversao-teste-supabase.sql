-- Teste de reversão e reaplicação no projeto de testes. Tudo roda numa subtransação desfeita no fim.
create temp table _rev (etapa text, esquema text, dados text);
create or replace function pg_temp.esquema() returns text language sql as $$
  select md5(string_agg(x, E'\n' order by x)) from (
    select table_name||'.'||column_name||' '||data_type||' '||is_nullable x from information_schema.columns
     where table_schema='public' and table_name in ('indicadores','diagnosticos')
    union all select conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint
     where conrelid in ('public.indicadores'::regclass,'public.diagnosticos'::regclass)) s;
$$;
create or replace function pg_temp.dados() returns text language sql as $$
  select (select count(*)||'|'||md5(string_agg(concat_ws('|', id, diagnostico_id, categoria, nome, valor, unidade, periodo, referencia,
            observacao, ordem, ref_min, ref_max, tolerancia, significado, cor_manual, atualizado_em), E'\n' order by id)) from public.indicadores)
   ||' '||(select count(*)||'|'||md5(string_agg(concat_ws('|', id, empresa_id, periodo_inicio, periodo_fim, status, publicado_em, atualizado_em), E'\n' order by id)) from public.diagnosticos);
$$;
insert into _rev select 'com a 0006', pg_temp.esquema(), pg_temp.dados();
do $bloco$
declare r1 text; d1 text; r2 text; d2 text;
begin
  begin
    execute $rev$-- Reversão da 0006. Apaga apenas o que a 0006 criou (e o que tiver sido preenchido nesses campos).
alter table public.diagnosticos
  drop constraint if exists diagnosticos_versao_metodologia_valida,
  drop column if exists versao_metodologia;

alter table public.indicadores
  drop constraint if exists indicadores_ressalva_exige_situacao,
  drop constraint if exists indicadores_calculado_sem_ressalva,
  drop constraint if exists indicadores_ressalva_obrigatoria,
  drop constraint if exists indicadores_situacao_com_valor,
  drop constraint if exists indicadores_motivo_so_nc,
  drop constraint if exists indicadores_nc_sem_valor_com_motivo,
  drop constraint if exists indicadores_ressalva_nao_branca,
  drop constraint if exists indicadores_motivo_nao_branco,
  drop constraint if exists indicadores_situacao_valida,
  drop column if exists ressalva,
  drop column if exists motivo_nao_calculavel,
  drop column if exists situacao;
$rev$;
    r1 := pg_temp.esquema(); d1 := pg_temp.dados();
    execute $mig$-- 0006: situação metodológica dos indicadores e versão da metodologia do diagnóstico.
-- Só acrescenta colunas opcionais e restrições. Nenhuma linha existente é atualizada:
-- registros antigos ficam com situação e versão vazias ("não informada").

alter table public.indicadores
  add column situacao text,
  add column motivo_nao_calculavel text,
  add column ressalva text;

alter table public.indicadores
  -- Os cinco estados da planilha v4 (coluna F da aba Indicadores).
  add constraint indicadores_situacao_valida
    check (situacao in ('calculado', 'calculado_com_ressalvas', 'estimado', 'nao_calculavel', 'confirmar')),
  -- Texto em branco não conta como preenchido: o sistema grava vazio (null).
  add constraint indicadores_motivo_nao_branco check (btrim(motivo_nao_calculavel) <> ''),
  add constraint indicadores_ressalva_nao_branca check (btrim(ressalva) <> ''),
  -- R1: não calculável nunca tem valor (nem zero) e sempre tem motivo.
  add constraint indicadores_nc_sem_valor_com_motivo
    check (situacao is distinct from 'nao_calculavel' or (valor is null and motivo_nao_calculavel is not null)),
  -- R2: motivo só existe em indicador não calculável (também recusa motivo com situação vazia).
  add constraint indicadores_motivo_so_nc
    check (motivo_nao_calculavel is null or situacao is not distinct from 'nao_calculavel'),
  -- R3: as demais situações exigem valor (zero é valor).
  add constraint indicadores_situacao_com_valor
    check (situacao is null or situacao = 'nao_calculavel' or valor is not null),
  -- R4: "calculado com ressalvas" exige a ressalva.
  add constraint indicadores_ressalva_obrigatoria
    check (situacao is distinct from 'calculado_com_ressalvas' or ressalva is not null),
  -- R5 (M3): "calculado" não tem ressalva.
  add constraint indicadores_calculado_sem_ressalva
    check (situacao is distinct from 'calculado' or ressalva is null),
  -- R7 (decisão D, 20/10): ressalva só existe em indicador com situação informada.
  add constraint indicadores_ressalva_exige_situacao
    check (ressalva is null or situacao is not null);

alter table public.diagnosticos
  add column versao_metodologia text,
  add constraint diagnosticos_versao_metodologia_valida check (versao_metodologia in ('v4'));
$mig$;
    r2 := pg_temp.esquema(); d2 := pg_temp.dados();
    raise exception using errcode = 'P0001', message = '__desfazer__';
  exception when raise_exception then if sqlerrm <> '__desfazer__' then raise; end if;
  end;
  insert into _rev values ('depois da reversão', r1, d1), ('depois de reaplicar', r2, d2);
end;
$bloco$;
insert into _rev select 'no fim (tudo desfeito)', pg_temp.esquema(), pg_temp.dados();
select jsonb_agg(to_jsonb(_rev)) from _rev;
