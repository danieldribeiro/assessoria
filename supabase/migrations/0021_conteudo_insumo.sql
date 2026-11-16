-- Conteúdo de uma unidade do insumo, para a ficha técnica aceitar g e ml em insumo contado por unidade, pacote ou caixa.
-- Ex.: Leite integral contado em "un" com 1 un = 1 L; Matcha puro contado em "un" com 1 un = 100 g.
-- Insumo contado em kg, g, L ou ml já converte sozinho e não precisa disso. Os dois campos são opcionais e andam juntos.
-- Não muda nenhum dado existente.

alter table public.fin_estoque_itens
  add column conteudo numeric(14, 4),
  add column conteudo_medida text,
  add constraint fin_estoque_itens_conteudo_junto check ((conteudo is null) = (conteudo_medida is null)),
  add constraint fin_estoque_itens_conteudo_valido check (conteudo is null or conteudo > 0),
  add constraint fin_estoque_itens_conteudo_medida_valida check (conteudo_medida is null or conteudo_medida in ('g', 'kg', 'ml', 'L'));
