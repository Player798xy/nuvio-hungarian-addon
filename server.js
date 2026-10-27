/**
 * Express Server for Nuvio & Stremio Addon
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getManifest, getStreams, searchCatalog, getMeta, ALL_SCRAPERS } = require('./src/addon');
const { getSeriesEpisodes } = require('./src/utils/meta');
const { getReorderedMasterPlaylist, getLiveHlsStream } = require('./src/scrapers/mediaklikk');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(express.json());

// Helper to parse configuration string or query params
function parseConfig(configStr, query = {}) {
  const config = {
    sources: [],
    onlyHD: false,
    resolutions: []
  };

  if (query.sources) {
    config.sources = query.sources.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  }
  if (query.onlyHD === 'true' || query.onlyHD === '1') {
    config.onlyHD = true;
  }
  if (query.resolutions) {
    config.resolutions = query.resolutions.split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
  }
  if (query.stage) {
    config.stage = query.stage.trim().toLowerCase();
  }
  if (query.timeout) {
    const t = parseInt(query.timeout, 10);
    config.timeoutMs = t <= 60 ? t * 1000 : t; // support both seconds and ms
  }

  if (!configStr) return config;

  // 1. Check if base64 encoded JSON
  try {
    const decoded = Buffer.from(configStr, 'base64').toString('utf-8');
    if (decoded.startsWith('{') && decoded.endsWith('}')) {
      const obj = JSON.parse(decoded);
      if (Array.isArray(obj.sources)) config.sources = obj.sources;
      if (obj.onlyHD) config.onlyHD = true;
      if (Array.isArray(obj.resolutions)) config.resolutions = obj.resolutions;
      if (obj.timeout) {
        const t = parseInt(obj.timeout, 10);
        config.timeoutMs = t <= 60 ? t * 1000 : t;
      }
      return config;
    }
  } catch (e) {}

  // 2. Parse key=value or key:value format separated by | or & or ;
  const parts = decodeURIComponent(configStr).split(/[|&;]/);
  for (const part of parts) {
    const [rawKey, rawVal] = part.split(/[=:]/);
    if (!rawKey || !rawVal) continue;
    const key = rawKey.trim().toLowerCase();
    const val = rawVal.trim();
    if (key === 'sources') {
      config.sources = val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    } else if (key === 'onlyhd' || key === 'hd') {
      config.onlyHD = val === 'true' || val === '1';
    } else if (key === 'resolutions' || key === 'res') {
      config.resolutions = val.split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
    } else if (key === 'timeout') {
      const t = parseInt(val, 10);
      config.timeoutMs = t <= 60 ? t * 1000 : t;
    }
  }

  // 3. Fallback: comma-separated list of valid scraper IDs directly
  if (config.sources.length === 0 && configStr.includes(',')) {
    const valid = ALL_SCRAPERS.map(s => s.id);
    const candidateList = configStr.split(',').map(s => s.trim().toLowerCase());
    const matched = candidateList.filter(id => valid.includes(id));
    if (matched.length > 0) {
      config.sources = matched;
    }
  }

  return config;
}

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0].trim();
    if (first) return first;
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || null;
}

// Serve static UI assets
app.use(express.static(path.join(__dirname, 'public')));

// Serve branding logos explicitly
app.get(['/logo.png', '/icon.png', '/logo.svg'], (req, res) => {
  const filename = path.basename(req.path);
  const filePath = path.join(__dirname, 'public', filename);
  res.sendFile(filePath);
});

// Stremio / Nuvio Manifest Endpoint (supports /manifest.json and /:config/manifest.json)
app.get(['/manifest.json', '/:config/manifest.json'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

  const config = parseConfig(req.params.config, req.query);
  const host = req.get('host') || 'nuvio-hungarian-addon.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  config.hostUrl = `${proto}://${host}`;
  res.json(getManifest(config));
});

// Stremio / Nuvio Catalog Endpoint
app.get([
  '/catalog/:type/:id.json',
  '/catalog/:type/:id/:extra.json',
  '/:config/catalog/:type/:id.json',
  '/:config/catalog/:type/:id/:extra.json'
], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  const { type, id, extra } = req.params;
  let search = req.query.search;
  let skip = parseInt(req.query.skip || '0', 10);

  if (extra) {
    const pairs = extra.split('&');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        const key = pair.slice(0, idx);
        const val = decodeURIComponent(pair.slice(idx + 1));
        if (key === 'search') search = val;
        if (key === 'skip') skip = parseInt(val, 10);
      }
    }
  }

  try {
    const metas = await searchCatalog(type, search, id);
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({ metas: metas || [] });
  } catch (err) {
    console.error(`[Server] Error processing catalog for ${type}/${id}:`, err);
    res.json({ metas: [] });
  }
});

// Stremio / Nuvio Meta Endpoint
app.get(['/meta/:type/:id.json', '/:config/meta/:type/:id.json'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  const { type, id } = req.params;
  try {
    const metaData = await getMeta(type, id);
    if (metaData) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json(metaData);
    }
    res.json({ meta: null });
  } catch (err) {
    console.error(`[Server] Error processing meta for ${type}/${id}:`, err);
    res.json({ meta: null });
  }
});

// Stremio / Nuvio Streams Endpoint
app.get(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  const { type, id } = req.params;
  const config = parseConfig(req.params.config, req.query);
  config.clientIp = getClientIp(req);
  const host = req.get('host') || 'nuvio-hungarian-addon.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  config.hostUrl = `${proto}://${host}`;

  try {
    const result = await getStreams(type, id, config);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(result);
  } catch (err) {
    console.error(`[Server] Error processing stream request for ${type}/${id}:`, err);
    res.json({ streams: [] });
  }
});

// Instant 1080p HLS Master Playlist Rewriter for Live TV (starts in 1080p FHD immediately)
app.get(['/api/live/:streamId.m3u8', '/hls/live/:streamId.m3u8'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'public, max-age=60');

  let streamId = req.params.streamId;
  if (streamId && streamId.endsWith('.m3u8')) streamId = streamId.slice(0, -5);
  if (streamId === 'm4' || streamId === 'mtv4') streamId = 'mtv4live';
  if (streamId === 'm4plus' || streamId === 'mtv4plus') streamId = 'mtv4plus';
  if (streamId === 'm1' || streamId === 'mtv1') streamId = 'mtv1live';
  if (streamId === 'm2' || streamId === 'mtv2') streamId = 'mtv2live';
  if (streamId === 'm5' || streamId === 'mtv5') streamId = 'mtv5live';
  if (streamId === 'duna') streamId = 'dunalive';
  if (streamId === 'dunaworld') streamId = 'dunaworldlive';

  const clientIp = getClientIp(req);

  try {
    const reordered = await getReorderedMasterPlaylist(streamId, clientIp);
    if (reordered) {
      return res.send(reordered);
    }

    // Fallback: direct redirect to authentic stream URL
    const originalUrl = await getLiveHlsStream(streamId, clientIp);
    if (originalUrl) {
      return res.redirect(originalUrl);
    }

    res.status(404).send('#EXTM3U\n#EXT-X-ERROR: Stream not found\n');
  } catch (err) {
    console.error(`[Server] Live stream error for ${streamId}:`, err);
    res.status(500).send('#EXTM3U\n#EXT-X-ERROR: Failed to load stream\n');
  }
});

// Episodes API for Nuvio-like Season/Episode selector
app.get('/api/episodes', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id param' });
  try {
    const data = await getSeriesEpisodes(id);
    if (data) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.json(data);
    }
    res.json({ meta: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function scoreSearchRelevance(itemTitle, query) {
  if (!itemTitle || !query) return 0;
  const normTitle = (itemTitle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (normTitle === normQuery) return 1000;
  if (normTitle.startsWith(normQuery)) return 500;
  if (normTitle.includes(normQuery)) return 300;

  const queryWords = normQuery.split(/\s+/).filter(w => w.length > 1);
  if (queryWords.length === 0) return 0;

  let matchedWords = 0;
  for (const w of queryWords) {
    if (normTitle.includes(w)) matchedWords++;
  }

  if (matchedWords === queryWords.length) {
    return 200 + (matchedWords * 25);
  }

  return matchedWords * 10;
}

// Search API for web landing page
app.get('/api/search', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const query = req.query.q || '';
  const filterType = req.query.type; // 'movie', 'series', or 'tv'
  try {
    if (filterType === 'tv') {
      const results = await searchCatalog('tv', query);
      return res.json({ results });
    }
    if (filterType === 'movie') {
      const results = await searchCatalog('movie', query);
      return res.json({ results });
    }
    if (filterType === 'classics') {
      const results = await searchCatalog('series', query, 'hu-mediaklikk-classics');
      return res.json({ results });
    }
    if (filterType === 'series') {
      const results = await searchCatalog('series', query);
      return res.json({ results });
    }

    const [tvResults, movieResults, seriesResults] = await Promise.all([
      searchCatalog('tv', query),
      searchCatalog('movie', query),
      searchCatalog('series', query)
    ]);
    if (!query) {
      // Curate flagship items for Page 1 & Page 2 when browsing the default catalog
      const topPicks = [
        tvResults.find(x => x.id === 'mediaklikk-live-m4'),      // 1. M4 Sport Élő
        seriesResults.find(x => x.id === 'tt0154077'),           // 2. A nagy ho-ho-horgász
        seriesResults.find(x => x.id === 'tt0861751'),           // 3. Magyar népmesék
        movieResults.find(x => x.id === 'tt0179955'),            // 4. Macskafogó (Cat City)
        movieResults.find(x => x.id === 'tt0121403'),            // 5. Indul a bakterház
        seriesResults.find(x => x.id === 'tt0129719'),           // 6. Süsü, a sárkány kalandjai
        seriesResults.find(x => x.id === 'tt0056789'),           // 7. A Tenkes kapitánya
        tvResults.find(x => x.id === 'mediaklikk-live-m1'),      // 8. M1 Híradó Élő
        movieResults.find(x => x.id === 'tt0131636'),            // 9. Vuk
        seriesResults.find(x => x.id === 'tt8111088'),           // 10. A Mandalóri
        movieResults.find(x => x.id === 'tt0257290'),            // 11. Üvegtigris
        seriesResults.find(x => x.id === 'tt0136650'),           // 12. Üzenet a jövőből - A Mézga család
        tvResults.find(x => x.id === 'mediaklikk-live-duna'),    // 13. Duna TV Élő
        tvResults.find(x => x.id === 'mediaklikk-live-m2'),      // 14. M2 Gyerek & Petőfi TV Élő
      ].filter(Boolean);

      const seen = new Set(topPicks.map(x => x.id));
      const combined = [...topPicks];
      for (const item of [...tvResults, ...seriesResults, ...movieResults]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          combined.push(item);
        }
      }
      return res.json({ results: combined });
    }

    const seen = new Set();
    const combined = [];
    for (const item of [...tvResults, ...movieResults, ...seriesResults]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }
    if (query) {
      combined.sort((a, b) => scoreSearchRelevance(b.name, query) - scoreSearchRelevance(a.name, query));
    }
    res.json({ results: combined });
  } catch (err) {
    res.status(500).json({ error: err.message, results: [] });
  }
});

// Diagnostic & Live Test API for the web landing page
app.get('/api/test', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  let id = req.query.id || 'tt8111088:1:1';
  id = id.trim();
  const config = parseConfig(null, req.query);
  config.clientIp = getClientIp(req);

  const startMs = Date.now();

  // Handle Live TV Channels directly
  if (id.startsWith('mediaklikk-live-')) {
    try {
      const liveResult = await getStreams('tv', id, config);
      return res.json({
        streams: liveResult.streams || [],
        queryId: id,
        durationMs: Date.now() - startMs
      });
    } catch (e) {
      return res.status(500).json({ error: e.message, streams: [] });
    }
  }

  let matchedItem = null;
  if (!id.startsWith('tt') && !id.startsWith('tmdb:') && !id.startsWith('tvdb:') && !id.startsWith('kitsu:') && !id.startsWith('netmozi:') && !id.startsWith('title:')) {
    try {
      const [movies, series] = await Promise.all([
        searchCatalog('movie', id),
        searchCatalog('series', id)
      ]);
      const cleanId = id.toLowerCase().trim();
      const exactMovie = movies.find(m => m.name.toLowerCase().includes(cleanId));
      const exactSeries = series.find(s => s.name.toLowerCase().includes(cleanId));

      matchedItem = exactMovie || exactSeries || movies[0] || series[0];
      if (matchedItem) {
        if (matchedItem.name && matchedItem.id.startsWith('netmozi:')) {
          const mid = matchedItem.id.split(':')[2];
          if (mid) {
            try {
              const { netmoziTitleCache, netmoziSlugCache } = require('./src/scrapers/netmozi');
              netmoziTitleCache.set(mid, matchedItem.name);
              if (matchedItem.netmoziLink) {
                const slugMatch = matchedItem.netmoziLink.match(/\/(?:sorozatok|adatlap|filmek|film)\/\d+\/([^/?#]+)/);
                if (slugMatch) netmoziSlugCache.set(mid, slugMatch[1]);
              }
            } catch (e) {}
          }
        }

        if (matchedItem.type === 'series') {
          id = matchedItem.id.match(/:\d+:\d+$/) ? matchedItem.id : `${matchedItem.id}:1:1`;
        } else {
          id = matchedItem.id;
        }
      } else {
        id = `title:${id}:1:1`;
      }
    } catch (e) {
      id = `title:${id}:1:1`;
    }
  }

  const type = id.includes(':') ? 'series' : 'movie';
  try {
    const result = await getStreams(type, id, config);
    const durationMs = Date.now() - startMs;
    res.json({ ...result, queryId: id, matchedItem, durationMs });
  } catch (err) {
    res.status(500).json({ error: err.message, streams: [] });
  }
});

/**
 * Fast cross-lingual title resolution via Wikipedia API (e.g. "wild robot" -> "A vad robot")
 */
