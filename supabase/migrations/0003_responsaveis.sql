-- Responsáveis por área e por item.
-- Cada diagnóstico define quem cuida de cada área (Financeiro, Operacional...).
-- Cada item segue o responsável da sua área, a menos que receba um responsável próprio.

alter table public.diagnosticos
  add column if not exists responsaveis_area jsonb not null default '{}'::jsonb;

alter table public.solicitacoes add column if not exists responsavel_id uuid references public.perfis (id) on delete set null;
alter table public.indicadores add column if not exists responsavel_id uuid references public.perfis (id) on delete set null;
alter table public.achados add column if not exists responsavel_id uuid references public.perfis (id) on delete set null;
alter table public.oportunidades add column if not exists responsavel_id uuid references public.perfis (id) on delete set null;

create index if not exists solicitacoes_responsavel_idx on public.solicitacoes (responsavel_id);
create index if not exists indicadores_responsavel_idx on public.indicadores (responsavel_id);
create index if not exists achados_responsavel_idx on public.achados (responsavel_id);
create index if not exists oportunidades_responsavel_idx on public.oportunidades (responsavel_id);
