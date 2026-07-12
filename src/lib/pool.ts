/// Run fn over items with at most `limit` in flight. JS's single thread
/// makes the shared index safe: it only advances between awaits.
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (index < items.length) {
        const item = items[index++];
        await fn(item);
      }
    }
  );
  await Promise.all(workers);
}
