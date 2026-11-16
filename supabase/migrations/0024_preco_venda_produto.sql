-- Preço de venda de tabela de cada produto (o preço do cardápio), digitado na ficha técnica.
-- Serve para a margem de tabela e para comparar com o preço médio que o PDV de fato cobrou (descontos, cortesias, botão errado).
-- O CMV do mês continua sobre o total vendido no PDV; o preço de tabela entra como comparação.
-- Opcional (vazio = sem preço de tabela). Não muda nenhum dado existente.

alter table public.fin_estoque_produtos
  add column preco_venda numeric(14, 2),
  add constraint fin_estoque_produtos_preco_valido check (preco_venda is null or preco_venda >= 0);
