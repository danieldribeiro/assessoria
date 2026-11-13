-- Aviso de segurança do Supabase: pode_receber_link podia ser chamada por qualquer pessoa, sem login,
-- direto pela API (/rest/v1/rpc/pode_receber_link). Ela não devolve dados, mas responde "sim" ou "não"
-- para um e-mail, o que deixaria alguém de fora descobrir quais e-mails são de clientes ou da equipe.
-- A partir daqui só o servidor do AXIS chama a função, com a chave de serviço (SUPABASE_SERVICE_ROLE_KEY,
-- que já existe na Vercel para os convites da central). A tela de login continua igual.
-- Não muda nenhuma tabela, regra ou dado; só a permissão de chamar esta função.
-- Antes de aplicar em produção: o código que usa a chave de serviço (src/server/central.ts, pedirLink)
-- precisa já estar no ar, senão o pedido de link da central para de enviar.

revoke execute on function public.pode_receber_link(text) from public, anon, authenticated;
grant execute on function public.pode_receber_link(text) to service_role;
