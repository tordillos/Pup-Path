import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { setMemoryState, setActiveDogId, getActiveDogId, clearActiveDog, reset, setDogName, load } from './progress';
import { getCurrentUser } from './auth';
import type { Status, TaskProgress } from '../data/types';

export interface SyncStatus {
  isSynced: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface UserDogItem {
  id: string;
  name: string;
  breed: string | null;
  shareCode: string | null;
  isCurrent: boolean;
  role: 'owner' | 'trainer' | 'viewer';
  ownerEmail?: string;
}

let syncStatus: SyncStatus = {
  isSynced: false,
  isSyncing: false,
  lastSyncedAt: null,
  error: null,
};

export const SYNC_CHANGE_EVENT = 'pup:sync-change';
export const DOGS_CHANGE_EVENT = 'pup:dogs-change';

let realtimeChannel: any = null;

/** Los RAISE EXCEPTION del RPC ya traen texto para el usuario; el resto, no. */
function limpiarErrorPostgres(message: string): string {
  const limpio = (message || '').replace(/^.*?(?:ERROR|error):\s*/, '').trim();
  if (!limpio || /permission denied|function .* does not exist/i.test(limpio)) {
    return 'No se pudo completar la operación. Revisa que las migraciones estén aplicadas en Supabase.';
  }
  return limpio;
}

function notifySync() {
  document.dispatchEvent(new CustomEvent(SYNC_CHANGE_EVENT, { detail: syncStatus }));
}

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

/** Obtiene la lista de perros (propios y compartidos) del usuario directamente desde Supabase */
export async function getUserDogs(force = false): Promise<UserDogItem[]> {
  if (!supabase || !isSupabaseConfigured) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  try {
    // 1. Perros propios
    const { data: ownedDogs, error: ownedError } = await supabase
      .from('dogs')
      .select('id, name, breed, share_code, is_current')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (ownedError) {
      console.error('Error al consultar perros propios:', ownedError);
      throw ownedError;
    }

    const list: UserDogItem[] = [];
    const seenIds = new Set<string>();

    if (ownedDogs) {
      for (const d of ownedDogs) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          list.push({
            id: d.id,
            name: d.name,
            breed: d.breed,
            shareCode: d.share_code,
            isCurrent: Boolean(d.is_current),
            role: 'owner',
          });
        }
      }
    }

    // 2. Perros compartidos (no bloqueante)
    try {
      const { data: memberRows, error: memberError } = await supabase
        .from('dog_members')
        .select('role, dog:dogs(id, name, breed, share_code, is_current, user_id)')
        .eq('user_id', user.id);

      if (!memberError && memberRows) {
        for (const m of memberRows) {
          const d: any = m.dog;
          if (d && !seenIds.has(d.id)) {
            seenIds.add(d.id);
            list.push({
              id: d.id,
              name: d.name,
              breed: d.breed,
              // El código de invitación es del propietario: no se expone a
              // los entrenadores invitados aunque la fila sea legible.
              shareCode: null,
              isCurrent: Boolean(d.is_current),
              role: (m.role as any) || 'trainer',
            });
          }
        }
      }
    } catch (mErr) {
      console.warn('Advertencia al consultar perros compartidos:', mErr);
    }

    return list;
  } catch (err) {
    console.error('Error al obtener lista de perros:', err);
    return [];
  }
}

/** Crear una nueva mascota */
export async function createNewDog(name: string): Promise<{ success: boolean; message: string; dog?: UserDogItem }> {
  if (!supabase || !isSupabaseConfigured) return { success: false, message: 'Supabase no está configurado.' };
  const user = await getCurrentUser();
  if (!user) return { success: false, message: 'Debes iniciar sesión para añadir una mascota.' };

  const cleanName = name.trim();
  if (!cleanName) return { success: false, message: 'El nombre de la mascota no puede estar vacío.' };

  try {
    const { data: newDog, error: createError } = await supabase
      .from('dogs')
      .insert({
        user_id: user.id,
        name: cleanName,
        is_current: true,
      })
      .select('id, name, share_code, breed, is_current')
      .single();

    if (createError) throw createError;

    await switchActiveDog(newDog.id);
    document.dispatchEvent(new CustomEvent(DOGS_CHANGE_EVENT));

    return {
      success: true,
      message: `¡Mascota "${cleanName}" añadida con éxito!`,
      dog: {
        id: newDog.id,
        name: newDog.name,
        breed: newDog.breed,
        shareCode: newDog.share_code,
        isCurrent: true,
        role: 'owner',
      },
    };
  } catch (err: any) {
    console.error('Error al crear mascota:', err);
    return { success: false, message: err.message || 'Error al crear la mascota.' };
  }
}

