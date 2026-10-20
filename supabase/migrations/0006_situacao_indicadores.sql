-- 0006: situação metodológica dos indicadores e versão da metodologia do diagnóstico.
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
