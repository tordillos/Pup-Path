# Pup Path

Aplicación web (Astro) para entrenar a un Border Collie siguiendo un plan progresivo: 45 tareas
—trucos, hábitos de casa y órdenes— ordenadas de lo más fácil a lo más difícil, con el progreso
guardado en la nube y sugerencias automáticas de qué entrenar a continuación.

Requiere cuenta: el progreso vive en Supabase, no en el navegador. Un mismo perro puede ser
entrenado por varias personas a la vez.

## Arrancar

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # sitio estático en dist/
npm run preview    # sirve dist/
npm run check      # comprobación de tipos (astro check)

# Base de datos (Drizzle ORM)
npm run db:generate # Genera ficheros de migración SQL en /drizzle
npm run db:migrate  # Aplica migraciones a la BBDD (DATABASE_URL)
npm run db:push     # Sincroniza el esquema directamente (desarrollo rápido)
npm run db:studio   # Abre panel visual Drizzle Studio
```

## Qué hace

| Página | Contenido |
| --- | --- |
| `/` | Resumen del día: sugerencias calculadas con tu progreso, estadísticas rápidas y las 6 fases. |
| `/timeline` | Línea temporal completa con las 6 fases y sus tareas, con progreso por fase. |
| `/tarea/[id]` | Ficha de una tarea: pasos, consejos, criterio de dominio y controles de registro. |
| `/progreso` | Panel con anillo de progreso general, avance por fase, por tipo y últimas actualizaciones. |
| `/calendario` | Días entrenados mes a mes desde el alta de la mascota, con racha actual y mejor racha. |
| `/ajustes` | Mascotas del usuario, mascota activa, compartir con otros entrenadores, resetear y eliminar. |
| `/login` | Iniciar sesión o crear cuenta (Email / Contraseña o Google) sincronizada con Supabase. |

Sin sesión iniciada solo se ve una vista previa bloqueada: registrar sesiones exige cuenta.

## Base de Datos & Autenticación

- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) con PostgreSQL (Supabase).
- **Autenticación**: Supabase Auth, email/contraseña o Google.
- **Dónde vive el progreso**: en Postgres, siempre. El navegador solo recuerda qué mascota
  tienes seleccionada (`localStorage`, clave `pup-path:active-dog`), porque esa elección es de
  cada dispositivo y no del perro. No hay modo invitado ni copia local del entrenamiento: sin
  conexión la app no registra sesiones.
- **Acceso desde el cliente**: el navegador habla directamente con Supabase con la
  *publishable key*. Quien decide qué puede leer y escribir cada usuario es el RLS de las
  tablas, no el código de la app.

### Mascotas compartidas

Cada mascota tiene un `share_code` de 6 caracteres que genera un trigger de Postgres. Quien lo
recibe lo canjea en `/ajustes#unirse` y entra como **entrenador**: ve y registra progreso en
tiempo real, pero no reparte invitaciones, no resetea el historial y no puede borrar la
mascota — solo salirse.

El canje pasa por la función `join_dog_by_code()` (`SECURITY DEFINER`) y no por una consulta
directa a `dogs`: así quien se une no necesita permiso de lectura sobre las mascotas ajenas y
el código no se puede sondear leyendo la tabla.

### Migraciones

`npm run db:migrate` las aplica usando `DATABASE_URL`. **No se ejecutan en CI**: el workflow de
despliegue solo compila y publica el sitio estático. Las migraciones se lanzan a mano,
deliberadamente, para que ningún push cambie el esquema de producción por su cuenta.

## Variables de entorno

Copia `.env.example` a `.env`. En GitHub, las `PUBLIC_*` van como *Variables* (acaban en el
bundle del navegador, son públicas por diseño) y `DATABASE_URL` no se sube a ningún sitio.

| Variable | Para qué | Dónde hace falta |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL` | Dirección del proyecto Supabase | Build (se incrusta en el bundle) |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública del cliente | Build (se incrusta en el bundle) |
| `DATABASE_URL` | Conexión directa a Postgres | Solo local, para Drizzle |

## Despliegue

`.github/workflows/deploy.yml` publica en Cloudflare Pages con cada push a `main`: `npm ci`,
`astro check`, `astro build` y subida de `dist/` con Wrangler. Necesita los secrets
`CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

## Estructura

