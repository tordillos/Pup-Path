import { taskById } from '../data/tasks';
import { iconPaths } from '../data/icons';
import type { IconName } from '../data/types';
import { CHANGE_EVENT, load } from './progress';
import { stateOf, type TaskState } from './engine';

const STATE_LABEL: Record<TaskState, string> = {
  dominado: 'Dominado',
  progreso: 'En progreso',
  disponible: 'Disponible',
  bloqueada: 'Bloqueada',
};

export function icon(name: IconName, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}

/** Pinta el estado guardado sobre cualquier tarjeta ya renderizada en el HTML. */
export function hydrateCards(root: ParentNode = document): void {
  const progress = load();
  root.querySelectorAll<HTMLElement>('[data-task-id]').forEach((el) => {
    const task = taskById(el.dataset.taskId ?? '');
    if (!task) return;

    const state = stateOf(task, progress);
    const entry = progress.tasks[task.id];
    const sessions = entry?.sessions ?? 0;

    el.dataset.state = state;

    const chip = el.querySelector('[data-state-chip]');
    if (chip) chip.textContent = STATE_LABEL[state];

    const counter = el.querySelector('[data-sessions]');
    if (counter) counter.textContent = String(sessions);

    const bar = el.querySelector<HTMLElement>('[data-progress-bar]');
    if (bar) bar.style.width = `${Math.min(100, Math.round((sessions / task.goalSessions) * 100))}%`;
  });
}

export function onProgressChange(fn: () => void): void {
  document.addEventListener(CHANGE_EVENT, fn);
  window.addEventListener('storage', fn);
}

export function autoHydrate(): void {
  hydrateCards();
  onProgressChange(() => hydrateCards());
}
