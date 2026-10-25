/**
 * Hungarian Catalog & Search Engine for Nuvio & Stremio
 * Enables direct searching and browsing for Hungarian titles (e.g. "Magyar népmesék", "Bosszúállók").
 */

const { getMediaMeta } = require('./utils/meta');

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Popular curated Hungarian catalog items for browsing
const FEATURED_HUNGARIAN_SERIES = [
  { id: 'tt0861751', name: 'Magyar népmesék', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0861751/img', year: '1980–2012', description: 'Klasszikus magyar népmesék animációs sorozat.' },
  { id: 'tt8111088', name: 'A Mandalóri (The Mandalorian)', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt8111088/img', year: '2019–', description: 'Star Wars élőszereplős sorozat magyar szinkronnal.' },
  { id: 'tt0144062', name: 'A Tenkes kapitánya', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0144062/img', year: '1964', description: 'Történelmi kalandfilmsorozat a kuruc korból.' },
  { id: 'tt0138982', name: 'Mézga család', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0138982/img', year: '1969', description: 'Klasszikus magyar rajzfilmsorozat.' }
];

const FEATURED_HUNGARIAN_MOVIES = [
  { id: 'tt0268380', name: 'Jégkorszak (Ice Age)', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0268380/img', year: '2002', description: 'Jégkorszak animációs film magyar szinkronnal.' },
  { id: 'tt0060196', name: 'A Jó, a Rossz és a Csúf', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0060196/img', year: '1966', description: 'Klasszikus spagettiwestern magyar szinkronnal.' },
  { id: 'tt0848228', name: 'Bosszúállók (The Avengers)', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0848228/img', year: '2012', description: 'Marvel Bosszúállók magyar szinkronnal.' },
  { id: 'tt0362758', name: 'Indul a bakterház', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0362758/img', year: '1980', description: 'Klasszikus magyar vígjáték.' }
];

const actorFilmographyCache = new Map();

/**
 * Searches filmography when user queries an actor or person name (e.g. "Bud Spencer", "Terence Hill").
 * Resolves Wikidata entity and fetches all starring movies with Hungarian titles.
 */
async function searchActorFilmography(query) {
  if (!query || query.length < 3) return [];
  const clean = query.trim().toLowerCase();
  if (actorFilmographyCache.has(clean)) {
    return actorFilmographyCache.get(clean);
  }

  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=hu&type=item&format=json`;
    const sRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(2500)
    });
    if (!sRes.ok) return [];

    const sData = await sRes.json();
    const searchList = sData.search || [];
    if (searchList.length === 0) return [];

    const actorEntity = searchList.find(item => {
      const desc = (item.description || '').toLowerCase();
      return desc.includes('actor') || desc.includes('színész') || desc.includes('szinesz') || desc.includes('actress') || desc.includes('film');
    }) || searchList[0];

    const desc = (actorEntity.description || '').toLowerCase();
    const isPerson = desc.includes('actor') || desc.includes('színész') || desc.includes('szinesz') || desc.includes('actress') || desc.includes('film') || desc.includes('director') || desc.includes('producer');
    if (!isPerson && searchList.length > 3) {
      return [];
    }

    const qId = actorEntity.id;

    const sparql = `SELECT DISTINCT ?item ?itemLabel ?imdbId ?year WHERE {
      ?item wdt:P161 wd:${qId} .
      ?item wdt:P345 ?imdbId .
      OPTIONAL { ?item wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "hu,en". }
    } ORDER BY DESC(?year) LIMIT 35`;

    const qUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const qRes = await fetch(qUrl, {
      headers: {
        'User-Agent': 'NuvioHungarianAddon/1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(3500)
    });

    if (!qRes.ok) return [];
    const qData = await qRes.json();
    const bindings = qData.results?.bindings || [];

    const movies = [];
    const seen = new Set();
    for (const b of bindings) {
      const imdbId = b.imdbId?.value;
      if (!imdbId || seen.has(imdbId)) continue;
      seen.add(imdbId);

      const title = b.itemLabel?.value || '';
      const year = b.year?.value || '';

      movies.push({
        id: imdbId,
        type: 'movie',
        name: title,
        poster: `https://images.metahub.space/poster/medium/${imdbId}/img`,
        year,
        description: `${actorEntity.label || query} filmje (${year})`
      });
    }

    actorFilmographyCache.set(clean, movies);
    return movies;
  } catch (err) {
    return [];
  }
}

async function searchCatalog(type, query) {
  if (!query) {
    return type === 'series' ? FEATURED_HUNGARIAN_SERIES : FEATURED_HUNGARIAN_MOVIES;
  }

  const results = [];
  const seenIds = new Set();
  const cleanQuery = query.trim();

  // Check if query is an actor name (e.g. Bud Spencer, Terence Hill)
  if (!type || type === 'movie') {
    try {
      const actorMovies = await searchActorFilmography(cleanQuery);
      for (const m of actorMovies) {
        if (!seenIds.has(m.id)) {
          seenIds.add(m.id);
          results.push(m);
        }
      }
    } catch (e) {}
  }

  // 1. First search JobbMintATV (Hungarian titles & aliases map directly to IMDb)
  try {
    const jobbUrl = `https://jobbmintatv.org/ajax.php?keres=${encodeURIComponent(normalize(cleanQuery))}`;
    const jRes = await fetch(jobbUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3500)
    });
    if (jRes.ok) {
      const buf = await jRes.arrayBuffer();
      let html = '';
      try {
        html = new TextDecoder('iso-8859-2').decode(buf);
      } catch (e) {
        html = new TextDecoder('utf-8').decode(buf);
      }

      const links = [...html.matchAll(/<a href=["']([^"']+)["'][^>]*><div[^>]*>([^<]+)<\/div><\/a>/gi)].map(m => ({
        url: m[1].startsWith('//') ? 'https:' + m[1] : m[1],
        title: m[2].trim()
      }));

      for (const item of links.slice(0, 6)) {
        try {
          const pageRes = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) });
          if (pageRes.ok) {
            const pHtml = await pageRes.text();
            const imdbMatch = pHtml.match(/imdb\.com\/title\/(tt\d+)/i) || pHtml.match(/\[imdb:(tt\d+)\]/i);
            const imdbId = imdbMatch ? imdbMatch[1] : null;

            if (imdbId && !seenIds.has(imdbId)) {
              seenIds.add(imdbId);
              
              let poster = `https://images.metahub.space/poster/medium/${imdbId}/img`;
              let year = '';
              let desc = `Magyar cím: ${item.title}`;
              let englishName = '';
              let realType = type; // default to requested type

              // Detect true type by querying Cinemeta with movie or series
              try {
                let cRes = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, { signal: AbortSignal.timeout(2000) });
                if (!cRes.ok) {
                  const altType = type === 'series' ? 'movie' : 'series';
                  cRes = await fetch(`https://v3-cinemeta.strem.io/meta/${altType}/${imdbId}.json`, { signal: AbortSignal.timeout(2000) });
                }
                if (cRes.ok) {
                  const cData = await cRes.json();
                  const meta = cData?.meta;
                  if (meta) {
                    if (meta.poster) poster = meta.poster;
                    if (meta.year) year = meta.year;
                    if (meta.description) desc = meta.description;
                    englishName = meta.name;
                    if (meta.type) realType = meta.type;
                  }
                }
              } catch (e) {}

              // If caller specifically requested 'movie' or 'series', filter out mismatches
              if (type && realType && realType !== type) {
                continue;
              }

              const displayName = englishName && englishName.toLowerCase() !== item.title.toLowerCase()
                ? `${item.title} (${englishName})`
                : item.title;

              results.push({
                id: imdbId,
                type: realType,
                name: displayName,
                poster,
                year,
                description: desc
              });
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    // Continue
  }

  // 2. Search Cinemeta directly for English titles & global catalog
  try {
    const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(cleanQuery)}.json`;
    const res = await fetch(cinemetaUrl, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = await res.json();
      for (const item of data.metas || []) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          const itemType = item.type || type;
          if (type && itemType !== type) continue;
          results.push({
            id: item.id,
            type: itemType,
            name: item.name,
            poster: item.poster,
            year: item.year,
            description: item.description
          });
        }
      }
    }
  } catch (e) {
    // Continue
  }

  return results;
}

async function getMeta(type, id) {
  if (!id) return null;

  // If standard IMDb id, fetch from Cinemeta and decorate with Hungarian title
  if (id.startsWith('tt')) {
    try {
      let res = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`, {
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) {
        const altType = type === 'series' ? 'movie' : 'series';
        res = await fetch(`https://v3-cinemeta.strem.io/meta/${altType}/${id}.json`, {
          signal: AbortSignal.timeout(3500)
        });
      }
      if (res.ok) {
        const data = await res.json();
        if (data && data.meta) {
          const huMeta = await getMediaMeta(data.meta.type || type, id);
          if (huMeta && huMeta.hungarianTitle && huMeta.hungarianTitle !== data.meta.name) {
            data.meta.name = `${huMeta.hungarianTitle} (${data.meta.name})`;
          }
          return data;
        }
      }
    } catch (err) {
      // Fallback
    }
  }

  return null;
}

module.exports = {
  searchCatalog,
  getMeta
};
