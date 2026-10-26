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
const { scrapeMediaKlikk, getLiveChannelStreams, LIVE_CHANNELS } = require('./scrapers/mediaklikk');

// Registry of all supported Hungarian sources (No caching - always fresh live scraper results)
const FAST_SCRAPER_IDS = new Set(['videa', 'indavideo', 'jobbmintatv', 'filmvilag2', 'mediaklikk']);

const ALL_SCRAPERS = [
  { id: 'videa', name: 'Videa', fn: scrapeVidea, fast: true },
  { id: 'indavideo', name: 'Indavideo', fn: scrapeIndavideo, fast: true },
  { id: 'jobbmintatv', name: 'JobbMintATV', fn: scrapeJobbMintATV, fast: true },
  { id: 'filmvilag2', name: 'Filmvilag2', fn: scrapeFilmvilag, fast: true },
  { id: 'mediaklikk', name: 'MédiaKlikk', fn: scrapeMediaKlikk, fast: true },
  { id: 'dmdamedia', name: 'DMDAMedia', fn: scrapeDMDAMedia, fast: false },
  { id: 'mesefilm', name: 'MeseFilm', fn: scrapeMeseFilm, fast: true },
  { id: 'filmezek', name: 'Filmezek', fn: scrapeFilmezek, fast: false },
  { id: 'onlinefilmek', name: 'OnlineFilmek', fn: scrapeOnlineFilmek, fast: false },
  { id: 'hdmozi', name: 'HDMozi', fn: scrapeHDMozi, fast: false }
];

function getManifest(config = {}) {
  let name = 'Hungarian Streams (Magyar Források)';
  let desc = 'Magyar szinkronos filmek és sorozatok 1080p & 720p minőségben (Videa, Indavideo, JobbMintATV, Filmvilág2, DMDAMedia, MeseFilm...) szupergyors közvetlen indítással és magyar keresővel';
  
  if (config.sources && Array.isArray(config.sources) && config.sources.length > 0) {
    name = `Hungarian Streams [${config.sources.length} forrás]`;
  }

  const hostUrl = config.hostUrl || 'https://nuvio-hungarian-addon.vercel.app';

  return {
    id: 'community.nuvio.hungarian.streams',
    version: '1.6.2',
    name,
    description: desc,
    logo: `${hostUrl}/logo.png`,
    icon: `${hostUrl}/logo.png`,
    background: `${hostUrl}/logo.png`,
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series', 'channel', 'tv'],
    idPrefixes: ['tt', 'mediaklikk-live-'],
    catalogs: [
      {
        type: 'movie',
        id: 'hu-live-tv',
        name: '🔴 Magyar Élő TV (M4 Sport, M1, Duna)',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
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
      },
      {
        type: 'tv',
        id: 'hu-live-tv-channel',
        name: '🔴 Magyar Élő TV (IPTV)',
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
  // Handle Live TV channels
  if (type === 'tv' || type === 'channel' || (id && id.startsWith('mediaklikk-live-'))) {
    const liveStreams = await getLiveChannelStreams(id, config.clientIp, config.hostUrl);
    return { streams: liveStreams };
  }

  if (!id || !id.startsWith('tt')) {
    return { streams: [] };
  }

  const configSourcesKey = config.sources ? [...config.sources].sort().join(',') : 'all';
  const startTime = Date.now();
  console.log(`[Addon] Fetching fresh streams for ${type} ${id} (sources: ${configSourcesKey})`);
  const meta = await getMediaMeta(type, id);
  console.log(`[Addon] Resolved: "${meta.englishTitle}" / "${meta.hungarianTitle}" (${meta.year || 'N/A'}) S:${meta.season} E:${meta.episode}`);

  // 2. Filter active scrapers based on user configuration and stage
  let candidateScrapers = ALL_SCRAPERS;
  let timeoutMs = config.timeoutMs || 9500; // Search up to user-selected duration

  if (config.stage === 'fast') {
    candidateScrapers = ALL_SCRAPERS.filter(s => FAST_SCRAPER_IDS.has(s.id));
    timeoutMs = Math.min(timeoutMs, 3500); // Fast initial response (~2-3s)
  } else {
    // Both 'deep' and default 'all' run ALL scrapers up to configured timeout
    candidateScrapers = ALL_SCRAPERS;
  }

  const activeScrapers = candidateScrapers.filter(s => {
    if (!config.sources || config.sources.length === 0) return true;
    return config.sources.includes(s.id);
  });

  // 3. Run scrapers with smart tiering (Fast scrapers return in ~2s, preventing Nuvio timeouts)
  const fastScrapers = activeScrapers.filter(s => s.fast);
  const otherScrapers = activeScrapers.filter(s => !s.fast);
  const allStreams = [];

  const fastPromises = fastScrapers.map(scraper => {
    return Promise.race([
      scraper.fn(meta),
      new Promise(resolve => setTimeout(() => resolve([]), 4500))
    ]).catch(err => {
      console.warn(`[Addon] ${scraper.name} error:`, err.message || err);
      return [];
    });
  });

  const otherPromises = otherScrapers.map(scraper => {
    return Promise.race([
      scraper.fn(meta),
      new Promise(resolve => setTimeout(() => resolve([]), timeoutMs))
    ]).catch(err => {
      console.warn(`[Addon] ${scraper.name} error:`, err.message || err);
      return [];
    });
  });

  // Await fast scrapers first
  const fastResults = await Promise.allSettled(fastPromises);
  fastResults.forEach((res, idx) => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      if (res.value.length > 0) {
        console.log(`[Addon] ${fastScrapers[idx].name} returned ${res.value.length} streams`);
      }
      allStreams.push(...res.value);
    }
  });

  // If fast scrapers already found high quality streams, return immediately for instant playback
  const hasGoodStreams = allStreams.some(s => s.height >= 720) || allStreams.length >= 3;
  if (!hasGoodStreams && otherScrapers.length > 0 && config.stage !== 'fast') {
    const otherResults = await Promise.allSettled(otherPromises);
    otherResults.forEach((res, idx) => {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        if (res.value.length > 0) {
          console.log(`[Addon] ${otherScrapers[idx].name} returned ${res.value.length} streams`);
        }
        allStreams.push(...res.value);
      }
    });
  }

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

    // Precise resolution filter (1080p, 720p, 480p, 360p)
    if (config.resolutions && config.resolutions.length > 0) {
      const resSet = new Set(config.resolutions.map(r => r.toLowerCase()));
      const h = s.height || 0;
      let matches = false;
      if (resSet.has('1080p') && (h >= 1080 || (s.name && s.name.includes('1080')))) matches = true;
      if (resSet.has('720p') && ((h >= 720 && h < 1080) || (s.name && s.name.includes('720')))) matches = true;
      if (resSet.has('480p') && ((h >= 480 && h < 720) || (s.name && s.name.includes('480')))) matches = true;
      if (resSet.has('360p') && (h < 480 || (s.name && (s.name.includes('360') || s.name.includes('240'))))) matches = true;
      if (!matches) continue;
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

  return { streams: uniqueStreams };
}

module.exports = {
  getManifest,
  getStreams,
  searchCatalog,
  getMeta,
  ALL_SCRAPERS
};
