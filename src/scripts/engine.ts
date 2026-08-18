import { orderedTasks, taskById } from '../data/tasks';
import type { ProgressState, Task } from '../data/types';

export type TaskState = 'dominado' | 'progreso' | 'disponible' | 'bloqueada';

export function stateOf(task: Task, progress: ProgressState): TaskState {
  const entry = progress.tasks[task.id];
  if (entry?.status === 'dominado') return 'dominado';
  const locked = task.requires.some((r) => progress.tasks[r]?.status !== 'dominado');
  if (entry?.status === 'progreso') return 'progreso';
  return locked ? 'bloqueada' : 'disponible';
}

export function missingRequirements(task: Task, progress: ProgressState): Task[] {
  return task.requires
    .filter((r) => progress.tasks[r]?.status !== 'dominado')
    .map((r) => taskById(r))
    .filter((t): t is Task => Boolean(t));
}

export interface Suggestion {
  task: Task;
  reason: string;
  kind: 'continuar' | 'empezar' | 'repasar';
}

/**
 * Motor de sugerencias: primero cierra lo que está a medias, después abre
 * lo siguiente más fácil que ya esté desbloqueado. Máximo 4 propuestas para
 * no dispersar el entrenamiento.
 */
export function suggest(progress: ProgressState, limit = 4): Suggestion[] {
  const out: Suggestion[] = [];

  const inProgress = orderedTasks
    .filter((t) => stateOf(t, progress) === 'progreso')
    .sort((a, b) => {
      const pa = (progress.tasks[a.id]?.sessions ?? 0) / a.goalSessions;
      const pb = (progress.tasks[b.id]?.sessions ?? 0) / b.goalSessions;
      return pb - pa;
    });

  for (const task of inProgress.slice(0, 2)) {
    const done = progress.tasks[task.id]?.sessions ?? 0;
    const left = Math.max(0, task.goalSessions - done);
    out.push({
      task,
      kind: 'continuar',
      reason: left === 0 ? 'Ya tiene las sesiones: valora marcarlo como dominado.' : `Te faltan ~${left} sesiones para consolidarlo.`,
    });
  }

  const available = orderedTasks.filter((t) => stateOf(t, progress) === 'disponible');
  for (const task of available) {
    if (out.length >= limit) break;
    out.push({
      task,
      kind: 'empezar',
      reason:
        task.requires.length > 0
          ? `Desbloqueado: ya domina ${task.requires.map((r) => taskById(r)?.title ?? r).join(' y ')}.`
          : 'Siguiente paso natural en la progresión.',
    });
  }

  // Repaso: lo dominado hace más de 21 días vuelve a entrar en rotación.
  if (out.length < limit) {
    const stale = orderedTasks.filter((t) => {
      const entry = progress.tasks[t.id];
      if (entry?.status !== 'dominado' || !entry.updatedAt) return false;
      const days = (Date.now() - new Date(entry.updatedAt).getTime()) / 86_400_000;
      return days > 21;
    });
    for (const task of stale) {
      if (out.length >= limit) break;
      out.push({ task, kind: 'repasar', reason: 'Llevas más de 3 semanas sin repasarlo.' });
    }
  }

  return out.slice(0, limit);
}

export function stats(progress: ProgressState) {
  const total = orderedTasks.length;
  const dominados = orderedTasks.filter((t) => progress.tasks[t.id]?.status === 'dominado').length;
  const enProgreso = orderedTasks.filter((t) => progress.tasks[t.id]?.status === 'progreso').length;
  const sesiones = Object.values(progress.tasks).reduce((a, t) => a + (t.sessions ?? 0), 0);
  const fase = orderedTasks.find((t) => progress.tasks[t.id]?.status !== 'dominado')?.phase ?? 6;
  return {
    total,
    dominados,
    enProgreso,
    sesiones,
    fase,
    percent: total === 0 ? 0 : Math.round((dominados / total) * 100),
  };
}
