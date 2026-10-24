/**
 * Metadata resolver: fetches Cinemeta info and resolves localized Hungarian titles via Wikidata.
 */

const metaCache = new Map();

async function getMediaMeta(type, id) {
  // id can be tt1234567 or tt1234567:1:1
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1] ? parseInt(parts[1], 10) : null;
  const episode = parts[2] ? parseInt(parts[2], 10) : null;

  const cacheKey = `${type}:${imdbId}`;
  if (metaCache.has(cacheKey)) {
    const cached = metaCache.get(cacheKey);
    return { ...cached, season, episode };
  }

  let englishTitle = '';
  let year = '';

  // 1. Fetch Cinemeta metadata
  try {
    const cinemetaType = type === 'series' || type === 'tv' ? 'series' : 'movie';
    const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/${cinemetaType}/${imdbId}.json`;
    const res = await fetch(cinemetaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.meta) {
        englishTitle = data.meta.name || '';
        year = (data.meta.year || '').toString().slice(0, 4);
      }
    }
  } catch (err) {
    console.warn(`[Meta] Cinemeta fetch failed for ${imdbId}:`, err.message);
  }

  // 2. Fetch Hungarian title from Wikidata
  let hungarianTitle = '';
  try {
    const sparql = `SELECT ?label WHERE {
      ?item wdt:P345 "${imdbId}" .
      ?item rdfs:label ?label .
      FILTER (LANG(?label) = "hu")
    } LIMIT 1`;
    const wikiUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetch(wikiUrl, {
      headers: {
        'User-Agent': 'NuvioHungarianAddon/1.0 (https://github.com/nuvio-hungarian-addon)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const binding = data?.results?.bindings?.[0];
      if (binding && binding.label && binding.label.value) {
        hungarianTitle = binding.label.value.trim();
      }
    }
  } catch (err) {
    console.warn(`[Meta] Wikidata fetch failed for ${imdbId}:`, err.message);
  }

  const result = {
    imdbId,
    type,
    englishTitle,
    hungarianTitle: hungarianTitle || englishTitle,
    year,
    season,
    episode
  };

  metaCache.set(cacheKey, result);
  return result;
}

/**
 * Generate search queries tailored for Hungarian streaming platforms.
 */
function generateSearchQueries(meta) {
  const queries = new Set();
  const hu = meta.hungarianTitle;
  const en = meta.englishTitle;
  const year = meta.year;
  const s = meta.season;
  const e = meta.episode;

  if (meta.season && meta.episode) {
    const sPad = String(s).padStart(2, '0');
    const ePad = String(e).padStart(2, '0');

    if (hu) {
      queries.add(`${hu} S${sPad}E${ePad}`);
      queries.add(`${hu} ${s}x${e}`);
      queries.add(`${hu} ${s}x${ePad}`);
      queries.add(`${hu} ${s}. evad ${e}. resz`);
      queries.add(`${hu} ${s}. fejezet`);
      queries.add(`${hu} ${e}. resz`);
      queries.add(`${hu}`);
    }
    if (en && en !== hu) {
      queries.add(`${en} S${sPad}E${ePad}`);
      queries.add(`${en} ${s}x${e}`);
      queries.add(`${en}`);
    }
  } else {
    // Movies
    if (hu) {
      queries.add(hu);
      if (year) queries.add(`${hu} ${year}`);
    }
    if (en && en !== hu) {
      queries.add(en);
      if (year) queries.add(`${en} ${year}`);
    }
  }

  return Array.from(queries);
}

module.exports = {
  getMediaMeta,
  generateSearchQueries
};
