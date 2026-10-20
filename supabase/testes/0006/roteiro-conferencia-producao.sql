-- Roteiro de conferência da 0006 em produção. Tudo aqui é só leitura.
-- Ordem: (1) e (2) antes de aplicar; aplicar a 0006 numa transação; (3), (1) de novo e (4) depois.
-- A 0006 só é considerada aplicada se (1) der o mesmo resultado antes e depois e (3) e (4) baterem.

-- (1) Contagem e hash dos dados. Guardar o resultado de antes; o de depois deve ser idêntico.
select 'indicadores' as tabela, count(*) as linhas,
       md5(string_agg(concat_ws('|', id, diagnostico_id, categoria, nome, valor, unidade, periodo, referencia,
                                observacao, ordem, ref_min, ref_max, tolerancia, significado, cor_manual,
                                atualizado_em), E'\n' order by id)) as hash
from public.indicadores
union all
select 'diagnosticos', count(*),
       md5(string_agg(concat_ws('|', id, empresa_id, periodo_inicio, periodo_fim, status, publicado_em, atualizado_em),
                      E'\n' order by id))
from public.diagnosticos;

-- (2) Antes: as colunas novas ainda não existem (esperado: 0 linhas).
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (('indicadores','situacao'), ('indicadores','motivo_nao_calculavel'),
                                    ('indicadores','ressalva'), ('diagnosticos','versao_metodologia'));

-- (3) Depois: as 4 colunas existem, aceitam vazio e estão vazias em todas as linhas.
select c.table_name, c.column_name, c.data_type, c.is_nullable,
       case c.table_name
         when 'indicadores' then (select count(*) from public.indicadores i
                                  where to_jsonb(i) ->> c.column_name is not null)
         else (select count(*) from public.diagnosticos d where to_jsonb(d) ->> c.column_name is not null)
       end as linhas_preenchidas  -- esperado: 0 em todas
from information_schema.columns c
where c.table_schema = 'public'
  and (c.table_name, c.column_name) in (('indicadores','situacao'), ('indicadores','motivo_nao_calculavel'),
                                        ('indicadores','ressalva'), ('diagnosticos','versao_metodologia'))
order by 1, 2;

-- (4) Depois: as 10 restrições da 0006 existem e estão validadas (esperado: 10 linhas, validada = true).
select conrelid::regclass as tabela, conname, convalidated as validada, pg_get_constraintdef(oid) as regra
from pg_constraint
where conname in ('indicadores_situacao_valida', 'indicadores_motivo_nao_branco', 'indicadores_ressalva_nao_branca',
                  'indicadores_nc_sem_valor_com_motivo', 'indicadores_motivo_so_nc', 'indicadores_situacao_com_valor',
                  'indicadores_ressalva_obrigatoria', 'indicadores_calculado_sem_ressalva',
                  'indicadores_ressalva_exige_situacao', 'diagnosticos_versao_metodologia_valida')
order by 1, 2;
