/** Pool de concurrence borné : exécute `worker` sur chaque élément de `items`, au plus `concurrency` en parallèle.
 *  Si `shouldStop` devient vrai, arrête de distribuer du travail (les tâches déjà en cours se terminent). */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runOne() {
    while (cursor < items.length) {
      if (shouldStop?.()) return;
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne());
  await Promise.all(workers);
  return results;
}
