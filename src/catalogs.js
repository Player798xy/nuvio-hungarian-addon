/**
 * Dynamic Hungarian & Streaming Catalogs for Nuvio & Stremio
 * Powered by TMDB, Mafab metadata, and MTVA MédiaKlikk.
 * Provides configurable shelves (Trending, Cinema, Hungarian Toplist, Streaming providers like Netflix, Max, Disney+).
 */

const { LIVE_CHANNELS, getMediaKlikkPrograms } = require('./scrapers/mediaklikk');

const TMDB_API_KEY = process.env.TMDB_API_KEY || 'ffe7ef8916c61835264d2df68276ddc2';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// In-memory catalog and IMDb mapping caches (TTL: 1 hour)
const catalogCache = new Map();
const imdbIdCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Catalog Definitions
 */
const CATALOG_DEFINITIONS = [
  // 1. Live TV & MTVA Archive
  {
    id: 'hu-live-tv',
    name: '🔴 Magyar Élő TV (M4 Sport, M1, Duna)',
    type: 'movie',
    category: 'tv',
    description: 'M4 Sport, M1, Duna, TV2, RTL és 25+ magyar élő televíziócsatorna közvetlen HLS adása.',
    defaultEnabled: true
  },
  {
    id: 'hu-mediaklikk-classics',
    name: '🏛️ MédiaKlikk Klasszikusok (MTVA)',
    type: 'series',
    category: 'tv',
    description: 'Felújított magyar retro sorozatok és klasszikusok (A nagy ho-ho-horgász, Mézga család, Süsü, stb.).',
    defaultEnabled: true
  },

  // 2. Toplists & Cinema
  {
    id: 'hu-trending-movies',
    name: '🔥 Heti legnézettebb filmek (Toplista)',
    type: 'movie',
    category: 'top',
    description: 'Magyarországi heti legnépszerűbb filmek listája.',
    defaultEnabled: true
  },
  {
    id: 'hu-trending-series',
    name: '🔥 Heti legnézettebb sorozatok (Toplista)',
    type: 'series',
    category: 'top',
    description: 'Magyarországi heti legnépszerűbb sorozatok listája.',
    defaultEnabled: true
  },
  {
    id: 'hu-cinema-movies',
    name: '🍿 Jelenleg a mozikban (Premierek)',
    type: 'movie',
    category: 'top',
    description: 'Friss magyarországi mozibemutatók és premierek.',
    defaultEnabled: true
  },
  {
    id: 'hu-hungarian-movies',
    name: '🇭🇺 Magyar Filmek Toplistája',
    type: 'movie',
    category: 'top',
    description: 'A legnépszerűbb és legjobb hazai gyártású magyar filmek.',
    defaultEnabled: true
  },
  {
    id: 'hu-hungarian-series',
    name: '🇭🇺 Magyar Sorozatok Toplistája',
    type: 'series',
    category: 'top',
    description: 'Hazai sorozatok (A mi kis falunk, Aranyélet, Barátok közt, stb.).',
    defaultEnabled: true
  },
  {
    id: 'hu-top-rated-movies',
    name: '⭐ Legjobbra értékelt filmek',
    type: 'movie',
    category: 'top',
    description: 'Minden idők legmagasabb nézői értékelésű filmjei.',
    defaultEnabled: false
  },

  // 3. Streaming Provider Shelves (Flix-Catalogs style)
  {
    id: 'hu-stream-netflix',
    name: '🔴 Netflix (Magyar kínálat)',
    type: 'movie',
    category: 'stream',
    description: 'Népszerű magyar szinkronos filmek és saját gyártású premierek a Netflixről.',
    defaultEnabled: false
  },
  {
    id: 'hu-stream-max',
    name: '🟣 Max / HBO Max (Magyar kínálat)',
    type: 'movie',
    category: 'stream',
    description: 'A Max (HBO Max) legnézettebb szinkronos filmjei és sorozatai Magyarországon.',
    defaultEnabled: false
  },
  {
    id: 'hu-stream-disney',
    name: '🔵 Disney+ Magyarország',
    type: 'movie',
    category: 'stream',
    description: 'Disney, Marvel Studios, Star Wars és National Geographic alkotások.',
    defaultEnabled: false
  },
  {
    id: 'hu-stream-skyshowtime',
    name: '🟡 SkyShowtime Magyarország',
    type: 'movie',
    category: 'stream',
    description: 'Universal, Paramount és Showtime sikerfilmek magyar szinkronnal.',
    defaultEnabled: false
  },
  {
    id: 'hu-stream-appletv',
    name: '⚪ Apple TV+ Magyarország',
    type: 'movie',
    category: 'stream',
    description: 'Díjnyertes Apple Original filmek és sorozatok szinkronnal.',
    defaultEnabled: false
  },
  {
    id: 'hu-stream-prime',
    name: '🔷 Amazon Prime Video',
    type: 'movie',
    category: 'stream',
    description: 'Prime Video magyarországi legnézettebb alkotásai.',
    defaultEnabled: false
  }
];

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mafab.hu catalog URL mapping
const MAFAB_URLS = {
  'hu-trending-movies': 'https://www.mafab.hu/vod/top-streaming',
  'hu-cinema-movies': 'https://www.mafab.hu/cinema/premier/jelenleg-a-mozikban',
  'hu-hungarian-movies': 'https://www.mafab.hu/filmek/listak/legjobb-magyar-filmek',
  'hu-stream-netflix': 'https://www.mafab.hu/vod/top-streaming/netflix',
  'hu-stream-max': 'https://www.mafab.hu/vod/top-streaming/hbo',
  'hu-stream-disney': 'https://www.mafab.hu/vod/top-streaming/disney',
  'hu-stream-skyshowtime': 'https://www.mafab.hu/vod/top-streaming/skyshowtime',
  'hu-stream-appletv': 'https://www.mafab.hu/vod/top-streaming/appletv',
  'hu-stream-prime': 'https://www.mafab.hu/vod/top-streaming/amazon'
};

