/**
 * Metadata resolver: fetches Cinemeta info and resolves localized Hungarian titles via Wikipedia / Wikidata.
 */

const metaCache = new Map();
let magyarNepmesekData = null;
try {
  magyarNepmesekData = require('../data/magyar_nepmesek_episodes.json');
} catch (e) {}

async function resolveHungarianTitle(englishTitle, imdbId) {
  if (!englishTitle) return '';

  // 1. Try Wikipedia langlinks (extremely fast & reliable, ~100ms)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(englishTitle.trim().replace(/ /g, '_'))}&lllang=hu&format=json`;
    const res = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0];
        const rawTitle = page?.langlinks?.[0]?.['*'];
        if (rawTitle) {
          // Clean "(film)", "(sorozat)", "(televíziós sorozat)", etc.
          return rawTitle.replace(/\s*\([^)]+\)\s*$/g, '').trim();
        }
      }
    }
  } catch (err) {
    // Continue to Wikidata fallback
  }

  // 2. Fallback to Wikidata by IMDb ID claim (P345)
  try {
    const sparql = `SELECT ?label WHERE {
      ?item wdt:P345 "${imdbId}" .
      ?item rdfs:label ?label .
      FILTER (LANG(?label) = "hu")
    } LIMIT 1`;
    const wikiUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetch(wikiUrl, {
      headers: {
        'User-Agent': 'NuvioHungarianAddon/1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const binding = data?.results?.bindings?.[0];
      if (binding && binding.label && binding.label.value) {
        return binding.label.value.trim();
      }
    }
  } catch (err) {
    // Return empty on failure
  }

  return '';
}

const TENKES_KAPITANYA_EPISODES = {
  1: 'A vérdíj',
  2: 'Az embervadászat',
  3: 'Buga Jakab',
  4: 'A tőzsér',
  5: 'A fejvadász',
  6: 'A katona szerencséje',
  7: 'Kettős kém',
  8: 'A kémszemle',
  9: 'A meglepetés',
  10: 'A vörös ördögök',
  11: 'A hadicsel',
  12: 'A fogoly',
  13: 'A vár ostroma'
};

const PRELOADED_HUNGARIAN_TITLES = {
  'tt0056789': { hu: 'A Tenkes kapitánya', en: 'Captain Tenkes', year: '1964', runtime: 25 },
  'tt0861751': { hu: 'Magyar népmesék', en: 'Hungarian Folk Tales', year: '1980', runtime: 10 },
  'tt0136650': { hu: 'Üzenet a jövőből - A Mézga család', en: 'The Mézga Family', year: '1969', runtime: 25 },
  'tt1225872': { hu: 'Vakáción a Mézga család', en: 'The Mézga Family on Holiday', year: '1978', runtime: 25 },
  'tt0167595': { hu: 'Frakk, a macskák réme', en: 'Frakk, the Cats\' Nightmare', year: '1971', runtime: 10 },
  'tt0168342': { hu: 'Kukori és Kotkoda', en: 'Kukori and Kotkoda', year: '1971', runtime: 10 },
  'tt0154077': { hu: 'A nagy ho-ho-horgász', en: 'The Great Ho-ho-ho-angler', year: '1982', runtime: 10 },
  'tt0166931': { hu: 'Pom-Pom meséi', en: 'Tales of Pom Pom', year: '1980', runtime: 10 },
  'tt0168343': { hu: 'Kérem a következőt! (Dr. Bubó)', en: 'Next, Please!', year: '1974', runtime: 10 },
  'tt0179955': { hu: 'Macskafogó', en: 'Cat City', year: '1986', runtime: 96 },
  'tt0257290': { hu: 'Üvegtigris', en: 'Glass Tiger', year: '2001', runtime: 104 },
  'tt0065067': { hu: 'A tanú', en: 'The Witness', year: '1969', runtime: 103 },
  'tt0121403': { hu: 'Indul a bakterház', en: 'The Station Master', year: '1980', runtime: 66 },
  'tt0303184': { hu: 'Valami Amerika', en: 'A Kind of America', year: '2002', runtime: 115 },
  'tt0069697': { hu: 'Különben dühbe jövünk', en: 'Watch Out, We\'re Mad', year: '1974', runtime: 102 },
  'tt0085327': { hu: 'Kincs, ami nincs', en: 'Who Finds a Friend Finds a Treasure', year: '1981', runtime: 102 },
  'tt0131636': { hu: 'Vuk', en: 'The Little Fox', year: '1981', runtime: 76 },
  'tt8111088': { hu: 'A Mandalóri', en: 'The Mandalorian', year: '2019', runtime: 40 },
  'tt0268380': { hu: 'Jégkorszak', en: 'Ice Age', year: '2002', runtime: 81 },
  'tt0060196': { hu: 'A Jó, a Rossz és a Csúf', en: 'The Good, the Bad and the Ugly', year: '1966', runtime: 161 },
  'tt0848228': { hu: 'Bosszúállók', en: 'The Avengers', year: '2012', runtime: 143 }
};

async function getMediaMeta(type, id) {
  // id can be tt1234567 or tt1234567:1:1
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1] ? parseInt(parts[1], 10) : null;
  const episode = parts[2] ? parseInt(parts[2], 10) : null;

  const cacheKey = `${type}:${imdbId}`;
  if (metaCache.has(cacheKey)) {
    const cached = metaCache.get(cacheKey);
    let episodeTitle = cached.episodeTitle || '';
    if (imdbId === 'tt0861751' && season && episode && magyarNepmesekData) {
      const sEpisodes = magyarNepmesekData[season] || [];
      const matched = sEpisodes.find(item => item.ep === episode);
      if (matched && matched.title) episodeTitle = matched.title;
    } else if (imdbId === 'tt0056789' && episode && TENKES_KAPITANYA_EPISODES[episode]) {
      episodeTitle = TENKES_KAPITANYA_EPISODES[episode];
    }
    return { ...cached, season, episode, episodeTitle };
  }

  // Fast-path: Check static pre-loaded dictionary
  const preloaded = PRELOADED_HUNGARIAN_TITLES[imdbId];
  if (preloaded) {
    let episodeTitle = '';
    if (imdbId === 'tt0861751' && season && episode && magyarNepmesekData) {
      const sEpisodes = magyarNepmesekData[season] || [];
      const matched = sEpisodes.find(item => item.ep === episode);
      if (matched && matched.title) episodeTitle = matched.title;
    } else if (imdbId === 'tt0056789' && episode && TENKES_KAPITANYA_EPISODES[episode]) {
      episodeTitle = TENKES_KAPITANYA_EPISODES[episode];
    }

    const result = {
      imdbId,
      type,
      englishTitle: preloaded.en,
      hungarianTitle: preloaded.hu,
      year: preloaded.year,
      runtimeMinutes: preloaded.runtime,
      season,
      episode,
      episodeTitle
    };
    metaCache.set(cacheKey, result);
    return result;
  }

  let englishTitle = '';
  let year = '';
  let runtimeMinutes = null;

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
        if (data.meta.runtime) {
          const rMatch = data.meta.runtime.toString().match(/(\d+)/);
          if (rMatch) {
            runtimeMinutes = parseInt(rMatch[1], 10);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Meta] Cinemeta fetch failed for ${imdbId}:`, err.message);
  }

  // 2. Resolve Hungarian title
  const huTitle = await resolveHungarianTitle(englishTitle, imdbId);

  let episodeTitle = '';
  if (imdbId === 'tt0861751' && season && episode && magyarNepmesekData) {
    const sEpisodes = magyarNepmesekData[season] || [];
    const matched = sEpisodes.find(item => item.ep === episode);
    if (matched && matched.title) {
      episodeTitle = matched.title;
    }
  }

  const result = {
    imdbId,
    type,
    englishTitle,
    hungarianTitle: huTitle || englishTitle,
    year,
    runtimeMinutes,
    season,
    episode,
    episodeTitle
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
      if (meta.episodeTitle) {
        queries.add(`${hu} ${meta.episodeTitle}`);
        queries.add(`${meta.episodeTitle}`);
        queries.add(`${hu} - ${meta.episodeTitle}`);
      }
      queries.add(`${hu} S${sPad}E${ePad}`);
      queries.add(`${hu} ${s}x${e}`);
      queries.add(`${hu} ${s}x${ePad}`);
      queries.add(`${hu} ${s}. evad ${e}. resz`);
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
      queries.add(`${hu} teljes film`);
      if (year) queries.add(`${hu} ${year}`);
      queries.add(`${hu} teljes film magyarul`);
      queries.add(hu);
    }
    if (en && en !== hu) {
      queries.add(`${en} teljes film`);
      if (year) queries.add(`${en} ${year}`);
      queries.add(en);
    }
  }

  return Array.from(queries);
}

const seriesEpisodesCache = new Map();

async function getSeriesEpisodes(imdbId) {
  if (!imdbId) return null;
  const cleanId = imdbId.split(':')[0];
  if (seriesEpisodesCache.has(cleanId)) {
    return seriesEpisodesCache.get(cleanId);
  }

  try {
    const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/series/${cleanId}.json`;
    const res = await fetch(cinemetaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !data.meta) return null;

    const huTitle = await resolveHungarianTitle(data.meta.name, cleanId);

    // Group videos by season
    const videos = data.meta.videos || [];
    const seasonsMap = {};
    for (const v of videos) {
      const sNum = v.season != null ? v.season : 1;
      if (!seasonsMap[sNum]) {
        seasonsMap[sNum] = [];
      }
      seasonsMap[sNum].push({
        id: v.id || `${cleanId}:${sNum}:${v.episode || v.number}`,
        season: sNum,
        episode: v.episode != null ? v.episode : v.number,
        name: v.name || `${v.episode || v.number}. rész`,
        overview: v.overview || v.description || '',
        thumbnail: v.thumbnail || ''
      });
    }

    // Sort episodes within each season & enrich with Magyar népmesék canonical titles
    for (const sNum of Object.keys(seasonsMap)) {
      seasonsMap[sNum].sort((a, b) => a.episode - b.episode);

      if (cleanId === 'tt0861751' && magyarNepmesekData && magyarNepmesekData[sNum]) {
        const sEpisodes = magyarNepmesekData[sNum] || [];
        seasonsMap[sNum].forEach(ep => {
          const matched = sEpisodes.find(item => item.ep === ep.episode);
          if (matched && matched.title) {
            ep.name = matched.title;
          }
        });
      }
    }

    const result = {
      id: cleanId,
      name: huTitle || data.meta.name,
      englishName: data.meta.name,
      year: data.meta.year,
      poster: data.meta.poster,
      background: data.meta.background,
      description: data.meta.description,
      genres: data.meta.genres || [],
      seasons: seasonsMap
    };

    seriesEpisodesCache.set(cleanId, result);
    return result;
  } catch (err) {
    console.warn(`[Meta] getSeriesEpisodes failed for ${cleanId}:`, err.message);
    return null;
  }
}

module.exports = {
  getMediaMeta,
  generateSearchQueries,
  getSeriesEpisodes
};
