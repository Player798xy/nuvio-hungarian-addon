/**
 * Nuvio & Stremio Addon Engine
 * Aggregates Hungarian direct streams from Videa, Indavideo, JobbMintATV, Filmezek, OnlineFilmek, and HDMozi.
 */

const { getMediaMeta } = require('./utils/meta');
const { searchCatalog, getMeta } = require('./catalog');
const { scrapeVidea } = require('./scrapers/videa');
const { scrapeIndavideo } = require('./scrapers/indavideo');
const { scrapeJobbMintATV } = require('./scrapers/jobbmintatv');
const { scrapeFilmezek } = require('./scrapers/filmezek');
const { scrapeOnlineFilmek } = require('./scrapers/onlinefilmek');
const { scrapeHDMozi } = require('./scrapers/hdmozi');

function getManifest() {
  return {
    id: 'community.nuvio.hungarian.streams',
    version: '1.4.0',
    name: 'Hungarian Streams (Magyar Források)',
    description: 'Magyar szinkronos filmek és sorozatok 1080p & 720p minőségben (Videa, Indavideo, JobbMintATV, Filmezek, OnlineFilmek, HDMozi) azonnali közvetlen indítással és magyar keresővel',
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [
      {
        type: 'series',
        id: 'hu-series',
        name: 'Magyar Sorozatok & Mesék',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'movie',
        id: 'hu-movies',
        name: 'Magyar Filmek',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      }
    ],
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

  // Run all scrapers in parallel with error handling
  const results = await Promise.allSettled([
    scrapeVidea(meta),
    scrapeIndavideo(meta),
    scrapeJobbMintATV(meta),
    scrapeFilmezek(meta),
    scrapeOnlineFilmek(meta),
    scrapeHDMozi(meta)
  ]);

  const allStreams = [];
  const sourceNames = ['Videa', 'Indavideo', 'JobbMintATV', 'Filmezek', 'OnlineFilmek', 'HDMozi'];

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
  // 2. Direct MP4s (Videa, Indavideo, OK.ru) for instantaneous playback
  uniqueStreams.sort((a, b) => {
    const heightA = a.height || 0;
    const heightB = b.height || 0;
    if (heightB !== heightA) {
      return heightB - heightA;
    }
    const isDirectA = a.source === 'videa' || a.source === 'indavideo' || a.source === 'jobbmintatv' || (a.url && a.url.includes('.mp4'));
    const isDirectB = b.source === 'videa' || b.source === 'indavideo' || b.source === 'jobbmintatv' || (b.url && b.url.includes('.mp4'));
    if (isDirectA && !isDirectB) return -1;
    if (isDirectB && !isDirectA) return 1;
    return 0;
  });

  return { streams: uniqueStreams };
}

module.exports = {
  getManifest,
  getStreams,
  searchCatalog,
  getMeta
};
