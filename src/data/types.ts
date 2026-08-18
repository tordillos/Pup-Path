export type Category = 'fundamento' | 'obediencia' | 'habito' | 'truco' | 'mental' | 'deporte';

export type PhaseId = 1 | 2 | 3 | 4 | 5 | 6;

export interface Phase {
  id: PhaseId;
  slug: string;
  title: string;
  subtitle: string;
  /** Edad orientativa del perro en la que encaja esta fase. */
  age: string;
  icon: IconName;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  /** Orden cronológico global: de más fácil a más difícil. */
  order: number;
  phase: PhaseId;
  category: Category;
  /** 1 = muy fácil · 5 = experto */
  difficulty: 1 | 2 | 3 | 4 | 5;
  icon: IconName;
  /** Qué es y para qué sirve. */
  description: string;
  /** Orden verbal / señal que usarás. */
  cue?: string;
  /** Minutos por sesión y sesiones al día recomendadas. */
  session: { minutes: number; perDay: number };
  /** Sesiones acumuladas para darlo por dominado. */
  goalSessions: number;
  /** ids de tareas que conviene tener antes. */
  requires: string[];
  steps: string[];
  tips: string[];
  /** Criterio objetivo para marcarlo como dominado. */
  success: string;
}

export type IconName =
  | 'paw' | 'eye' | 'target' | 'bell' | 'bed' | 'crate' | 'leash' | 'bone'
  | 'sit' | 'down' | 'star' | 'dog' | 'ball' | 'hoop' | 'brain' | 'nose'
  | 'box' | 'sparkles' | 'hand' | 'rotate' | 'walk' | 'door' | 'moon'
  | 'whistle' | 'timer' | 'compass' | 'jump' | 'toys' | 'brush' | 'car'
  | 'users' | 'trophy' | 'wave' | 'stop' | 'search' | 'clock' | 'heart'
  | 'flag' | 'zap' | 'shield' | 'chart' | 'check' | 'lightbulb';

export type Status = 'pendiente' | 'progreso' | 'dominado';

export interface TaskProgress {
  status: Status;
  sessions: number;
  updatedAt: string;
  notes?: string;
  masteredAt?: string;
}

export interface ProgressState {
  version: 1;
  dogName: string;
  startedAt: string;
  tasks: Record<string, TaskProgress>;
}
