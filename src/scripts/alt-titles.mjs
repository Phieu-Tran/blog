// Alternate titles so search finds an entry by any of its names
// (e.g. the film stored as "Thư Tình" is also found by "Love Letter").
// Sync fills `original_title` / `en_title`; `aka` is left for manual use.

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Returns `candidate` only when it is non-empty and differs from every title in `existing`. */
export function distinctTitle(candidate, ...existing) {
  const value = String(candidate || '').trim();
  if (!value) return undefined;
  const key = normalize(value);
  if (!key) return undefined;
  return existing.some(title => normalize(title) === key) ? undefined : value;
}

/** TMDB details fetched with append_to_response=translations. */
export function tmdbAltTitles(details, tmdbType, title) {
  const original = tmdbType === 'tv' ? details?.original_name : details?.original_title;
  const translations = details?.translations?.translations || [];
  const english = translations.find(t => t.iso_639_1 === 'en' && t.iso_3166_1 === 'US')
    || translations.find(t => t.iso_639_1 === 'en');
  const englishTitle = tmdbType === 'tv' ? english?.data?.name : english?.data?.title;

  const original_title = distinctTitle(original, title);
  const en_title = distinctTitle(englishTitle, title, original_title);
  return { original_title, en_title };
}
