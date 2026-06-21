// True once the open splash should dismiss: services have settled (loaded or
// errored — either way the page can show), or the cap has elapsed so a slow
// network never traps the user behind the splash.
export function splashDone(servicesSettled: boolean, elapsedMs: number, capMs: number): boolean {
  return servicesSettled || elapsedMs >= capMs;
}
