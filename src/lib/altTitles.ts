type AltTitleData = {
  original_title?: string;
  en_title?: string;
  aka?: string;
};

/** Every alternate name of an entry: original title, English title, then manual `aka` names (split on ";"). */
export function altNames(data: AltTitleData): string[] {
  const names = [
    data.original_title,
    data.en_title,
    ...(data.aka ? data.aka.split(';') : []),
  ]
    .map(name => String(name || '').trim())
    .filter(Boolean);
  return [...new Set(names)];
}

/** Lowercased text used by list-page filters: title plus every alternate name. */
export function searchText(title: string, data: AltTitleData, ...extra: Array<string | undefined>): string {
  return [title, ...altNames(data), ...extra].filter(Boolean).join(' ').toLowerCase();
}
