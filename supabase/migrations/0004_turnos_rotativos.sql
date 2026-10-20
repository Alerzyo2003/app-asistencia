-- =====================================================================
-- 0004 · Horarios rotativos (turnos que se alternan por semana)
-- Ejecutar en Supabase (SQL Editor) DESPUÉS de 0003.
--
-- Cada persona tiene un ciclo de 1 a 4 semanas:
--   ciclo_semanas = 1 → mismo horario todas las semanas (como antes)
--   ciclo_semanas = 2 → Semana A / Semana B intercaladas (mañana/tarde)
--   ciclo_inicio      → lunes en que comienza su Semana A
-- El horario base se guarda por (semana del ciclo, día de la semana).
-- La tabla `turnos` sigue sirviendo para cambios puntuales de una fecha.
-- =====================================================================

-- 1. Ciclo por persona ----------------------------------------------------
alter table public.usuarios
  add column if not exists ciclo_semanas smallint not null default 1,
  add column if not exists ciclo_inicio  date;

alter table public.usuarios drop constraint if exists usuarios_ciclo_semanas_rango;
alter table public.usuarios add constraint usuarios_ciclo_semanas_rango
  check (ciclo_semanas between 1 and 4);

comment on column public.usuarios.ciclo_semanas is 'Cada cuántas semanas se repite su horario (1 = siempre igual, 2 = turnos A/B alternados).';
comment on column public.usuarios.ciclo_inicio  is 'Lunes en que comienza su Semana A.';

-- 2. Horario base por semana del ciclo ------------------------------------
alter table public.horarios
  add column if not exists semana_ciclo smallint not null default 1;

alter table public.horarios drop constraint if exists horarios_semana_ciclo_rango;
alter table public.horarios add constraint horarios_semana_ciclo_rango
  check (semana_ciclo between 1 and 4);

-- La unicidad pasa de (persona, día) a (persona, semana del ciclo, día)
alter table public.horarios drop constraint if exists horarios_usuario_id_dia_semana_key;
alter table public.horarios drop constraint if exists horarios_usuario_semana_dia_key;
alter table public.horarios add constraint horarios_usuario_semana_dia_key
  unique (usuario_id, semana_ciclo, dia_semana);

-- 3. ¿Qué semana del ciclo es una fecha? -----------------------------------
--    Devuelve 1 (A), 2 (B)… según el lunes de inicio y el largo del ciclo.
create or replace function public.semana_del_ciclo(p_fecha date, p_inicio date, p_semanas int)
returns int
language sql
immutable
as $$
  select case
    when coalesce(p_semanas, 1) <= 1 or p_inicio is null then 1
    else (
      (
        ((date_trunc('week', p_fecha)::date - date_trunc('week', p_inicio)::date) / 7) % p_semanas
        + p_semanas
      ) % p_semanas
    ) + 1
  end;
$$;

-- 4. Vista de jornadas: el horario base ahora considera la semana del ciclo
drop view if exists public.v_jornadas;

create view public.v_jornadas
with (security_invoker = true) as
with marcas as (
  select
    usuario_id,
    fecha,
    min(marcado_en) filter (where tipo = 'entrada') as entrada,
    max(marcado_en) filter (where tipo = 'salida')  as salida,
    count(*) filter (where not valida)              as marcas_observadas,
    count(*) filter (where foto_path is not null)   as fotos
  from public.asistencia
  where tipo in ('entrada', 'salida')
  group by usuario_id, fecha
),
plan as (
  select
    m.*,
    u.nombre,
    u.rut,
    case
      when t.id is not null and t.libre then 'libre'
      when t.id is not null             then 'turno'
      when h.id is not null             then 'base'
    end as origen_horario,
    case when t.id is not null then t.hora_entrada       else h.hora_entrada       end as h_entrada,
    case when t.id is not null then t.hora_salida        else h.hora_salida        end as h_salida,
    case when t.id is not null then t.tolerancia_minutos else h.tolerancia_minutos end as tolerancia
  from marcas m
  join public.usuarios u on u.id = m.usuario_id
  left join public.turnos t
    on t.usuario_id = m.usuario_id
   and t.fecha = m.fecha
  left join public.horarios h
    on h.usuario_id = m.usuario_id
   and h.dia_semana = extract(isodow from m.fecha)::int
   and h.semana_ciclo = public.semana_del_ciclo(m.fecha, u.ciclo_inicio, u.ciclo_semanas)
),
calculo as (
  select
    p.*,
    case
      when p.h_entrada is not null and p.entrada is not null then
        round(extract(epoch from (
          (p.entrada at time zone 'America/Santiago')::time - p.h_entrada
        )) / 60)::int
    end as minutos_tarde
  from plan p
)
select
  usuario_id,
  nombre,
  rut,
  fecha,
  entrada,
  salida,
  origen_horario,
  h_entrada as hora_entrada_pactada,
  h_salida  as hora_salida_pactada,
  case
    when entrada is not null and salida is not null then
      round(extract(epoch from (salida - entrada)) / 60)::int
  end as minutos_trabajados,
  case
    when minutos_tarde > coalesce(tolerancia, 0) then minutos_tarde
    else 0
  end as minutos_atraso,
  marcas_observadas,
  fotos
from calculo;

comment on view public.v_jornadas is
  'Una fila por persona y día: entrada, salida, horas trabajadas y atraso según el turno, o el horario base de la semana del ciclo.';
