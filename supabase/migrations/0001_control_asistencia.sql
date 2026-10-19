-- =====================================================================
-- Control de asistencia · Clínica Odontológica Dignidad
-- Esquema inicial: usuarios, horarios, asistencia + RLS + vista de jornadas
-- Ejecutar en Supabase (SQL Editor) o como migración con la CLI.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos enumerados
-- ---------------------------------------------------------------------
create type public.rol_usuario as enum ('admin', 'empleado');

create type public.tipo_evento as enum (
  'entrada',
  'inicio_colacion',
  'fin_colacion',
  'salida'
);

-- ---------------------------------------------------------------------
-- 2. Tabla usuarios (perfil 1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null,
  rut         text unique,                       -- ej. 12.345.678-9
  email       text not null,
  cargo       text,                              -- dentista, asistente, recepción...
  rol         public.rol_usuario not null default 'empleado',
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.usuarios is 'Perfil de cada persona del equipo. El rol define el acceso.';

-- Crea automáticamente el perfil cuando se crea un usuario en Auth.
-- El nombre se toma de user_metadata.nombre (si no viene, se usa el email).
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nombre, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- ---------------------------------------------------------------------
-- 3. Tabla horarios (turno esperado por día de la semana)
--    dia_semana: ISO 8601 → 1 = lunes … 7 = domingo
-- ---------------------------------------------------------------------
create table public.horarios (
  id                  bigint generated always as identity primary key,
  usuario_id          uuid not null references public.usuarios (id) on delete cascade,
  dia_semana          smallint not null check (dia_semana between 1 and 7),
  hora_entrada        time not null,
  hora_salida         time not null,
  minutos_colacion    smallint not null default 60 check (minutos_colacion >= 0),
  tolerancia_minutos  smallint not null default 5 check (tolerancia_minutos >= 0),
  created_at          timestamptz not null default now(),
  unique (usuario_id, dia_semana),
  check (hora_salida > hora_entrada)
);

comment on table public.horarios is 'Horario pactado por persona y día. Se usa para calcular atrasos.';

-- ---------------------------------------------------------------------
-- 4. Tabla asistencia (marcaciones)
--    La fecha y hora las pone SIEMPRE la base de datos (now()),
--    nunca el dispositivo del trabajador.
-- ---------------------------------------------------------------------
create table public.asistencia (
  id                  bigint generated always as identity primary key,
  usuario_id          uuid not null references public.usuarios (id) on delete restrict,
  tipo                public.tipo_evento not null,

  -- Fecha/hora oficiales del servidor (hora de Chile continental para "fecha")
  marcado_en          timestamptz not null default now(),
  fecha               date not null default (timezone('America/Santiago', now()))::date,

  -- Datos de geolocalización informados por el navegador (pueden venir nulos
  -- si el trabajador no dio permiso de ubicación)
  latitud             double precision check (latitud between -90 and 90),
  longitud            double precision check (longitud between -180 and 180),
  precision_m         double precision check (precision_m >= 0),
  distancia_m         double precision check (distancia_m >= 0),

  -- Datos de red
  ip                  inet,
  user_agent          text,

  -- Resultado de la validación.
  -- valida = true  → dentro de la geocerca y desde la red autorizada.
  -- valida = false → la marcación QUEDA REGISTRADA igual, pero "observada"
  --                  para revisión (Res. Ex. N°38 DT: no se puede bloquear).
  valida              boolean not null,
  motivo_observacion  text,

  created_at          timestamptz not null default now(),

  -- Una marcación de cada tipo por persona y día (evita doble clic / duplicados)
  unique (usuario_id, fecha, tipo)
);

comment on table public.asistencia is 'Registro inalterable de marcaciones. Solo el servidor (service role) inserta.';

create index asistencia_usuario_fecha_idx on public.asistencia (usuario_id, fecha);
create index asistencia_fecha_idx         on public.asistencia (fecha);

-- ---------------------------------------------------------------------
-- 5. Función auxiliar de rol (security definer evita recursión en RLS)
-- ---------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios
    where id = (select auth.uid())
      and rol = 'admin'
      and activo
  );
