-- Ajustes apontados pelo Security Advisor do Supabase.

-- Funções com search_path fixo.
alter function public.tocar_atualizado_em() set search_path = public;
alter function public.calcular_prioridade(int, int, int) set search_path = public;

-- criar_perfil só deve rodar pelo gatilho de auth.users, nunca pela API.
revoke execute on function public.criar_perfil() from public, anon, authenticated;
