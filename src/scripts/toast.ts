export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface ToastDetail {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

export const TOAST_EVENT = 'pup:toast';

export function showToast(message: string, type: ToastType = 'info', duration = 4000): void {
  if (typeof document === 'undefined') return;

  const detail: ToastDetail = {
    id: Math.random().toString(36).substring(2, 9),
    message,
    type,
    duration,
  };

  document.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export const toastError = (message: string, duration = 4500) => showToast(message, 'error', duration);
export const toastSuccess = (message: string, duration = 3500) => showToast(message, 'success', duration);
export const toastInfo = (message: string, duration = 3500) => showToast(message, 'info', duration);
export const toastWarning = (message: string, duration = 4000) => showToast(message, 'warning', duration);
