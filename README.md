# Pup Path

Aplicación web (Astro) para entrenar a un Border Collie siguiendo un plan progresivo: 45 tareas
—trucos, hábitos de casa y órdenes— ordenadas de lo más fácil a lo más difícil, con el progreso
guardado en el navegador y sugerencias automáticas de qué entrenar a continuación.

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
| `/ajustes` | Nombre del perro, cuenta en la nube, exportar/importar progreso en JSON y borrado total. |
| `/login` | Iniciar sesión o crear cuenta (Email / Contraseña o Google) sincronizada con Supabase. |

## Base de Datos & Autenticación

- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) con PostgreSQL.
- **Autenticación & Cloud Sync**: [Supabase](https://supabase.com/).
- **Modo offline/invitado**: La app funciona sin cuenta guardando en `localStorage` (clave `pup-path:progress:v1`). Al iniciar sesión, los datos se sincronizan automáticamente con la base de datos remota.
- **CI/CD & Despliegues**: En los pipelines de integración continua se ejecuta `npm run db:migrate` utilizando la variable de entorno `DATABASE_URL` para crear o actualizar el esquema de la base de datos automáticamente.

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
  layouts/BaseLayout.astro
  pages/               index, timeline, progreso, ajustes, tarea/[id]
  scripts/
    progress.ts  Store de localStorage (load/save/estado/sesiones/notas/export/import)
    engine.ts    Motor: estado de cada tarea, prerrequisitos, sugerencias y estadísticas
    ui.ts        Hidratación de tarjetas y suscripción a cambios de progreso
  styles/
    tokens.css   Design tokens (color, espaciado, escala tipográfica fluida, modo oscuro)
    global.css   Reset, utilidades de layout y componentes base
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
