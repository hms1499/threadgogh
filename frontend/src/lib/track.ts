// Pure client/server-safe helper for the backlink loop. Classifies a landing
// path into the backlink variant we record: a deep-link thread page vs anything
// else (the homepage fallback). No DOM, no env.
export type BacklinkVariant = 'home' | 'thread';

export function backlinkVariant(pathname: string): BacklinkVariant {
  return pathname.startsWith('/t/') ? 'thread' : 'home';
}
