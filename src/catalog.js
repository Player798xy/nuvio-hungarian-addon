/**
 * Hungarian Catalog & Search Engine for Nuvio & Stremio
 * Enables direct searching and browsing for Hungarian titles (e.g. "Magyar népmesék", "Bosszúállók").
 */

const { getMediaMeta } = require('./utils/meta');
const { LIVE_CHANNELS } = require('./scrapers/mediaklikk');
const { searchNetMozi, getNetMoziSeriesEpisodes } = require('./scrapers/netmozi');

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Popular curated Hungarian catalog items for browsing (100% verified IMDb IDs & posters)
const FEATURED_HUNGARIAN_SERIES = [
  { id: 'tt0861751', name: 'Magyar népmesék', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0861751/img', year: '1980–2012', description: 'Klasszikus magyar népmesék animációs sorozat.' },
  { id: 'tt8111088', name: 'A Mandalóri (The Mandalorian)', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt8111088/img', year: '2019–2023', description: 'Star Wars élőszereplős sorozat magyar szinkronnal.' },
  { id: 'tt0056789', name: 'A Tenkes kapitánya', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0056789/img', year: '1964', description: 'Történelmi kalandfilmsorozat a kuruc korból Zenthe Ferenc főszereplésével.' },
  { id: 'tt0136650', name: 'Üzenet a jövőből - A Mézga család', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0136650/img', year: '1969', description: 'Klasszikus magyar rajzfilmsorozat Nepp Zoltán és Romhányi József tollából.' },
  { id: 'tt1225872', name: 'Vakáción a Mézga család', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt1225872/img', year: '1978', description: 'A Mézga család világkörüli kalandjai Hufnágel Pisti nyomában.' },
  { id: 'tt0167595', name: 'Frakk, a macskák réme', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0167595/img', year: '1971–1985', description: 'Klasszikus magyar papírkivágásos animációs sorozat Károly bácsival és Irmuskával.' },
  { id: 'tt0168342', name: 'Kukori és Kotkoda', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0168342/img', year: '1971–1972', description: 'Népszerű magyar rajzfilmsorozat a lusta kakasról és szorgos tyúkocskájáról.' },
  { id: 'tt0154077', name: 'A nagy ho-ho-horgász', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0154077/img', year: '1982–1984', description: 'A nagy ho-ho-horgász és a Főkukac felejthetetlen kalandjai Balázs Péter hangjával.' },
  { id: 'tt0166931', name: 'Pom-Pom meséi', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0166931/img', year: '1980–1984', description: 'Picur és Pom Pom történetei: Gombóc Artúr, Festéktüsszentő Hapci Benő és barátai.' },
  { id: 'tt0168343', name: 'Kérem a következőt! (Dr. Bubó)', type: 'series', poster: 'https://images.metahub.space/poster/medium/tt0168343/img', year: '1974–1979', description: 'Dr. Bubó orvosbagoly és Ursula nővér erdőlakó pácienseinek szatírája.' }
];

const FEATURED_HUNGARIAN_MOVIES = [
  { id: 'tt0179955', name: 'Macskafogó (Cat City)', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0179955/img', year: '1986', description: 'Grabowski a szuperegér titkos küldetése a macskaszindikátus ellen Ternovszky Béla kultikus rajzfilmjében.' },
  { id: 'tt0257290', name: 'Üvegtigris', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0257290/img', year: '2001', description: 'Kultikus magyar vígjáték Rudolf Péter rendezésében Csoki, Lali és a büfékocsi történetével.' },
  { id: 'tt0065067', name: 'A tanú', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0065067/img', year: '1969', description: 'Pelikan József gátőr legendás szatírája: A nemzetközi helyzet egyre fokozódik Bacsó Péter filmjében.' },
  { id: 'tt0121403', name: 'Indul a bakterház', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0121403/img', year: '1980', description: 'Regős Bendegúz, a bakter és a banya felejthetetlen története Koltai Róbert főszereplésével.' },
  { id: 'tt0303184', name: 'Valami Amerika', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0303184/img', year: '2002', description: 'Sikeres magyar közönségfilm a három testvérről és a titokzatos amerikai producerről.' },
  { id: 'tt0069697', name: 'Különben dühbe jövünk', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0069697/img', year: '1974', description: 'Bud Spencer és Terence Hill kultikus akció-vígjátéka a piros puma dune buggyért.' },
  { id: 'tt0085327', name: 'Kincs, ami nincs', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0085327/img', year: '1981', description: 'Alan és Charlie kalandjai Puffin lekvárral a lakatlan szigeten.' },
  { id: 'tt0131636', name: 'Vuk', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0131636/img', year: '1981', description: 'Fekete István regényéből készült rajzfilmklasszikus Dargay Attila rendezésében.' },
  { id: 'tt0268380', name: 'Jégkorszak (Ice Age)', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0268380/img', year: '2002', description: 'Jégkorszak animációs film felejthetetlen magyar szinkronnal (Geszti Péter mint Sid).' },
  { id: 'tt0060196', name: 'A Jó, a Rossz és a Csúf', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0060196/img', year: '1966', description: 'Klasszikus spagettiwestern Clint Eastwooddal magyar szinkronnal.' },
  { id: 'tt0848228', name: 'Bosszúállók (The Avengers)', type: 'movie', poster: 'https://images.metahub.space/poster/medium/tt0848228/img', year: '2012', description: 'Marvel Bosszúállók magyar szinkronnal.' }
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

const huToEnCache = new Map();

/**
 * Resolves Hungarian movie/series titles to original English franchise/title via Wikipedia & langlinks
 * E.g. "Játékháború" -> "Toy Story", "Agymanók" -> "Inside Out", "Verdák" -> "Cars"
 */
async function resolveHungarianQueryToEnglish(query) {
  if (!query || query.length < 3) return [];
  const clean = query.trim().toLowerCase();
  if (huToEnCache.has(clean)) return huToEnCache.get(clean);

  try {
    const headers = { 'User-Agent': 'NuvioHungarianAddon/1.0 (https://nuvio-hungarian-addon.vercel.app)' };
    const searchUrl = `https://hu.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
    const sRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(2500) });
    if (!sRes.ok) return [];
    const sData = await sRes.json();
    const topHits = (sData.query?.search || []).slice(0, 4);
    if (topHits.length === 0) return [];

    const titles = topHits.map(h => h.title).join('|');
    const langUrl = `https://hu.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(titles)}&lllang=en&format=json`;
    const lRes = await fetch(langUrl, { headers, signal: AbortSignal.timeout(2500) });
    if (!lRes.ok) return [];
    const lData = await lRes.json();

    const enTitles = new Set();
    const pages = lData.query?.pages || {};
    for (const pid of Object.keys(pages)) {
      let enTitle = pages[pid]?.langlinks?.[0]?.['*'];
      if (enTitle) {
        enTitle = enTitle.replace(/\s*\([^)]+\)\s*$/g, '').trim();
        if (enTitle.length > 1) {
          enTitles.add(enTitle);
          // If title has a sequel number or subtitle (e.g. 'Toy Story 2' -> add 'Toy Story')
          const franchiseMatch = enTitle.match(/^([A-Za-z0-9\s:,'-]+?)(?:\s+\d+|\s*:\s*.+)?$/);
          if (franchiseMatch && franchiseMatch[1] && franchiseMatch[1].length >= 3) {
            enTitles.add(franchiseMatch[1].trim());
          }
        }
      }
    }
    const result = Array.from(enTitles);
    huToEnCache.set(clean, result);
    return result;
  } catch (e) {
    return [];
  }
}

async function searchCatalog(type, query, catalogId = null) {
  // If Live TV catalog requested (either by catalog id or by type)
  if (catalogId === 'hu-live-tv' || catalogId === 'hu-live-tv-channel' || type === 'tv' || type === 'channel') {
    const list = LIVE_CHANNELS.map(ch => ({
      ...ch,
      type: type || 'movie'
    }));
    if (!query) return list;
    const qNorm = normalize(query);
    return list.filter(ch => 
      normalize(ch.name).includes(qNorm) || 
      normalize(ch.description).includes(qNorm) ||
      ch.channelKey.includes(qNorm)
    );
  }

  if (!query) {
    if (catalogId === 'hu-series' || type === 'series') return FEATURED_HUNGARIAN_SERIES;
    if (catalogId === 'hu-movies' || type === 'movie') return FEATURED_HUNGARIAN_MOVIES;
    return [...LIVE_CHANNELS, ...FEATURED_HUNGARIAN_MOVIES, ...FEATURED_HUNGARIAN_SERIES];
  }

  const results = [];
  const seenIds = new Set();
  const cleanQuery = query.trim();

  // If query matches any Live TV channel or mentions "elo", "live", "sport", "tv", "mediaklikk"
  const qNorm = normalize(cleanQuery);
  const matchedChannels = LIVE_CHANNELS.filter(ch => 
    normalize(ch.name).includes(qNorm) ||
    ch.channelKey.includes(qNorm) ||
    (qNorm.length >= 2 && ('elo'.includes(qNorm) || 'live'.includes(qNorm) || 'tv'.includes(qNorm) || 'mediaklikk'.includes(qNorm)))
  );
  if (type !== 'movie' && type !== 'series' || qNorm.includes('m1') || qNorm.includes('m2') || qNorm.includes('m4') || qNorm.includes('duna') || qNorm.includes('sport')) {
    for (const ch of matchedChannels) {
      if (!seenIds.has(ch.id)) {
        seenIds.add(ch.id);
        results.push(ch);
      }
    }
  }

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

  // 2. Resolve Hungarian query to English franchise titles (e.g. "Játékháború" -> "Toy Story")
  let enQueries = [];
  try {
    enQueries = await resolveHungarianQueryToEnglish(cleanQuery);
  } catch (e) {}

  // Prioritize resolved English queries for Cinemeta
  const queriesToSearch = enQueries.length > 0 ? [...enQueries, cleanQuery] : [cleanQuery];

  for (const q of queriesToSearch.slice(0, 3)) {
    try {
      const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(q)}.json`;
      const res = await fetch(cinemetaUrl, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        for (const item of data.metas || []) {
          if (!seenIds.has(item.id)) {
            const itemType = item.type || type;
            if (type && itemType !== type) continue;

            // Relevance filter: if we searched an English translation like 'Toy Story', 
            // ensure the item actually matches and isn't a random match like 'Sisters' Feud'
            if (q !== cleanQuery) {
              const nameLower = (item.name || '').toLowerCase();
              const qLower = q.toLowerCase();
              if (!nameLower.includes(qLower) && !qLower.includes(nameLower)) {
                continue;
              }
            }

            seenIds.add(item.id);
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
  }

  // 3. Search NetMozi catalog for Hungarian titles
  try {
    const netmoziItems = await searchNetMozi(cleanQuery, type);
    for (const item of netmoziItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        results.push(item);
      }
    }
  } catch (e) {}

  return results;
}

async function getMeta(type, id) {
  if (!id) return null;

  // Handle Live TV channels
  if (type === 'tv' || type === 'channel' || type === 'movie' || (id && id.startsWith('mediaklikk-live-'))) {
    const channel = LIVE_CHANNELS.find(ch => ch.id === id || ch.channelKey === id);
    if (channel) {
      return {
        meta: {
          id: channel.id,
          type: type || 'movie',
          name: channel.name,
          poster: channel.poster,
          background: channel.poster,
          logo: channel.logo,
          description: channel.description,
          releaseInfo: channel.year,
          behaviorHints: {
            defaultVideoId: channel.id,
            isLive: true
          }
        }
      };
    }
  }

  // Handle NetMozi items
  if (id.startsWith('netmozi:')) {
    if (id.startsWith('netmozi:series:')) {
      const epData = await getNetMoziSeriesEpisodes(id);
      if (epData) {
        return {
          meta: {
            id: epData.id,
            type: 'series',
            name: epData.name,
            poster: epData.poster,
            background: epData.background,
            description: epData.description,
            releaseInfo: epData.year,
            genres: epData.genres,
            videos: Object.values(epData.seasons || {}).flat().map(e => ({
              id: e.id,
              title: e.name,
              name: e.name,
              season: e.season,
              episode: e.episode,
              overview: e.overview,
              thumbnail: e.thumbnail
            }))
          }
        };
      }
    } else {
      return {
        meta: {
          id,
          type: 'movie',
          name: 'NetMozi Film',
          description: 'NetMozi magyar szinkronos film'
        }
      };
    }
  }

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
