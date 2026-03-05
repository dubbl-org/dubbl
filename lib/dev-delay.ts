/** Artificial delay for testing loading states. Set to 0 to disable. */
const DEV_DELAY_MS = 2000;

export function devDelay(): Promise<void> {
  if (process.env.NODE_ENV !== "development" || DEV_DELAY_MS <= 0)
    return Promise.resolve();
  return new Promise((r) => setTimeout(r, DEV_DELAY_MS));
}