/** Actualizar el nombre de una mascota */
export async function updateDogName(dogId: string, name: string): Promise<{ success: boolean; message: string }> {
  if (!supabase || !isSupabaseConfigured) return { success: false, message: 'Supabase no está configurado.' };
  const cleanName = name.trim();
  if (!cleanName) return { success: false, message: 'El nombre no puede estar vacío.' };

  try {
    const { error } = await supabase
      .from('dogs')
      .update({ name: cleanName, updated_at: new Date().toISOString() })
      .eq('id', dogId);

    if (error) throw error;

    await setDogName(cleanName);
    document.dispatchEvent(new CustomEvent(DOGS_CHANGE_EVENT));
    return { success: true, message: 'Nombre actualizado correctamente.' };
  } catch (err: any) {
    console.error('Error al actualizar nombre del perro:', err);
    return { success: false, message: err.message || 'Error al guardar el nuevo nombre.' };
  }
}

/** Unirse a un perro compartido mediante código */
export async function joinSharedDog(code: string): Promise<{ success: boolean; message: string; dogName?: string }> {
  if (!supabase || !isSupabaseConfigured) return { success: false, message: 'Supabase no está configurado.' };
  const user = await getCurrentUser();
  if (!user) return { success: false, message: 'Debes iniciar sesión para unirte.' };

  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return { success: false, message: 'Introduce un código válido.' };

  try {
    // Vía RPC (SECURITY DEFINER) y no consultando "dogs": quien se une no
    // tiene permiso de lectura sobre las mascotas ajenas hasta ser miembro,
    // así que el código no se puede sondear leyendo la tabla.
    const { data, error } = await supabase.rpc('join_dog_by_code', { p_code: cleanCode });

    if (error) {
      return { success: false, message: limpiarErrorPostgres(error.message) };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.dog_id) {
      return { success: false, message: 'No se encontró ninguna mascota con ese código de invitación.' };
    }

    await switchActiveDog(row.dog_id);
    document.dispatchEvent(new CustomEvent(DOGS_CHANGE_EVENT));

    return { success: true, message: `¡Te has unido al entrenamiento de ${row.dog_name}!`, dogName: row.dog_name };
  } catch (err: any) {
    console.error('Error al unirse al perro:', err);
    return { success: false, message: err.message || 'Error al unirse a la mascota compartida.' };
  }
}

/** Cambia el perro activo directamente en la base de datos */
export async function switchActiveDog(dogId: string): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;
  const user = await getCurrentUser();
  if (!user) return false;

  try {
    // is_current solo se toca en las mascotas propias: en una compartida
    // marcarla cambiaría también la selección del otro entrenador. La
    // elección real de este dispositivo vive en setActiveDogId.
    const { data: owned } = await supabase.from('dogs').select('id').eq('user_id', user.id);
    if (owned?.some((d) => d.id === dogId)) {
      await supabase.from('dogs').update({ is_current: false }).eq('user_id', user.id);
      await supabase.from('dogs').update({ is_current: true }).eq('id', dogId);
    }

    setActiveDogId(dogId);
    await fetchDogProgress(dogId);
    subscribeToRealtime(dogId);
    document.dispatchEvent(new CustomEvent(DOGS_CHANGE_EVENT));
    return true;
  } catch (err) {
    console.error('Error al cambiar de perro:', err);
    return false;
  }
}

/** Obtiene los colaboradores de un perro desde la base de datos */
export async function getDogCollaborators(dogId: string) {
  if (!supabase || !isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('dog_members')
      .select('role, created_at, user:profiles(id, email, full_name)')
      .eq('dog_id', dogId);

    if (error) throw error;
    return (data || []).map((row: any) => ({
      role: row.role,
      joinedAt: row.created_at,
      email: row.user?.email || 'Entrenador',
      name: row.user?.full_name || '',
    }));
  } catch (err) {
    console.error('Error al obtener colaboradores:', err);
    return [];
  }
}

/** Elimina una mascota directamente en la base de datos */
export async function deleteDog(dogId: string): Promise<{ success: boolean; message: string }> {
  if (!supabase || !isSupabaseConfigured) return { success: false, message: 'Supabase no está configurado.' };
  const user = await getCurrentUser();
  if (!user) return { success: false, message: 'No hay usuario autenticado.' };

  try {
    const { data: dog, error: fetchErr } = await supabase
      .from('dogs')
      .select('id, user_id, name')
      .eq('id', dogId)
      .single();

    if (fetchErr || !dog) return { success: false, message: 'Mascota no encontrada.' };

    const esPropietario = dog.user_id === user.id;

    if (esPropietario) {
      const { error: deleteError } = await supabase.from('dogs').delete().eq('id', dogId);
      if (deleteError) throw deleteError;
    } else {
      const { error: memberError } = await supabase
        .from('dog_members')
        .delete()
        .eq('dog_id', dogId)
        .eq('user_id', user.id);
      if (memberError) throw memberError;
    }

    clearActiveDog();
    const remainingDogs = await getUserDogs(true);
    if (remainingDogs.length > 0) {
      await switchActiveDog(remainingDogs[0].id);
    }

    document.dispatchEvent(new CustomEvent(DOGS_CHANGE_EVENT));
    return {
      success: true,
      message: esPropietario
        ? `Mascota "${dog.name}" eliminada correctamente.`
        : `Has salido del entrenamiento de "${dog.name}".`,
    };
  } catch (err: any) {
    console.error('Error al eliminar perro:', err);
    return { success: false, message: err.message || 'Error al eliminar mascota.' };
  }
}

