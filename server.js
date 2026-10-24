/**
 * Express Server for Nuvio & Stremio Addon
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getManifest, getStreams } = require('./src/addon');

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
