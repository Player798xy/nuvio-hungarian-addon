/**
 * Nuvio & Stremio Addon Engine
 * Aggregates Hungarian direct streams with high-performance caching, configurable source selection, and instant resolution.
 */

const { getMediaMeta } = require('./utils/meta');
const { searchCatalog, getMeta } = require('./catalog');
const { scrapeVidea } = require('./scrapers/videa');
const { scrapeIndavideo } = require('./scrapers/indavideo');
const { scrapeJobbMintATV } = require('./scrapers/jobbmintatv');
const { scrapeFilmvilag } = require('./scrapers/filmvilag');
const { scrapeDMDAMedia } = require('./scrapers/dmdamedia');
const { scrapeMeseFilm } = require('./scrapers/mesefilm');
const { scrapeFilmezek } = require('./scrapers/filmezek');
const { scrapeOnlineFilmek } = require('./scrapers/onlinefilmek');
const { scrapeHDMozi } = require('./scrapers/hdmozi');

// High-speed In-Memory Cache (2 hours TTL for streams)
const STREAM_CACHE = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;

function getCachedStreams(key) {
  const entry = STREAM_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    STREAM_CACHE.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedStreams(key, data) {
  if (STREAM_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = STREAM_CACHE.keys().next().value;
    STREAM_CACHE.delete(oldestKey);
  }
  STREAM_CACHE.set(key, { data, timestamp: Date.now() });
}

// Registry of all supported Hungarian sources
const ALL_SCRAPERS = [
  { id: 'videa', name: 'Videa', fn: scrapeVidea },
  { id: 'indavideo', name: 'Indavideo', fn: scrapeIndavideo },
  { id: 'jobbmintatv', name: 'JobbMintATV', fn: scrapeJobbMintATV },
  { id: 'filmvilag2', name: 'Filmvilag2', fn: scrapeFilmvilag },
  { id: 'dmdamedia', name: 'DMDAMedia', fn: scrapeDMDAMedia },
  { id: 'mesefilm', name: 'MeseFilm', fn: scrapeMeseFilm },
  { id: 'filmezek', name: 'Filmezek', fn: scrapeFilmezek },
  { id: 'onlinefilmek', name: 'OnlineFilmek', fn: scrapeOnlineFilmek },
  { id: 'hdmozi', name: 'HDMozi', fn: scrapeHDMozi }
];

function getManifest(config = {}) {
  let name = 'Hungarian Streams (Magyar Források)';
  let desc = 'Magyar szinkronos filmek és sorozatok 1080p & 720p minőségben (Videa, Indavideo, JobbMintATV, Filmvilág2, DMDAMedia, MeseFilm...) szupergyors közvetlen indítással és magyar keresővel';
  
  if (config.sources && Array.isArray(config.sources) && config.sources.length > 0) {
    name = `Hungarian Streams [${config.sources.length} forrás]`;
  }

  return {
    id: 'community.nuvio.hungarian.streams',
    version: '1.5.0',
    name,
    description: desc,
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
      configurable: true,
      configurationRequired: false
    }
  };
}

async function getStreams(type, id, config = {}) {
  if (!id || !id.startsWith('tt')) {
    return { streams: [] };
  }

  // 1. Check in-memory fast cache
  const configSourcesKey = config.sources ? [...config.sources].sort().join(',') : 'all';
  const cacheKey = `${id}:${configSourcesKey}:${config.onlyHD ? 1 : 0}`;
  const cached = getCachedStreams(cacheKey);
  if (cached) {
    console.log(`[Addon] Cache HIT for ${id} (${cached.streams.length} streams, returning in <1ms)`);
    return cached;
  }

  const startTime = Date.now();
  console.log(`[Addon] Fetching streams for ${type} ${id} (sources: ${configSourcesKey})`);
  const meta = await getMediaMeta(type, id);
  console.log(`[Addon] Resolved: "${meta.englishTitle}" / "${meta.hungarianTitle}" (${meta.year || 'N/A'}) S:${meta.season} E:${meta.episode}`);

  // 2. Filter active scrapers based on user configuration
  const activeScrapers = ALL_SCRAPERS.filter(s => {
    if (!config.sources || config.sources.length === 0) return true;
    return config.sources.includes(s.id);
  });

  // 3. Run scrapers with strict 3.5s timeout per scraper to guarantee ultra-fast response
  const scraperPromises = activeScrapers.map(scraper => {
    return Promise.race([
      scraper.fn(meta),
      new Promise(resolve => setTimeout(() => resolve([]), 3500))
    ]).catch(err => {
      console.warn(`[Addon] ${scraper.name} error:`, err.message || err);
      return [];
    });
  });

  const results = await Promise.allSettled(scraperPromises);
  const allStreams = [];

  results.forEach((res, idx) => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      if (res.value.length > 0) {
        console.log(`[Addon] ${activeScrapers[idx].name} returned ${res.value.length} streams`);
      }
      allStreams.push(...res.value);
    }
  });

  // Deduplicate by stream URL
  const seenUrls = new Set();
  const uniqueStreams = [];
  for (const s of allStreams) {
    if (!s.url || seenUrls.has(s.url)) continue;
    seenUrls.add(s.url);

    // Optional HD filter
    if (config.onlyHD && s.height && s.height < 720) {
      continue;
    }

    uniqueStreams.push(s);
  }

  // Priority sorting:
  // 1. Quality (1080p -> 720p -> 480p)
  // 2. Direct MP4s (Videa, Indavideo, JobbMintATV) for instantaneous playback
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

  const durationMs = Date.now() - startTime;
  console.log(`[Addon] Finished in ${durationMs}ms: found ${uniqueStreams.length} total streams for ${id}`);

  const output = { streams: uniqueStreams };
  if (uniqueStreams.length > 0) {
    setCachedStreams(cacheKey, output);
  }

  return output;
}

module.exports = {
  getManifest,
  getStreams,
  searchCatalog,
  getMeta,
  ALL_SCRAPERS
};
