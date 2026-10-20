-- =====================================================================
-- 0002 · Sin colación, turnos por semana y foto opcional
-- Ejecutar en Supabase (SQL Editor) DESPUÉS de 0001.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Horario base: se elimina la colación
--    (las marcas antiguas de colación se conservan, pero ya no se usan)
-- ---------------------------------------------------------------------
alter table public.horarios drop column if exists minutos_colacion;

comment on table public.horarios is
  'Horario BASE por persona y día de la semana. Se usa cuando no hay un turno específico para esa fecha.';

-- ---------------------------------------------------------------------
-- 2. Turnos por fecha (planificación semanal)
--    Si existe un turno para (persona, fecha), manda sobre el horario base.
--    libre = true → ese día no trabaja (no se calculan atrasos).
-- ---------------------------------------------------------------------
create table if not exists public.turnos (
  id                  bigint generated always as identity primary key,
  usuario_id          uuid not null references public.usuarios (id) on delete cascade,
  fecha               date not null,
  libre               boolean not null default false,
  hora_entrada        time,
  hora_salida         time,
  tolerancia_minutos  smallint not null default 5 check (tolerancia_minutos between 0 and 60),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (usuario_id, fecha),
  check (
    libre
    or (hora_entrada is not null and hora_salida is not null and hora_salida > hora_entrada)
  )
);

comment on table public.turnos is
  'Turno de una persona en una fecha concreta. Reemplaza al horario base ese día.';

create index if not exists turnos_fecha_idx on public.turnos (fecha);

alter table public.turnos enable row level security;

create policy "turnos_select_propio_o_admin" on public.turnos
  for select to authenticated
  using (usuario_id = (select auth.uid()) or public.es_admin());

create policy "turnos_admin_gestiona" on public.turnos
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------------
-- 3. Foto opcional en cada marca
-- ---------------------------------------------------------------------
alter table public.asistencia add column if not exists foto_path text;

-- Bucket PRIVADO: sin políticas de acceso, solo el servidor (clave secreta)
-- puede subir y generar enlaces temporales para verlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-asistencia', 'fotos-asistencia', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Vista de jornadas: solo entrada/salida + horario efectivo
--    (turno de la fecha si existe; si no, horario base del día)
-- ---------------------------------------------------------------------
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
  'Una fila por persona y día: entrada, salida, horas trabajadas y atraso según el turno o el horario base.';