/**
 * Attempts to fetch live ranked titles directly from Mafab.hu
 * If Mafab has active Cloudflare Turnstile protection, gracefully returns null to trigger TMDB fallback.
 */
async function tryFetchMafabList(catalogId) {
  const url = MAFAB_URLS[catalogId];
  if (!url) return null;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'hu-HU,hu;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(2000)
    });

    if (res.ok) {
      const html = await res.text();
      if (!html.includes('cf-mitigated') && !html.includes('Just a moment')) {
        const matches = [...html.matchAll(/class=["'][^"']*text-bold[^"']*["'][^>]*>([^<]+)<\/a>/gi)];
        const titles = matches.map(m => m[1].trim()).filter(Boolean);
        if (titles.length >= 5) {
          return titles.slice(0, 20);
        }
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Resolves TMDB item ID to IMDb ID (tt...) for 100% Cinemeta and scraper compatibility.
 */
async function resolveImdbId(tmdbId, isSeries = false) {
  const cacheKey = `${isSeries ? 'tv' : 'movie'}:${tmdbId}`;
  if (imdbIdCache.has(cacheKey)) {
    return imdbIdCache.get(cacheKey);
  }

  try {
    const endpoint = isSeries ? `tv/${tmdbId}/external_ids` : `movie/${tmdbId}/external_ids`;
    const res = await fetch(`${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}`, {
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      const imdbId = data.imdb_id || null;
      imdbIdCache.set(cacheKey, imdbId);
      return imdbId;
    }
  } catch (e) {}

  return null;
}

/**
 * Enriches TMDB search or discover items with IMDb IDs in concurrent batches
 */
async function enrichTmdbItems(rawResults, isSeries = false) {
  if (!Array.isArray(rawResults)) return [];

  const promises = rawResults.map(async item => {
    const imdbId = await resolveImdbId(item.id, isSeries);
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';
    const background = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : poster;
    const title = item.title || item.name || item.original_title || item.original_name;

    return {
      id: imdbId || `tmdb:${item.id}`,
      type: isSeries ? 'series' : 'movie',
      name: title,
      poster,
      background,
      description: item.overview || '',
      releaseInfo: year,
      imdbRating: item.vote_average ? String(Math.round(item.vote_average * 10) / 10) : undefined
    };
  });

  return await Promise.all(promises);
}

/**
 * Fetches catalog items for a given catalog ID and options
 */
async function fetchCatalogItems(catalogId, type, { search = '', skip = 0 } = {}) {
  const isSeries = type === 'series' || catalogId.includes('series');
  const page = Math.floor(skip / 20) + 1;
  const cacheKey = `${catalogId}:${page}:${search || ''}`;

  if (catalogCache.has(cacheKey)) {
    const cached = catalogCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.items;
    }
  }

  let items = [];

  // 1. If page 1 and no search query, attempt to fetch live rankings from Mafab.hu
  if (page === 1 && !search) {
    try {
      const mafabTitles = await tryFetchMafabList(catalogId);
      if (Array.isArray(mafabTitles) && mafabTitles.length >= 5) {
        const candidateItems = [];
        for (const title of mafabTitles) {
          try {
            const sRes = await fetch(`${TMDB_BASE_URL}/search/${isSeries ? 'tv' : 'movie'}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=hu-HU`, {
              signal: AbortSignal.timeout(1500)
            }).then(r => r.json());
            if (sRes.results && sRes.results.length > 0) {
              candidateItems.push(sRes.results[0]);
            }
          } catch (e) {}
        }
        if (candidateItems.length >= 5) {
          items = await enrichTmdbItems(candidateItems, isSeries);
        }
      }
    } catch (e) {}
  }

  // 2. If Mafab is blocked by Cloudflare Turnstile or page > 1, use official TMDB catalog
  if (items.length === 0) {
    try {
      switch (catalogId) {
      case 'hu-trending-movies': {
        const url = `${TMDB_BASE_URL}/trending/movie/week?api_key=${TMDB_API_KEY}&language=hu-HU&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-trending-series': {
        const url = `${TMDB_BASE_URL}/trending/tv/week?api_key=${TMDB_API_KEY}&language=hu-HU&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], true);
        break;
      }

      case 'hu-cinema-movies': {
        const url = `${TMDB_BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&language=hu-HU&region=HU&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-hungarian-movies': {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=hu-HU&with_original_language=hu&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-hungarian-series': {
        const url = `${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=hu-HU&with_original_language=hu&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], true);
        break;
      }

      case 'hu-top-rated-movies': {
        const url = `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=hu-HU&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-stream-netflix': {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=hu-HU&watch_region=HU&with_watch_providers=8&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-stream-max': {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=hu-HU&watch_region=HU&with_watch_providers=1899&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-stream-disney': {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=hu-HU&watch_region=HU&with_watch_providers=337&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-stream-skyshowtime': {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=hu-HU&watch_region=HU&with_watch_providers=1773&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-stream-appletv': {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=hu-HU&watch_region=HU&with_watch_providers=350&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      case 'hu-stream-prime': {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=hu-HU&watch_region=HU&with_watch_providers=119&sort_by=popularity.desc&page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) }).then(r => r.json());
        items = await enrichTmdbItems(res.results || [], false);
        break;
      }

      default:
        items = [];
      }
    } catch (err) {
      console.warn(`[Catalogs] Error fetching catalog ${catalogId}:`, err.message);
    }
  }

  // Filter by search query if present
  if (search && search.trim()) {
    const qNorm = normalize(search);
    items = items.filter(item => 
      normalize(item.name).includes(qNorm) || 
      normalize(item.description || '').includes(qNorm)
    );
  }

  if (items.length > 0) {
    catalogCache.set(cacheKey, { items, timestamp: Date.now() });
  }

  return items;
}

/**
 * Returns the manifest catalogs filtered by user configuration
 */
function getEnabledManifestCatalogs(configuredCatalogIds = null) {
  let list = CATALOG_DEFINITIONS;

  if (Array.isArray(configuredCatalogIds) && configuredCatalogIds.length > 0) {
    const set = new Set(configuredCatalogIds.map(c => c.trim().toLowerCase()));
    list = CATALOG_DEFINITIONS.filter(def => set.has(def.id.toLowerCase()));
  } else {
    // Default enabled catalogs
    list = CATALOG_DEFINITIONS.filter(def => def.defaultEnabled);
  }

  return list.map(c => ({
    type: c.type,
    id: c.id,
    name: c.name,
    extra: [
      { name: 'search', isRequired: false },
      { name: 'skip', isRequired: false }
    ]
  }));
}

module.exports = {
  CATALOG_DEFINITIONS,
  fetchCatalogItems,
  getEnabledManifestCatalogs,
  resolveImdbId
};
