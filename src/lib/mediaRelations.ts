export type MediaCollection = 'anime' | 'games' | 'films';

const MEDIA_COLLECTIONS = new Set<MediaCollection>(['anime', 'games', 'films']);

export function normalizeMediaSlug(value: string) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.md$/i, '')
    .toLowerCase();
}

export function mediaRelationKey(collection: MediaCollection, slug: string) {
  return `${collection}:${normalizeMediaSlug(slug)}`;
}

export function parseMediaRelation(value: string) {
  const [collection, ...slugParts] = String(value || '').trim().split(':');
  const slug = slugParts.join(':');

  if (!MEDIA_COLLECTIONS.has(collection as MediaCollection) || !slug) return null;

  return {
    collection: collection as MediaCollection,
    slug: normalizeMediaSlug(slug),
    key: mediaRelationKey(collection as MediaCollection, slug),
  };
}

export function postRelationKeys(post: { data?: { related_media?: string[] } }) {
  return (post.data?.related_media || [])
    .map(parseMediaRelation)
    .filter(Boolean)
    .map(relation => relation!.key);
}

export function postMatchesMedia(
  post: { data?: { related_media?: string[] } },
  collection: MediaCollection,
  slug: string,
) {
  return postRelationKeys(post).includes(mediaRelationKey(collection, slug));
}

export function firstMarkdownImage(body?: string) {
  const match = String(body || '').match(/!\[[^\]]*\]\(([^)]+)\)/);
  return match?.[1]?.trim();
}
