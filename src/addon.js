/**
 * Nuvio & Stremio Addon Engine
 * Aggregates Hungarian streams from Videa, Filmezek, OnlineFilmek, and HDMozi.
 */

const { getMediaMeta } = require('./utils/meta');
const { scrapeVidea } = require('./scrapers/videa');
const { scrapeFilmezek } = require('./scrapers/filmezek');
const { scrapeOnlineFilmek } = require('./scrapers/onlinefilmek');
const { scrapeHDMozi } = require('./scrapers/hdmozi');

function getManifest() {
  return {
    id: 'community.nuvio.hungarian.streams',
    version: '1.2.0',
    name: 'Hungarian Streams (Magyar Források)',
    description: 'Magyar szinkronos és feliratos filmek és sorozatok 1080p & 720p minőségben (Videa, Filmezek, OnlineFilmek, HDMozi)',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: {
      configurable: false
    }
  };
}

async function getStreams(type, id) {
  if (!id || !id.startsWith('tt')) {
    return { streams: [] };
  }

  console.log(`[Addon] Fetching streams for ${type} ${id}`);
  const meta = await getMediaMeta(type, id);
  console.log(`[Addon] Resolved: "${meta.englishTitle}" / "${meta.hungarianTitle}" (${meta.year || 'N/A'}) S:${meta.season} E:${meta.episode}`);

  // Run all 4 scrapers in parallel with error handling
  const results = await Promise.allSettled([
    scrapeVidea(meta),
    scrapeFilmezek(meta),
    scrapeOnlineFilmek(meta),
    scrapeHDMozi(meta)
  ]);

  const allStreams = [];
  const sourceNames = ['Videa', 'Filmezek', 'OnlineFilmek', 'HDMozi'];

  results.forEach((res, idx) => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      console.log(`[Addon] ${sourceNames[idx]} found ${res.value.length} streams`);
      allStreams.push(...res.value);
    } else {
      console.warn(`[Addon] ${sourceNames[idx]} error:`, res.reason?.message || res.reason);
    }
  });

  // Deduplicate by stream URL
  const seenUrls = new Set();
  const uniqueStreams = [];
  for (const s of allStreams) {
    if (!s.url || seenUrls.has(s.url)) continue;
    seenUrls.add(s.url);
    uniqueStreams.push(s);
  }

  // Priority sorting:
  // 1. Height / Quality: 1080p (>=1080) -> 720p (>=720) -> others
  // 2. Direct MP4s (Videa) first for fastest playback
  uniqueStreams.sort((a, b) => {
    const heightA = a.height || 0;
    const heightB = b.height || 0;
    if (heightB !== heightA) {
      return heightB - heightA;
    }
    if (a.source === 'videa' && b.source !== 'videa') return -1;
    if (b.source === 'videa' && a.source !== 'videa') return 1;
    return 0;
  });

  return { streams: uniqueStreams };
}

module.exports = {
  getManifest,
  getStreams
};
