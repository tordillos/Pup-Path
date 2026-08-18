/**
 * In-memory Stale-While-Revalidate (SWR) cache.
 * Keeps data instant across page navigation in the same browser session
 * without retaining corrupt or stale data on hard reloads.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const DEFAULT_STALE_TIME = 1000 * 30; // 30 segundos

export const queryCache = {
  /** Obtiene datos en memoria instantáneamente */
  get<T>(key: string): T | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    return entry.data as T;
  },

  /** Guarda datos en memoria con timestamp */
  set<T>(key: string, data: T): void {
    memoryCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  },

  /** Invalida una o varias claves por prefijo */
  invalidate(keyPrefix: string): void {
    if (!keyPrefix) {
      memoryCache.clear();
      return;
    }
    for (const k of memoryCache.keys()) {
      if (k.startsWith(keyPrefix)) {
        memoryCache.delete(k);
      }
    }
  },

  /** Ejecuta una consulta con estrategia Stale-While-Revalidate */
  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { staleTime?: number; force?: boolean } = {}
  ): Promise<T> {
    const staleTime = options.staleTime ?? DEFAULT_STALE_TIME;
    const entry = memoryCache.get(key);

    if (entry && !options.force) {
      const isExpired = Date.now() - entry.timestamp > staleTime;
      if (isExpired) {
        // Revalidar en segundo plano sin bloquear la respuesta instantánea
        fetcher()
          .then((fresh) => {
            if (fresh !== null && fresh !== undefined) {
              this.set(key, fresh);
            }
          })
          .catch((err) => console.warn(`Error en revalidación de caché para ${key}:`, err));
      }
      return entry.data as T;
    }

    // Si no está en caché o se fuerza, esperar la petición fresca
    const freshData = await fetcher();
    if (freshData !== null && freshData !== undefined) {
      this.set(key, freshData);
    }
    return freshData;
  },
};
