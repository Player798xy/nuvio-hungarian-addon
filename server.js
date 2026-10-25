/**
 * Express Server for Nuvio & Stremio Addon
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getManifest, getStreams, searchCatalog, getMeta } = require('./src/addon');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(express.json());

// Serve static UI assets
app.use(express.static(path.join(__dirname, 'public')));

// Stremio / Nuvio Manifest
app.get('/manifest.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');
  res.json(getManifest());
});

// Stremio / Nuvio Catalog Endpoint
app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
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
    const metas = await searchCatalog(type, search);
    res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=86400');
    res.json({ metas: metas || [] });
  } catch (err) {
    console.error(`[Server] Error processing catalog for ${type}/${id}:`, err);
    res.json({ metas: [] });
  }
});

// Stremio / Nuvio Meta Endpoint
app.get('/meta/:type/:id.json', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  const { type, id } = req.params;
  try {
    const metaData = await getMeta(type, id);
    if (metaData) {
      res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate=604800');
      return res.json(metaData);
    }
    res.json({ meta: null });
  } catch (err) {
    console.error(`[Server] Error processing meta for ${type}/${id}:`, err);
    res.json({ meta: null });
  }
});

// Stremio / Nuvio Streams Endpoint
app.get('/stream/:type/:id.json', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  const { type, id } = req.params;
  try {
    const result = await getStreams(type, id);
    res.json(result);
  } catch (err) {
    console.error(`[Server] Error processing stream request for ${type}/${id}:`, err);
    res.json({ streams: [] });
  }
});

// Diagnostic API for the web landing page
app.get('/api/test', async (req, res) => {
  const id = req.query.id || 'tt8111088:1:1';
  const type = id.includes(':') ? 'series' : 'movie';
  try {
    const result = await getStreams(type, id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, streams: [] });
  }
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
    console.log(`======================================================\n`);
  });
}

module.exports = app;
