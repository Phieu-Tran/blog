import colors from '../data/cover-colors.json';

type CoverColor = { cover: string; color: string | null };
const table = colors as Record<string, CoverColor>;

/** Inline style for a detail shell: blurred cover backdrop + accent color sampled from that cover. */
export function detailShellStyle(collection: 'anime' | 'games' | 'films', id: string, cover?: string) {
  const parts: string[] = [];
  if (cover) parts.push(`--detail-image: url("${cover}")`);
  const entry = table[`${collection}/${id}`];
  // Only trust the stored color while it still belongs to the current cover.
  if (entry?.color && entry.cover === cover) parts.push(`--accent: ${entry.color}`);
  return parts.length ? parts.join('; ') : undefined;
}
