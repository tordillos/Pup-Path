import type { ProgressState, Status, TaskProgress } from '../data/types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const CHANGE_EVENT = 'pup:progress-change';

let inMemoryState: ProgressState = {
  version: 1,
  dogName: '',
  startedAt: new Date().toISOString(),
  tasks: {},
};

const ACTIVE_DOG_KEY = 'pup-path:active-dog';

// La mascota activa se guarda en el propio dispositivo y no en la columna
// is_current de la tabla: esa columna es del registro de la mascota, así que
// en una mascota compartida cada entrenador le pisaría la selección al otro.
let activeDogId: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_DOG_KEY) : null;
let isFetching = false;

export function getActiveDogId(): string | null {
  return activeDogId;
}

export function setActiveDogId(dogId: string | null): void {
  activeDogId = dogId;
  try {
    if (dogId) localStorage.setItem(ACTIVE_DOG_KEY, dogId);
    else localStorage.removeItem(ACTIVE_DOG_KEY);
  } catch {
    // Modo privado o almacenamiento lleno: seguimos con el valor en memoria.
  }
}

/** Deja la sesión sin mascota: ni nombre, ni progreso, ni selección guardada. */
export function clearActiveDog(): void {
  setActiveDogId(null);
  setMemoryState({
    version: 1,
    dogName: '',
    startedAt: new Date().toISOString(),
    tasks: {},
  });
}

export function load(): ProgressState {
  return inMemoryState;
}

export function setMemoryState(state: ProgressState): void {
  inMemoryState = { ...state };
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: inMemoryState }));
}

export function getTask(id: string): TaskProgress {
  return inMemoryState.tasks[id] ?? { status: 'pendiente', sessions: 0, updatedAt: '' };
}

/** Carga los datos de la mascota activa y su progreso directamente desde Supabase */
export async function ensureProgressLoaded(force = false): Promise<ProgressState> {
  if (!force && inMemoryState.dogName && activeDogId && Object.keys(inMemoryState.tasks).length > 0) {
    return inMemoryState;
  }
  if (!supabase || !isSupabaseConfigured) return inMemoryState;
  if (isFetching) return inMemoryState;

  isFetching = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      isFetching = false;
      return inMemoryState;
    }

    // 1. Obtener perro activo del usuario
    const { data: ownedDogs } = await supabase
      .from('dogs')
      .select('id, name, is_current')
      .eq('user_id', user.id)
      .order('is_current', { ascending: false });

    // Mascotas compartidas por otros usuarios: también son candidatas.
    const { data: memberRows } = await supabase
      .from('dog_members')
      .select('dog:dogs(id, name, is_current)')
      .eq('user_id', user.id);

    const candidates: any[] = [
      ...(ownedDogs || []),
      ...((memberRows || []).map((m: any) => m.dog).filter(Boolean)),
    ];

    // Respeta la mascota elegida en este dispositivo si sigue siendo accesible.
    let activeDog =
      candidates.find((d) => d.id === activeDogId) ||
      candidates.find((d) => d.is_current) ||
      candidates[0];

    if (!activeDog) {
      // Cuenta recién creada, o el usuario acaba de borrar su última mascota.
      clearActiveDog();
      return inMemoryState;
    }

    {
      setActiveDogId(activeDog.id);
      inMemoryState.dogName = activeDog.name;

      // 2. Obtener progreso de las tareas
      const { data: remoteProgress } = await supabase
        .from('task_progress')
        .select('task_id, status, sessions, notes, updated_at, mastered_at')
        .eq('dog_id', activeDog.id);

      const tasks: Record<string, TaskProgress> = {};
      if (remoteProgress) {
        for (const row of remoteProgress) {
          tasks[row.task_id] = {
            status: row.status as Status,
            sessions: row.sessions ?? 0,
            notes: row.notes ?? undefined,
            masteredAt: row.mastered_at ?? undefined,
            updatedAt: row.updated_at,
          };
        }
      }
      inMemoryState.tasks = tasks;
      document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: inMemoryState }));
    }
  } catch (err) {
    console.error('Error al cargar progreso desde la base de datos:', err);
  } finally {
    isFetching = false;
  }

  return inMemoryState;
}

