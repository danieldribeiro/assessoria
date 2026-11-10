-- Envio semanal: o extrato e a maquininha passam a vir toda segunda-feira, com a semana anterior (decisão de 10/11/2026).
-- Acrescenta a frequência "semanal". Num item semanal, a referência do arquivo (competencia) é a segunda-feira
-- que abre a semana; nos mensais continua o dia 1 do mês. A dispensa vale para a mesma referência.
-- Não muda dado existente: só afrouxa as checagens para aceitar também a segunda-feira e confere o par
-- frequência e referência no gatilho, que já existe.

alter table public.envios_itens drop constraint envios_itens_frequencia_check;
alter table public.envios_itens add constraint envios_itens_frequencia_check check (frequencia in ('unica', 'semanal', 'mensal'));

alter table public.envios_arquivos drop constraint envios_arquivos_competencia_check;
alter table public.envios_arquivos add constraint envios_arquivos_competencia_check
  check (competencia = date_trunc('month', competencia)::date or extract(isodow from competencia) = 1);

alter table public.envios_dispensas drop constraint envios_dispensas_competencia_check;
alter table public.envios_dispensas add constraint envios_dispensas_competencia_check
  check (competencia = date_trunc('month', competencia)::date or extract(isodow from competencia) = 1);

-- Referência certa para cada frequência: segunda-feira no semanal, dia 1 no mensal.
create or replace function public.envios_referencia_ok(p_freq text, p_competencia date)
returns boolean language sql immutable set search_path = public as $$
  select case p_freq
    when 'semanal' then p_competencia is not null and extract(isodow from p_competencia) = 1
    when 'mensal' then p_competencia is not null and p_competencia = date_trunc('month', p_competencia)::date
    else true end;
$$;

create or replace function public.envios_arquivos_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_freq text; v_ativo boolean;
begin
  if new.item_id is not null then
    select frequencia, ativo into v_freq, v_ativo from envios_itens where id = new.item_id and empresa_id = new.empresa_id;
    if tg_op = 'INSERT' and not v_ativo then
      raise exception 'Este item não está mais na lista.' using errcode = 'check_violation', constraint = 'envios_item_ativo';
    end if;
    if not envios_referencia_ok(v_freq, new.competencia) then
      raise exception 'Informe o mês ou a semana a que o arquivo se refere.' using errcode = 'check_violation', constraint = 'envios_competencia';
    end if;
  end if;
  return new;
end;
$$;

create function public.envios_dispensas_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_freq text;
begin
  select frequencia into v_freq from envios_itens where id = new.item_id and empresa_id = new.empresa_id;
  if v_freq = 'unica' or not envios_referencia_ok(v_freq, new.competencia) then
    raise exception 'Dispensa fora do mês ou da semana do item.' using errcode = 'check_violation', constraint = 'envios_competencia';
  end if;
  return new;
end;
$$;
create trigger envios_dispensas_validar before insert or update on public.envios_dispensas
  for each row execute function public.envios_dispensas_validar();

-- Um item não muda de frequência depois de ter arquivos ou dispensas: as referências antigas deixariam de fazer sentido.
create function public.envios_itens_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.frequencia <> old.frequencia
     and (exists (select 1 from envios_arquivos where item_id = old.id) or exists (select 1 from envios_dispensas where item_id = old.id)) then
    raise exception 'Este item já tem arquivos; crie um item novo com a outra frequência.'
      using errcode = 'check_violation', constraint = 'envios_frequencia_fixa';
  end if;
  return new;
end;
$$;
create trigger envios_itens_validar before update on public.envios_itens
  for each row execute function public.envios_itens_validar();

revoke execute on function public.envios_arquivos_validar(), public.envios_dispensas_validar(), public.envios_itens_validar()
  from public, anon, authenticated;