$$;

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table public.usuarios   enable row level security;
alter table public.horarios   enable row level security;
alter table public.asistencia enable row level security;

-- usuarios: cada uno ve su perfil; el admin ve y administra todos.
-- (El empleado NO puede editar su perfil → no puede cambiarse el rol.)
create policy "usuarios_select_propio_o_admin" on public.usuarios
  for select to authenticated
  using (id = (select auth.uid()) or public.es_admin());

create policy "usuarios_admin_gestiona" on public.usuarios
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- horarios: cada uno ve su horario; el admin los gestiona.
create policy "horarios_select_propio_o_admin" on public.horarios
  for select to authenticated
  using (usuario_id = (select auth.uid()) or public.es_admin());

create policy "horarios_admin_gestiona" on public.horarios
  for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- asistencia: lectura propia o admin. NO hay políticas de insert/update/delete:
-- las marcaciones solo las inserta la acción de servidor con la clave secreta,
-- después de validar ubicación y red. Así nadie puede insertar "válida = true"
-- directamente desde el navegador con la clave pública.
create policy "asistencia_select_propio_o_admin" on public.asistencia
  for select to authenticated
  using (usuario_id = (select auth.uid()) or public.es_admin());

-- Defensa en profundidad: quitar permisos de escritura a roles públicos.
revoke insert, update, delete on public.asistencia from anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Vista de jornadas (base para reportes de horas y atrasos)
--    security_invoker = true → respeta el RLS de quien consulta.
-- ---------------------------------------------------------------------
create or replace view public.v_jornadas
with (security_invoker = true) as
with marcas as (
  select
    usuario_id,
    fecha,
    min(marcado_en) filter (where tipo = 'entrada')         as entrada,
    min(marcado_en) filter (where tipo = 'inicio_colacion') as inicio_colacion,
    max(marcado_en) filter (where tipo = 'fin_colacion')    as fin_colacion,
    max(marcado_en) filter (where tipo = 'salida')          as salida,
    count(*) filter (where not valida)                      as marcas_observadas
  from public.asistencia
  group by usuario_id, fecha
),
calculo as (
  select
    m.*,
    u.nombre,
    u.rut,
    h.hora_entrada,
    h.hora_salida,
    h.tolerancia_minutos,
    -- minutos de retraso respecto de la hora pactada (hora local de Chile)
    case
      when h.hora_entrada is not null and m.entrada is not null then
        round(extract(epoch from (
          (m.entrada at time zone 'America/Santiago')::time - h.hora_entrada
        )) / 60)::int
    end as minutos_tarde
  from marcas m
  join public.usuarios u on u.id = m.usuario_id
  left join public.horarios h
    on h.usuario_id = m.usuario_id
   and h.dia_semana = extract(isodow from m.fecha)::int
)
select
  usuario_id,
  nombre,
  rut,
  fecha,
  entrada,
  inicio_colacion,
  fin_colacion,
  salida,
  hora_entrada  as hora_entrada_pactada,
  hora_salida   as hora_salida_pactada,
  -- Horas trabajadas = (salida - entrada) - colación
  case
    when entrada is not null and salida is not null then
      round((
        extract(epoch from (salida - entrada))
        - coalesce(extract(epoch from (fin_colacion - inicio_colacion)), 0)
      ) / 60)::int
  end as minutos_trabajados,
  -- Atraso: solo cuenta si supera la tolerancia; se registran los minutos completos
  case
    when minutos_tarde > coalesce(tolerancia_minutos, 0) then minutos_tarde
    else 0
  end as minutos_atraso,
  marcas_observadas
from calculo;

comment on view public.v_jornadas is 'Una fila por persona y día con horas trabajadas y atraso.';

-- ---------------------------------------------------------------------
-- 8. Primer administrador
--    1) Crea tu usuario en Authentication > Users.
--    2) Ejecuta (cambiando el email):
--
-- update public.usuarios set rol = 'admin' where email = 'tu-correo@clinicadignidad.cl';
-- ---------------------------------------------------------------------