/** Guarda directamente en la base de datos y actualiza la memoria y la UI */
async function updateAndSave(id: string, patch: Partial<TaskProgress>): Promise<ProgressState> {
  const current = getTask(id);
  const now = new Date().toISOString();
  const updatedTask: TaskProgress = {
    ...current,
    ...patch,
    updatedAt: now,
  };

  inMemoryState.tasks[id] = updatedTask;
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: inMemoryState }));

  if (supabase && isSupabaseConfigured) {
    try {
      let dogId = activeDogId;
      if (!dogId) {
        await ensureProgressLoaded(true);
        dogId = activeDogId;
      }

      if (dogId) {
        const { error } = await supabase.from('task_progress').upsert(
          {
            dog_id: dogId,
            task_id: id,
            status: updatedTask.status,
            sessions: updatedTask.sessions,
            notes: updatedTask.notes ?? null,
            mastered_at: updatedTask.status === 'dominado' ? (updatedTask.masteredAt || now) : null,
            updated_at: now,
          },
          { onConflict: 'dog_id,task_id' }
        );
        if (error) {
          console.error('Error al guardar en Supabase:', error);
        }
      }
    } catch (err) {
      console.error('Error al guardar:', err);
    }
  }

  return inMemoryState;
}

export const setStatus = (id: string, status: Status) => updateAndSave(id, { status });

export const TRAINING_DAYS_EVENT = 'pup:training-days-change';

/**
 * Deja constancia de CUÁNDO se entrenó, no solo de cuántas veces. El contador
 * de task_progress no sirve para el calendario: solo guarda un total y la
 * última fecha, así que un historial de días hay que escribirlo aparte.
 */
async function recordTrainingSession(taskId: string) {
  if (!supabase || !isSupabaseConfigured || !activeDogId) return;
  try {
    await supabase.from('training_sessions').insert({ dog_id: activeDogId, task_id: taskId });
    document.dispatchEvent(new CustomEvent(TRAINING_DAYS_EVENT));
  } catch (err) {
    console.error('Error al registrar la sesión en el historial:', err);
  }
}

/** Deshace la última sesión registrada de esa tarea. */
async function removeLastTrainingSession(taskId: string) {
  if (!supabase || !isSupabaseConfigured || !activeDogId) return;
  try {
    const { data } = await supabase
      .from('training_sessions')
      .select('id')
      .eq('dog_id', activeDogId)
      .eq('task_id', taskId)
      .order('performed_at', { ascending: false })
      .limit(1);

    const last = data?.[0];
    if (last) {
      await supabase.from('training_sessions').delete().eq('id', last.id);
      document.dispatchEvent(new CustomEvent(TRAINING_DAYS_EVENT));
    }
  } catch (err) {
    console.error('Error al deshacer la sesión del historial:', err);
  }
}

export const addSession = async (id: string) => {
  const current = getTask(id);
  const state = await updateAndSave(id, {
    sessions: current.sessions + 1,
    status: current.status === 'pendiente' ? 'progreso' : current.status,
  });
  await recordTrainingSession(id);
  return state;
};

export const removeSession = async (id: string) => {
  const current = getTask(id);
  const nextSessions = Math.max(0, current.sessions - 1);
  const state = await updateAndSave(id, {
    sessions: nextSessions,
    status: nextSessions === 0 && current.status === 'progreso' ? 'pendiente' : current.status,
  });
  if (current.sessions > 0) await removeLastTrainingSession(id);
  return state;
};

export const setNotes = (id: string, notes: string) => updateAndSave(id, { notes });

export async function setDogName(name: string) {
  inMemoryState.dogName = name;
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: inMemoryState }));

  if (supabase && isSupabaseConfigured) {
    let dogId = activeDogId;
    if (!dogId) {
      await ensureProgressLoaded(true);
      dogId = activeDogId;
    }
    if (dogId) {
      try {
        await supabase.from('dogs').update({ name, updated_at: new Date().toISOString() }).eq('id', dogId);
      } catch (err) {
        console.error('Error al actualizar nombre:', err);
      }
    }
  }
}

export function reset() {
  inMemoryState = {
    version: 1,
    dogName: inMemoryState.dogName,
    startedAt: new Date().toISOString(),
    tasks: {},
  };
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: inMemoryState }));
}