```
src/
  data/
    types.ts     Tipos: Task, Phase, ProgressState, IconName, Status
    phases.ts    Las 6 fases del plan (edad orientativa, color, icono)
    tasks.ts     Catálogo de 45 tareas — la fuente de verdad del contenido
    icons.ts     Trazos SVG de la iconografía propia (sin librerías externas)
  components/
    Icon.astro         Renderiza un icono por nombre
    TaskCard.astro     Tarjeta de tarea reutilizada en timeline y listados
    TaskControls.astro Isla de control: sesiones, estado y notas
    Header.astro       Navegación (tab bar en móvil, barra superior en escritorio)
    Toast.astro        Avisos efímeros
  layouts/BaseLayout.astro
  pages/               index, timeline, progreso, ajustes, login, tarea/[id]
  scripts/
    progress.ts    Progreso de la mascota activa: lectura, sesiones, estados y notas
    sync.ts        Mascotas del usuario, compartir, unirse por código y realtime
    auth.ts        Sesión de Supabase: alta, acceso, Google y cierre
    engine.ts      Motor: estado de cada tarea, prerrequisitos, sugerencias y estadísticas
    ui.ts          Hidratación de tarjetas y suscripción a cambios de progreso
    toast.ts       API de avisos
    query-cache.ts Caché en memoria de consultas
  db/
    schema.ts    Esquema Drizzle: profiles, dogs, dog_members, task_progress, training_sessions
    migrate.ts   Ejecutor de migraciones
  lib/supabase.ts  Cliente del navegador (null si faltan las variables PUBLIC_*)
  styles/
    tokens.css   Design tokens (color, espaciado, escala tipográfica fluida, modo oscuro)
    global.css   Reset, utilidades de layout y componentes base
drizzle/         Migraciones SQL versionadas (incluyen las políticas RLS)
```

### Diseño responsive

- Mobile-first: una columna, navegación inferior tipo tab bar y controles fijos al alcance del pulgar.
- Escala tipográfica y espaciados fluidos con `clamp()`, para que apenas hagan falta media queries.
- Rejillas con `repeat(auto-fill, minmax(...))`: las tarjetas se reorganizan solas.
- Puntos de ruptura en `rem`: 40rem (rejillas), 48rem (barra superior), 64rem (layouts a dos columnas).
- Modo claro y oscuro automáticos vía `prefers-color-scheme`, y respeto a `prefers-reduced-motion`.

## Añadir una tarea al plan

Edita `src/data/tasks.ts` y añade un objeto `Task`:

| Campo | Qué es |
| --- | --- |
| `id` | Identificador en kebab-case. Es la URL: `/tarea/<id>`. |
| `title` | Nombre visible. |
| `order` | Posición en la progresión global (1 = la más fácil). Define el orden del timeline. |
| `phase` | Fase 1–6 (ver `phases.ts`). |
| `category` | `fundamento`, `obediencia`, `habito`, `truco`, `mental` o `deporte`. |
| `difficulty` | 1–5, se pinta como cinco puntos. |
| `icon` | Nombre de `IconName`; si necesitas uno nuevo, añádelo a `icons.ts` y a `IconName`. |
| `description` | Qué es y para qué sirve. |
| `cue` | Orden verbal o señal (opcional). |
| `session` | `{ minutes, perDay }` recomendados por sesión. |
| `goalSessions` | Sesiones acumuladas para considerarlo consolidado (mueve la barra de progreso). |
| `requires` | ids que deben estar **dominados** para desbloquearla. Con esto se construye el árbol. |
| `steps` | Pasos de enseñanza, en orden. |
| `tips` | Avisos y trucos prácticos. |
| `success` | Criterio objetivo para marcarla como dominada. |

Cuidado con `requires`: si creas un ciclo (A requiere B y B requiere A), ambas quedarán bloqueadas
para siempre. `order` no tiene por qué coincidir con la fase, pero conviene que sea coherente.

## Motor de sugerencias

`suggest()` en `src/scripts/engine.ts` propone hasta 4 tareas con esta prioridad:

1. **Continuar**: hasta 2 tareas ya empezadas, las más cerca de su `goalSessions`.
2. **Empezar**: las siguientes disponibles por `order` cuyos `requires` están dominados.
3. **Repasar**: tareas dominadas hace más de 21 días.
