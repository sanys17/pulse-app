// Pure rules for which failed requests are worth an alert. No imports, so they
// can be tested directly with node.

// "/rest/v1/habits?select=*" -> "habits"; "/auth/v1/token" -> "auth:token"
export function targetOf(url: string): string {
  let path = url;
  try {
    path = new URL(url, "http://local").pathname;
  } catch {
    // keep the raw string
  }
  const rest = path.match(/\/rest\/v1\/(?:rpc\/)?([^/?]+)/);
  if (rest) return rest[1];
  const auth = path.match(/\/auth\/v1\/([^/?]+)/);
  if (auth) return `auth:${auth[1]}`;
  return "other";
}

// Failures the app already handles or that are the user's own doing.
export function isExpectedFailure(status: number, target: string, code?: string): boolean {
  if (target.startsWith("auth:")) return status < 500; // wrong password, signup validation, rate limits
  if (code === "23505") return true; // duplicate row, handled in the UI (e.g. double cheer)
  if (code === "PGRST116") return true; // .single() found no row, used for lookups
  return false;
}
