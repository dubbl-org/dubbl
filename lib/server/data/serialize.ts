/**
 * Server components hand data to client components as props, which means it
 * crosses the network boundary as JSON. Drizzle returns Date objects and the
 * client interfaces are typed against JSON strings, so convert explicitly here
 * rather than letting the mismatch surface as a runtime surprise.
 */
export function toClient<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
