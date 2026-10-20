-- =====================================================================
-- 0003 · Inicio de sesión con nombre de usuario (sin correo)
-- Ejecutar en Supabase (SQL Editor) DESPUÉS de 0002.
--
-- Supabase Auth necesita un correo por cuenta. La app lo resuelve así:
--   - Cada persona tiene un `usuario` único (ej. "jorgeopazo").
--   - Al iniciar sesión, el servidor busca el correo de ese usuario y entra
--     con él. La persona nunca escribe el correo.
--   - Si alguien no tiene correo, se le asigna uno interno que no se usa
--     para enviar nada.
-- =====================================================================

-- 1. Columna usuario ----------------------------------------------------
alter table public.usuarios add column if not exists usuario text;

-- 2. Rellenar a quienes ya existen: parte del correo antes de la @,
--    en minúsculas y solo con caracteres válidos. Si se repite, se numera.
with base as (
  select
    id,
    coalesce(
      nullif(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
      'usuario'
    ) as candidato
  from public.usuarios
  where usuario is null
),
numerados as (
  select
    id,
    candidato,
    row_number() over (partition by candidato order by id) as n
  from base
)
update public.usuarios u
set usuario = case when n.n = 1 then n.candidato else n.candidato || n.n end
from numerados n
where u.id = n.id;

-- Asegurar mínimo 3 caracteres
update public.usuarios set usuario = usuario || '01' where length(usuario) < 3;

-- 3. Reglas: obligatorio, único, minúsculas, 3–30 caracteres --------------
alter table public.usuarios alter column usuario set not null;

alter table public.usuarios drop constraint if exists usuarios_usuario_formato;
alter table public.usuarios add constraint usuarios_usuario_formato
  check (usuario ~ '^[a-z0-9._-]{3,30}$');

create unique index if not exists usuarios_usuario_key on public.usuarios (usuario);

comment on column public.usuarios.usuario is 'Nombre de usuario para iniciar sesión (minúsculas, sin espacios).';

-- 4. El trigger que crea el perfil ahora también guarda el usuario --------
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario text;
begin
  v_usuario := coalesce(
    nullif(lower(new.raw_user_meta_data ->> 'usuario'), ''),
    nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
    'usuario'
  );
  v_usuario := left(v_usuario, 22);
  if length(v_usuario) < 3 then
    v_usuario := v_usuario || '01';
  end if;

  -- Si ya existe, se agrega un sufijo corto tomado del id
  if exists (select 1 from public.usuarios where usuario = v_usuario) then
    v_usuario := v_usuario || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;

  insert into public.usuarios (id, nombre, email, usuario)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    new.email,
    v_usuario
  );
  return new;
end;
$$;

-- 5. Revisar el resultado (opcional) --------------------------------------
-- select nombre, email, usuario from public.usuarios order by nombre;
