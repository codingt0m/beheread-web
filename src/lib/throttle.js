// Per-source minimum interval between requests, mirroring the desktop
// clients' MIN_INTERVAL: metadata lookups run for a whole library scan and
// anonymous/no-key API quotas are shared by IP, so bursts risk 429s.
export function createThrottle(minIntervalMs) {
  let last = 0
  return async function wait() {
    const elapsed = Date.now() - last
    if (elapsed < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed))
    }
    last = Date.now()
  }
}
