-- Conferência só de leitura, rodada antes e depois (e depois da reversão).
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
