import { getCollection } from 'astro:content';

// One read of the music collection per build: SoundtrackLinks renders on ~1000 detail pages,
// and an empty collection would otherwise log the same warning on every one of them.
let cached: ReturnType<typeof getCollection<'music'>> | undefined;
export function getMusicCollection() {
  cached ??= getCollection('music');
  return cached;
}
