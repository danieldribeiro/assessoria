-- Dados fictícios no formato dos registros antigos (sem situação nem versão).
insert into public.empresas (id, nome) values
  ('00000000-0000-0000-0000-0000000000e1', 'Clínica Teste A'), ('00000000-0000-0000-0000-0000000000e2', 'Clínica Teste B');
insert into public.diagnosticos (id, empresa_id, periodo_inicio, periodo_fim, data_inicio, status, publicado_em) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '2026-01-01', '2026-06-30', '2026-07-01', 'Concluído', now()),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e1', '2026-07-01', '2026-09-30', '2026-10-01', 'Revisão', null),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000e2', '2026-01-01', '2026-09-30', '2026-10-01', 'Coleta', null);
insert into public.indicadores (diagnostico_id, categoria, nome, valor, unidade, ref_min, ref_max, observacao, ordem)
select d, 'Financeiro', 'Indicador ' || g, case when g % 5 = 0 then null when g % 7 = 0 then 0 else g * 1.5 end,
       case when g % 2 = 0 then '%' else 'R$' end, case when g % 3 = 0 then 10 end, case when g % 4 = 0 then 40 end,
       case when g % 2 = 0 then 'Análise ' || g end, g
from unnest(array['00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3']::uuid[]) d,
     generate_series(1, 22) g;
