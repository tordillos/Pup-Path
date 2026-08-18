import type { ProgressState, Status, TaskProgress } from '../data/types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const CHANGE_EVENT = 'pup:progress-change';

let inMemoryState: ProgressState = {
  version: 1,
  dogName: '',
  startedAt: new Date().toISOString(),
  tasks: {},
};

let activeDogId: string | null = null;
let isFetching = false;

export function getActiveDogId(): string | null {
  return activeDogId;
}

export function setActiveDogId(dogId: string | null): void {
  activeDogId = dogId;
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

    let activeDog = ownedDogs?.find((d) => d.is_current) || ownedDogs?.[0];

    // Si no tiene propios, buscar compartidos
    if (!activeDog) {
      const { data: memberRows } = await supabase
        .from('dog_members')
        .select('role, dog:dogs(id, name, is_current)')
        .eq('user_id', user.id);
      if (memberRows && memberRows[0]?.dog) {
        activeDog = memberRows[0].dog as any;
      }
    }

    if (activeDog) {
      activeDogId = activeDog.id;
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

export const addSession = (id: string) => {
  const current = getTask(id);
  return updateAndSave(id, {
    sessions: current.sessions + 1,
    status: current.status === 'pendiente' ? 'progreso' : current.status,
  });
};

export const removeSession = (id: string) => {
  const current = getTask(id);
  const nextSessions = Math.max(0, current.sessions - 1);
  return updateAndSave(id, {
    sessions: nextSessions,
    status: nextSessions === 0 && current.status === 'progreso' ? 'pendiente' : current.status,
  });
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
