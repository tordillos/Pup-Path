import type { Phase } from './types';

export const phases: Phase[] = [
  {
    id: 1,
    slug: 'fundamentos',
    title: 'Fundamentos',
    subtitle: 'Vínculo, atención y marcador. Todo lo demás se construye aquí.',
    age: '8 – 12 semanas',
    icon: 'paw',
    color: '#5eb0a0',
  },
  {
    id: 2,
    slug: 'obediencia-basica',
    title: 'Obediencia básica',
    subtitle: 'Las cinco órdenes que usarás el resto de su vida.',
    age: '3 – 5 meses',
    icon: 'sit',
    color: '#6aa6d8',
  },
  {
    id: 3,
    slug: 'habitos',
    title: 'Hábitos y convivencia',
    subtitle: 'Rutinas de casa: dormir en su sitio, transportín, paseo, soledad.',
    age: '3 – 6 meses',
    icon: 'bed',
    color: '#b58fd6',
  },
  {
    id: 4,
    slug: 'trucos-intermedios',
    title: 'Trucos intermedios',
    subtitle: 'Trucos de salón que afilan su coordinación y su foco.',
    age: '5 – 9 meses',
    icon: 'star',
    color: '#e0a458',
  },
  {
    id: 5,
    slug: 'control-y-mente',
    title: 'Control a distancia y trabajo mental',
    subtitle: 'Lo que un Border Collie necesita de verdad: cabeza ocupada.',
    age: '9 – 15 meses',
    icon: 'brain',
    color: '#dd7f7f',
  },
  {
    id: 6,
    slug: 'avanzado',
    title: 'Avanzado y deportivo',
    subtitle: 'Freestyle, agility y secuencias encadenadas.',
    age: '15 meses en adelante',
    icon: 'trophy',
    color: '#c76ba8',
  },
];

export const phaseById = (id: number) => phases.find((p) => p.id === id)!;
