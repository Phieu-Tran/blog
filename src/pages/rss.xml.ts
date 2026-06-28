import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('posts'))
    .filter(post => !post.data.draft)
    .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  return rss({
    title: 'Phieu.work Posts',
    description: 'Reviews, essays, notes, and media writing from Phieu.work.',
    site: context.site,
    items: posts.map(post => ({
      title: post.data.title,
      description: post.data.description || (post.data.tags || []).join(', '),
      pubDate: post.data.date,
      link: `/posts/${post.id}/`,
      categories: post.data.tags || [],
    })),
    customData: '<language>vi-VN</language>',
  });
}