async function resolveTitleToHungarian(title) {
  if (!title) return title;
  const clean = title.trim();
  try {
    // 1. Direct langlinks
    const searchTitle = clean.replace(/ /g, '_');
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(searchTitle)}&lllang=hu&format=json`;
    const res = await fetch(wikiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      const page = Object.values(data.query?.pages || {})[0];
      const hu = page?.langlinks?.[0]?.['*'];
      if (hu) return hu.replace(/\s*\([^)]+\)\s*$/g, '').trim();
    }

    // 2. Opensearch -> langlinks
    const osUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(clean)}&limit=1&format=json`;
    const osRes = await fetch(osUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(2000) });
    if (osRes.ok) {
      const osData = await osRes.json();
      const exactTitle = osData?.[1]?.[0];
      if (exactTitle) {
        const wikiUrl2 = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(exactTitle.replace(/ /g, '_'))}&lllang=hu&format=json`;
        const res2 = await fetch(wikiUrl2, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(2000) });
        if (res2.ok) {
          const data2 = await res2.json();
          const page2 = Object.values(data2.query?.pages || {})[0];
          const hu2 = page2?.langlinks?.[0]?.['*'];
          if (hu2) return hu2.replace(/\s*\([^)]+\)\s*$/g, '').trim();
        }
      }
    }
  } catch (e) {}

  return title;
}

// Provider Diagnostic / Tester Endpoint
app.get('/api/provider-test', async (req, res) => {
  const providerId = (req.query.provider || '').toLowerCase().trim();
  const rawTitle = (req.query.title || 'A vad robot').trim();
  const type = req.query.type || 'movie';
  const season = req.query.season ? parseInt(req.query.season, 10) : null;
  const episode = req.query.episode ? parseInt(req.query.episode, 10) : null;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;

  const scraper = ALL_SCRAPERS.find(s => s.id === providerId);
  if (!scraper) {
    return res.status(400).json({
      ok: false,
      error: `Ismeretlen szolgáltató: ${providerId}`,
      available: ALL_SCRAPERS.map(s => s.id)
    });
  }

  const t0 = Date.now();
  try {
    let resolvedHu = rawTitle;
    let resolvedEn = rawTitle;
    let imdbId = rawTitle.startsWith('tt') ? rawTitle : null;

    // Fast title resolution for English/Hungarian variants
    if (!rawTitle.startsWith('tt')) {
      // A. Fast Wikipedia cross-lingual lookup (~100-300ms)
      try {
        const huWiki = await resolveTitleToHungarian(rawTitle);
        if (huWiki && huWiki.toLowerCase() !== rawTitle.toLowerCase()) {
          resolvedHu = huWiki;
          resolvedEn = rawTitle;
        }
      } catch (e) {}

      // B. Catalog lookup if still identical
      if (resolvedHu === rawTitle) {
        try {
          const candidates = await searchCatalog(type === 'series' ? 'series' : 'movie', rawTitle);
          if (candidates && candidates.length > 0) {
            const top = candidates[0];
            if (top.id && top.id.startsWith('tt')) {
              imdbId = top.id;
              const resolvedMeta = await getMediaMeta(type, top.id);
              if (resolvedMeta?.hungarianTitle) resolvedHu = resolvedMeta.hungarianTitle;
              if (resolvedMeta?.englishTitle) resolvedEn = resolvedMeta.englishTitle;
            }
          }
        } catch (e) {}
      }
    }

    const meta = {
      hungarianTitle: resolvedHu,
      englishTitle: resolvedEn,
      imdbId,
      type: type,
      season: season,
      episode: episode,
      clientIp
    };

    const streams = await Promise.race([
      scraper.fn(meta),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Időtúllépés (15s)')), 15000))
    ]);

    const durationMs = Date.now() - t0;
    res.json({
      ok: true,
      provider: scraper.id,
      name: scraper.name,
      title: resolvedHu || rawTitle,
      query: rawTitle,
      count: (streams || []).length,
      durationMs,
      streams: streams || []
    });
  } catch (err) {
    const durationMs = Date.now() - t0;
    res.json({
      ok: false,
      provider: scraper.id,
      name: scraper.name,
      title: rawTitle,
      count: 0,
      durationMs,
      error: err.message,
      streams: []
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.7.4',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Configure Route & Index Page
app.get(['/configure', '/:config/configure'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route to serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Nuvio & Stremio Hungarian Addon is running!`);
    console.log(`📡 Local Port: http://localhost:${PORT}`);
    console.log(`📋 Manifest URL: http://localhost:${PORT}/manifest.json`);
    console.log(`⚙️ Configurator: http://localhost:${PORT}/configure`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
