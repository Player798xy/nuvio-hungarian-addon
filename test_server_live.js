const app = require('./server');

const server = app.listen(7001, async () => {
  console.log('Testing live endpoints on port 7001...');
  try {
    // 1. Test Manifest
    const manifestRes = await fetch('http://localhost:7001/manifest.json');
    const manifest = await manifestRes.json();
    console.log('✅ Manifest test passed:', manifest.name, 'id:', manifest.id);

    // 2. Test Stream Endpoint
    console.log('Testing stream search for tt0848228 (The Avengers)...');
    const streamRes = await fetch('http://localhost:7001/stream/movie/tt0848228.json');
    const streamData = await streamRes.json();
    console.log(`✅ Streams returned: ${streamData.streams.length}`);
    for (const s of streamData.streams.slice(0, 5)) {
      console.log(`   - [${s.quality}] ${s.name}: ${s.url.slice(0, 80)}...`);
    }
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
