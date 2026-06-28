export type OgImageItem = {
  title: string;
  eyebrow: string;
  subtitle?: string;
  description?: string;
  cover?: string;
  accent: string;
  metric?: string;
};

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapText(value: string | undefined, maxChars: number, maxLines: number) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';

  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);

  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/[.,;:!?-]*$/, '')}...`;
    return clipped;
  }

  return lines;
}

function renderLines(lines: string[], x: number, y: number, lineHeight: number, className: string) {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`)
    .join('');
}

export function renderOgImage(item: OgImageItem, site?: URL | string | null) {
  const titleLines = wrapText(item.title, 32, 3);
  const descriptionLines = wrapText(item.description || item.subtitle, 54, 2);
  const cover = item.cover ? new URL(item.cover, site || 'https://blog.workspacesbeat.site').toString() : '';
  const hasCover = Boolean(cover);
  const titleY = titleLines.length > 2 ? 205 : 235;
  const descriptionY = titleY + titleLines.length * 58 + 36;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(item.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#090914"/>
      <stop offset="0.56" stop-color="#10111f"/>
      <stop offset="1" stop-color="#0a0a14"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${escapeXml(item.accent)}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.22"/>
    </linearGradient>
    <clipPath id="coverClip">
      <rect x="805" y="74" width="275" height="400" rx="28"/>
    </clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
    <style>
      .brand { fill: #E2E8F0; font: 700 30px 'Space Mono', monospace; letter-spacing: 0; }
      .eyebrow { fill: ${escapeXml(item.accent)}; font: 700 22px 'Space Mono', monospace; letter-spacing: 4px; text-transform: uppercase; }
      .title { fill: #F8FAFC; font: 800 54px 'DM Sans', Arial, sans-serif; letter-spacing: 0; }
      .desc { fill: rgba(226, 232, 240, 0.68); font: 500 26px 'DM Sans', Arial, sans-serif; letter-spacing: 0; }
      .metric { fill: #0A0A14; font: 800 34px 'Space Mono', monospace; letter-spacing: 0; }
      .metricLabel { fill: rgba(226, 232, 240, 0.62); font: 700 18px 'Space Mono', monospace; letter-spacing: 2px; }
      .small { fill: rgba(226, 232, 240, 0.42); font: 500 20px 'DM Sans', Arial, sans-serif; letter-spacing: 0; }
    </style>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="52" y="52" width="1096" height="526" rx="34" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.11)"/>
  <path d="M52 126 H720" stroke="url(#accent)" stroke-width="3"/>
  <path d="M52 526 H1148" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="86" y="105" class="brand">Phieu.work</text>
  <text x="86" y="166" class="eyebrow">${escapeXml(item.eyebrow)}</text>
  ${renderLines(titleLines, 86, titleY, 58, 'title')}
  ${renderLines(descriptionLines, 88, descriptionY, 34, 'desc')}
  ${
    item.metric
      ? `<rect x="86" y="461" width="112" height="72" rx="18" fill="${escapeXml(item.accent)}"/>
  <text x="142" y="509" text-anchor="middle" class="metric">${escapeXml(item.metric)}</text>
  <text x="222" y="493" class="metricLabel">SCORE</text>`
      : `<text x="86" y="504" class="small">Anime, games, films, and notes</text>`
  }
  ${
    hasCover
      ? `<rect x="805" y="74" width="275" height="400" rx="28" fill="rgba(255,255,255,0.05)" filter="url(#shadow)"/>
  <image href="${escapeXml(cover)}" x="805" y="74" width="275" height="400" preserveAspectRatio="xMidYMid slice" clip-path="url(#coverClip)"/>
  <rect x="805" y="74" width="275" height="400" rx="28" fill="none" stroke="rgba(255,255,255,0.2)"/>`
      : `<rect x="805" y="74" width="275" height="400" rx="28" fill="rgba(255,255,255,0.055)" stroke="rgba(255,255,255,0.14)" filter="url(#shadow)"/>
  <text x="942" y="304" text-anchor="middle" class="title">${escapeXml(item.title.slice(0, 1).toUpperCase())}</text>`
  }
</svg>`;
}
