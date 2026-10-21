-- =====================================================================
-- 0005 · Verificación de identidad con huella / Face ID (passkeys)
-- Ejecutar en Supabase (SQL Editor) DESPUÉS de 0004.
--
-- Cómo funciona:
--   1. La administración genera un CÓDIGO DE ACTIVACIÓN (15 min) para una
--      persona y se lo entrega en mano.
--   2. La persona, en SU celular, ingresa el código y registra su huella o
--      rostro. El celular crea una llave privada que nunca sale del equipo;
--      aquí solo se guarda la llave PÚBLICA.
--   3. Cada marca pide la huella/rostro y el servidor verifica la firma.
--      Sin ese celular y sin el dedo/cara de la persona, no se puede marcar
--      como ella aunque se sepa su usuario y contraseña.
--
-- No se guarda ninguna huella ni foto del rostro: la biometría la valida
-- el propio teléfono y nunca llega al servidor.
--
-- Todas estas tablas se usan SOLO desde el servidor (clave secreta):
-- tienen RLS activado y ninguna política, así que nadie las lee desde el
-- navegador.
-- =====================================================================

-- 1. Llaves registradas (una por persona) ---------------------------------
create table if not exists public.credenciales_identidad (
  id              bigint generated always as identity primary key,
  usuario_id      uuid not null references public.usuarios (id) on delete cascade,
  credencial_id   text not null unique,      -- id de la llave (base64url)
  llave_publica   text not null,             -- llave pública COSE (base64url)
  contador        bigint not null default 0, -- contador de firmas (anti-clonado)
  transportes     text[],
  dispositivo     text,                      -- descripción legible ("Android", "iPhone"…)
  creada_en       timestamptz not null default now(),
  ultimo_uso      timestamptz
);

create index if not exists credenciales_identidad_usuario_idx
  on public.credenciales_identidad (usuario_id);

comment on table public.credenciales_identidad is
  'Llave de acceso (passkey) del celular de cada persona. Solo la llave pública; la biometría queda en el teléfono.';

-- 2. Códigos de activación (los entrega la administración) ---------------
create table if not exists public.codigos_activacion (
  usuario_id   uuid primary key references public.usuarios (id) on delete cascade,
  codigo_hash  text not null,                -- SHA-256 del código (nunca el código en claro)
  expira_en    timestamptz not null,
  intentos     smallint not null default 0,  -- intentos fallidos (máx. 5)
  creado_en    timestamptz not null default now()
);

comment on table public.codigos_activacion is
  'Código de un solo uso para activar la huella en el celular de una persona.';

-- 3. Desafíos de un solo uso (anti-repetición) ---------------------------
create table if not exists public.desafios_identidad (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  tipo        text not null check (tipo in ('registro', 'verificacion')),
  desafio     text not null,
  expira_en   timestamptz not null,
  usado       boolean not null default false,
  creado_en   timestamptz not null default now()
);

create index if not exists desafios_identidad_usuario_idx
  on public.desafios_identidad (usuario_id, tipo, creado_en desc);

-- 4. RLS sin políticas: solo el servidor accede --------------------------
alter table public.credenciales_identidad enable row level security;
alter table public.codigos_activacion     enable row level security;
alter table public.desafios_identidad     enable row level security;

revoke all on public.credenciales_identidad from anon, authenticated;
revoke all on public.codigos_activacion     from anon, authenticated;
revoke all on public.desafios_identidad     from anon, authenticated;

-- 5. Cada marca guarda si la identidad fue verificada ---------------------
alter table public.asistencia
  add column if not exists identidad_verificada boolean not null default false;

comment on column public.asistencia.identidad_verificada is
  'true si la persona confirmó con huella/rostro en su celular registrado.';
