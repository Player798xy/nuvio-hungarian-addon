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

app.get('/api/diag-netmozi', async (req, res) => {
  const { netmoziTlsRequest, netmoziFetchWithRedirects } = require('./src/scrapers/netmozi');
  const { unpack, resolveContent } = require('./src/utils/linkpayload');
  const cookieJar = new Map();
  const title = req.query.title || 'Shrek';
  const diag = { title, steps: [] };

  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  try {
    // 1. Search
    const searchUrl = `https://netmozi.com/?search=${encodeURIComponent(title)}`;
    const searchRes = await netmoziTlsRequest(searchUrl, {}, cookieJar);
    diag.steps.push({ step: 'search', status: searchRes.statusCode, len: searchRes.body?.length });

    // 2. Candidates
    const normTarget = normalize(title);
    const articleMatches = [...(searchRes.body || '').matchAll(/<article[^>]*class=["'][^"']*movie-card[^"']*["'][\s\S]*?<\/article>/gi)];
    diag.steps.push({ step: 'movieCardsFound', count: articleMatches.length });

    const candidates = [];
    for (const match of articleMatches) {
      const cardStr = match[0];
      const linkMatch = cardStr.match(/href=["'](\/adatlap\/[^"']+)["']/i);
      const titleMatch = cardStr.match(/<h3[^>]*class=["']movie-title["'][^>]*>([\s\S]*?)<\/h3>/i);
      const yearMatch = cardStr.match(/Év:[\s\S]*?([0-9]{4})/i);
      if (linkMatch && titleMatch) {
        const itemTitle = titleMatch[1].replace(/<[^>]+>/g, '').replace('(sorozat)', '').trim();
        candidates.push({ title: itemTitle, link: linkMatch[1], year: yearMatch ? yearMatch[1] : '' });
      }
    }
    diag.steps.push({ step: 'candidates', candidates: candidates.slice(0, 3) });

    if (candidates.length === 0) return res.json(diag);
    const best = candidates[0];

    // 3. Detail page
    const targetUrl = 'https://netmozi.com' + best.link;
    const detailRes = await netmoziFetchWithRedirects(targetUrl, { referer: 'https://netmozi.com/' }, cookieJar);
    diag.steps.push({ step: 'detail', status: detailRes.statusCode, len: detailRes.body?.length, headers: detailRes.headers });

    const attrs = {};
    for (const mMatch of (detailRes.body || '').matchAll(/(data-movie-id|data-token|data-csrf)="([^"]+)"/g)) {
      attrs[mMatch[1]] = mMatch[2];
    }
    const test1 = await netmoziTlsRequest('https://netmozi.com/adatlap/534/shrek', {}, cookieJar);
    const test2 = await netmoziTlsRequest('https://netmozi.com/adatlap/1207/harmadik-shrek', {}, cookieJar);
    diag.steps.push({
      step: 'adatlap_test',
      shrek534: { status: test1.statusCode, location: test1.headers['location'], len: test1.body?.length },
      shrek1207: { status: test2.statusCode, location: test2.headers['location'], len: test2.body?.length }
    });

    if (!attrs['data-movie-id'] || !attrs['data-token'] || !attrs['data-csrf']) {
      return res.json(diag);
    }

    // 4. loadLinks
    const loadLinksUrl = `https://netmozi.com/details/loadLinks/${attrs['data-movie-id']}${attrs['data-csrf']}`;
    const loadLinksRes = await netmoziTlsRequest(loadLinksUrl, {
      method: 'POST',
      body: 'token=' + encodeURIComponent(attrs['data-token']),
      referer: targetUrl,
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }, cookieJar);
    diag.steps.push({ step: 'loadLinks', status: loadLinksRes.statusCode, bodySnippet: loadLinksRes.body?.slice(0, 200) });

    let linksData;
    try { linksData = JSON.parse(loadLinksRes.body); } catch(e) {}
    if (!linksData?.success || !linksData?.linkPayload) return res.json(diag);

    const redirectPages = unpack(linksData.linkPayload.value, attrs['data-token']);
    diag.steps.push({ step: 'redirectPages', redirectPages });

    if (!redirectPages?.[0]) return res.json(diag);

    // 5. mindjart
    const mindjartUrl = redirectPages[0];
    const mindjartRes = await netmoziFetchWithRedirects(mindjartUrl, { referer: 'https://netmozi.com/' }, cookieJar);
    diag.steps.push({ step: 'mindjart', status: mindjartRes.statusCode, len: mindjartRes.body?.length });

    const mPayload = (mindjartRes.body || '').match(/<script[^>]*data-link-payload[^>]*data-link-context="([^"]+)"[^>]*>(.*?)<\/script>/s);
    diag.steps.push({ step: 'payloadFound', found: Boolean(mPayload) });

    if (mPayload) {
      const routes = unpack(JSON.parse(mPayload[2]).value, mPayload[1]);
      diag.steps.push({ step: 'routes', count: routes?.length, sample: routes?.slice(0, 5) });
    }

    res.json(diag);
  } catch (err) {
    diag.error = err.message;
    diag.stack = err.stack;
    res.json(diag);
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
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json(data);
    }
    res.json({ meta: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
        tvResults.find(x => x.id === 'mediaklikk-live-m1'),      // 2. M1 Híradó Élő
        seriesResults.find(x => x.id === 'tt0861751'),           // 3. Magyar népmesék
        movieResults.find(x => x.id === 'tt0179955'),            // 4. Macskafogó (Cat City)
        seriesResults.find(x => x.id === 'tt0056789'),           // 5. A Tenkes kapitánya
        tvResults.find(x => x.id === 'mediaklikk-live-duna'),    // 6. Duna TV Élő
        movieResults.find(x => x.id === 'tt0131636'),            // 7. Vuk
        seriesResults.find(x => x.id === 'tt8111088'),           // 8. A Mandalóri
        movieResults.find(x => x.id === 'tt0257290'),            // 9. Üvegtigris
        seriesResults.find(x => x.id === 'tt0136650'),           // 10. Üzenet a jövőből - A Mézga család
        movieResults.find(x => x.id === 'tt0121403'),            // 11. Indul a bakterház
        tvResults.find(x => x.id === 'mediaklikk-live-m2'),      // 12. M2 Gyerek & Petőfi TV Élő
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
  if (!id.startsWith('tt')) {
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
        id = matchedItem.type === 'series' ? `${matchedItem.id}:1:1` : matchedItem.id;
      } else {
        return res.json({ streams: [], resolvedTitle: null });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message, streams: [] });
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
