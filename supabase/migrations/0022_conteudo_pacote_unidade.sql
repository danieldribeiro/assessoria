-- Conteúdo de 1 unidade também em pacotes ou unidades, para a ficha técnica usar uma parte do que é contado.
-- Ex.: Fini contado em "cx" com 1 cx = 12 pct, e cada bebida leva 1 pct; copo contado em "pct" com 1 pct = 50 un.
-- Só amplia a lista de medidas aceitas (antes g, kg, ml, L). Não muda nenhum dado existente.

alter table public.fin_estoque_itens
  drop constraint fin_estoque_itens_conteudo_medida_valida,
  add constraint fin_estoque_itens_conteudo_medida_valida check (conteudo_medida is null or conteudo_medida in ('g', 'kg', 'ml', 'L', 'un', 'pct'));
