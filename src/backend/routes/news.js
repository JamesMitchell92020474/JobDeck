const express = require('express');

const router = express.Router();

let cache = { items: [], fetchedAt: 0 };
const CACHE_MS = 30 * 60 * 1000;

async function fetchHN() {
  const res = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10');
  const data = await res.json();
  return data.hits
    .filter(h => h.title && h.url)
    .slice(0, 5)
    .map(h => ({
      title:        h.title,
      url:          h.url,
      source:       'Hacker News',
      published_at: h.created_at,
    }));
}

function extractCdata(str) {
  const cdata = str.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdata ? cdata[1].trim() : str.trim();
}

function parseRSS(xml, sourceName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const block = match[1];
    const rawTitle   = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]   || '';
    const rawLink    = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]     ||
                       block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] || '';
    const rawPubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
    const title = extractCdata(rawTitle);
    const url   = extractCdata(rawLink).replace(/&amp;/g, '&');
    if (!title || !url) continue;
    const published_at = rawPubDate ? new Date(rawPubDate).toISOString() : new Date().toISOString();
    items.push({ title, url, source: sourceName, published_at });
  }
  return items;
}

async function fetchGeekzone() {
  const res = await fetch('https://feeds.geekzone.co.nz/geekzone', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml' },
  });
  const xml = await res.text();
  return parseRSS(xml, 'Geekzone');
}

router.get('/', async (req, res) => {
  const force = req.query.refresh === '1';
  if (!force && Date.now() - cache.fetchedAt < CACHE_MS && cache.items.length) {
    return res.json(cache.items);
  }

  const [hn, gz] = await Promise.allSettled([fetchHN(), fetchGeekzone()]);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const items = [
    ...(hn.status === 'fulfilled' ? hn.value : []),
    ...(gz.status === 'fulfilled' ? gz.value : []),
  ]
    .filter(item => new Date(item.published_at).getTime() > cutoff)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  cache = { items, fetchedAt: Date.now() };
  res.json(items);
});

module.exports = router;