/** Resetea a cero el progreso de una mascota directamente en la base de datos */
export async function resetDogProgress(dogId: string): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;
  try {
    await supabase.from('task_progress').delete().eq('dog_id', dogId);
    await supabase.from('training_sessions').delete().eq('dog_id', dogId);

    reset();
    await fetchDogProgress(dogId);
    return true;
  } catch (err) {
    console.error('Error al resetear progreso:', err);
    return false;
  }
}

/** Descarga el progreso del perro directamente desde Supabase */
export async function fetchDogProgress(dogId: string): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return;

  try {
    const { data: dog, error: dogError } = await supabase
      .from('dogs')
      .select('id, name')
      .eq('id', dogId)
      .single();

    if (dogError || !dog) return;

    const { data: remoteProgress, error: progressError } = await supabase
      .from('task_progress')
      .select('task_id, status, sessions, notes, updated_at, mastered_at')
      .eq('dog_id', dogId);

    if (progressError) throw progressError;

    const currentMemory = load();
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

    setMemoryState({
      version: 1,
      dogName: dog.name,
      startedAt: currentMemory.startedAt || new Date().toISOString(),
      tasks,
    });
  } catch (err) {
    console.error('Error al descargar progreso:', err);
  }
}

export interface TrainingHistory {
  /** Sesiones por día, con la fecha en horario local: 'AAAA-MM-DD' -> nº */
  days: Record<string, number>;
  /** Primer día con actividad; si no hay ninguno, el alta de la mascota. */
  startedAt: string | null;
}

/** Convierte un instante a 'AAAA-MM-DD' en la zona horaria del dispositivo. */
export function toLocalDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Historial de días entrenados de una mascota, para el calendario. */
export async function getTrainingHistory(dogId: string): Promise<TrainingHistory> {
  if (!supabase || !isSupabaseConfigured) return { days: {}, startedAt: null };

  try {
    const [{ data: sessions, error }, { data: dog }] = await Promise.all([
      supabase
        .from('training_sessions')
        .select('performed_at')
        .eq('dog_id', dogId)
        .order('performed_at', { ascending: true }),
      supabase.from('dogs').select('created_at').eq('id', dogId).maybeSingle(),
    ]);

    if (error) throw error;

    const days: Record<string, number> = {};
    for (const row of sessions || []) {
      const key = toLocalDayKey(new Date(row.performed_at));
      days[key] = (days[key] || 0) + 1;
    }

    // El calendario arranca en el alta de la mascota aunque ese día no se
    // entrenara: es "desde dónde empezaste".
    const startedAt = dog?.created_at
      ? toLocalDayKey(new Date(dog.created_at))
      : Object.keys(days).sort()[0] || null;

    return { days, startedAt };
  } catch (err) {
    console.error('Error al obtener el historial de entrenamiento:', err);
    return { days: {}, startedAt: null };
  }
}

/** Suscribe a cambios en tiempo real vía WebSocket */
function subscribeToRealtime(dogId: string) {
  if (!supabase) return;

  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel(`public:task_progress:dog_${dogId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_progress',
        filter: `dog_id=eq.${dogId}`,
      },
      () => {
        fetchDogProgress(dogId);
      }
    )
    .subscribe();
}

/** Carga o inicializa la sesión y descarga los datos desde la red */
export async function syncWithCloud(): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  const user = await getCurrentUser();
  if (!user) {
    syncStatus = { isSynced: false, isSyncing: false, lastSyncedAt: null, error: null };
    notifySync();
    return false;
  }

  syncStatus.isSyncing = true;
  syncStatus.error = null;
  notifySync();

  try {
    // 1. Asegurar perfil
    const metadataFullName = user.user_metadata?.full_name;
    if (metadataFullName) {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: metadataFullName,
        updated_at: new Date().toISOString(),
      });
    }

    // 2. Obtener lista de perros del usuario fresca
    const dogs = await getUserDogs(true);
    let currentDogId = getActiveDogId();

    if (currentDogId && !dogs.some((d) => d.id === currentDogId)) {
      currentDogId = null;
    }

    if (!currentDogId && dogs.length > 0) {
      const active = dogs.find((d) => d.isCurrent) || dogs[0];
      currentDogId = active.id;
    }

    if (currentDogId) {
      setActiveDogId(currentDogId);
      await fetchDogProgress(currentDogId);
      subscribeToRealtime(currentDogId);
    } else {
      // Cuenta sin mascota todavía: es un estado válido, no un error.
      clearActiveDog();
    }

    syncStatus = {
      isSynced: true,
      isSyncing: false,
      lastSyncedAt: new Date().toLocaleTimeString(),
      error: null,
    };
    notifySync();
    return true;
  } catch (err: any) {
    console.error('Error al conectar con la base de datos en red:', err);
    syncStatus = {
      isSynced: false,
      isSyncing: false,
      lastSyncedAt: null,
      error: err.message || 'Error al conectar con la base de datos',
    };
    notifySync();
    return false;
  }
}
