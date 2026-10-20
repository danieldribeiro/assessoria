-- Reversão da 0006. Apaga apenas o que a 0006 criou (e o que tiver sido preenchido nesses campos).
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
