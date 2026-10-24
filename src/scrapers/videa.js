/**
 * Videa.hu Scraper & Direct Stream Extractor
 * Extracts 1080p, 720p, etc. direct MP4 streams using native RC4 XML decryption.
 */

const STATIC_SECRET = 'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p';

function rc4Decrypt(cipherBuf, keyStr) {
  const key = Buffer.from(keyStr, 'utf-8');
  const S = [];
  for (let i = 0; i < 256; i++) S[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) % 256;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }

  let i = 0;
  j = 0;
  const out = Buffer.alloc(cipherBuf.length);
  for (let m = 0; m < cipherBuf.length; m++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    out[m] = cipherBuf[m] ^ S[(S[i] + S[j]) % 256];
  }
  return out.toString('utf-8');
}

async function extractVideaStreams(vcode) {
  try {
    const playerUrl = `https://videa.hu/player?v=${vcode}`;
    const resp = await fetch(playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!resp.ok) return [];

    const html = await resp.text();
    const nonceMatch = html.match(/_xt\s*=\s*"([^"]+)"/);
    if (!nonceMatch) return [];

    const nonce = nonceMatch[1];
    const l = nonce.slice(0, 32);
    const s = nonce.slice(32);
    let result = '';
    for (let i = 0; i < 32; i++) {
      const idx = STATIC_SECRET.indexOf(l[i]);
      if (idx === -1) return [];
      result += s[i - (idx - 31)];
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let seed = '';
    for (let i = 0; i < 8; i++) seed += chars.charAt(Math.floor(Math.random() * chars.length));

    const xmlUrl = `https://videa.hu/player/xml?v=${vcode}&_s=${seed}&_t=${result.slice(0, 16)}`;
    const xmlResp = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: AbortSignal.timeout(6000)
    });
    const xs = xmlResp.headers.get('x-videa-xs') || '';
    const raw = await xmlResp.text();

    let xmlStr = '';
    if (raw.startsWith('<?xml')) {
      xmlStr = raw;
    } else {
      const key = result.slice(16) + seed + xs;
      const cipherBuf = Buffer.from(raw, 'base64');
      xmlStr = rc4Decrypt(cipherBuf, key);
    }

    if (xmlStr.includes('<error') || !xmlStr.includes('<video_source')) {
      return [];
    }

    const titleMatch = xmlStr.match(/<title>([^<]+)<\/title>/);
    const videoTitle = titleMatch ? titleMatch[1].trim() : 'Videa Stream';

    const sources = [];
    const sourceRegex = /<video_source\s+([^>]+)>([^<]+)<\/video_source>/g;
    let match;
    while ((match = sourceRegex.exec(xmlStr)) !== null) {
      const attrs = match[1];
      let url = match[2];
      if (url.startsWith('//')) url = 'https:' + url;

      const nameMatch = attrs.match(/name="([^"]+)"/);
      const widthMatch = attrs.match(/width="([^"]+)"/);
      const heightMatch = attrs.match(/height="([^"]+)"/);
      const expMatch = attrs.match(/exp="([^"]+)"/);

      const name = nameMatch ? nameMatch[1] : 'unknown';
      const width = widthMatch ? widthMatch[1] : '';
      const height = heightMatch ? heightMatch[1] : '';
      const exp = expMatch ? expMatch[1] : '';

      const hashMatch = xmlStr.match(new RegExp(`<hash_value_${name}>([^<]+)<\\/hash_value_${name}>`));
      if (hashMatch && exp) {
        const sep = url.includes('?') ? '&' : '?';
        url = `${url}${sep}md5=${hashMatch[1]}&expires=${exp}`;
      }

      const hNum = parseInt(height, 10) || (name.includes('1080') ? 1080 : name.includes('720') ? 720 : 480);
      sources.push({
        name,
        width,
        height: hNum,
        url,
        videoTitle
      });
    }

    return sources;
  } catch (err) {
    return [];
  }
}

/**
 * Searches Videa.hu for a query and returns streaming links.
 */
async function scrapeVidea(meta) {
  const streams = [];
  const searchTerms = [];

  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  if (meta.season && meta.episode) {
    const s = meta.season;
    const e = meta.episode;
    const ePad = String(e).padStart(2, '0');
    searchTerms.push(`${hu} S${String(s).padStart(2, '0')}E${ePad}`);
    searchTerms.push(`${hu} ${s}x${ePad}`);
    searchTerms.push(`${hu} ${s}x${e}`);
    searchTerms.push(`${hu} ${s}. evad ${e}. resz`);
    searchTerms.push(`${hu} ${e}. resz`);
    searchTerms.push(`${hu}`);
  } else {
    searchTerms.push(hu);
    if (meta.year) searchTerms.push(`${hu} ${meta.year}`);
    if (meta.englishTitle && meta.englishTitle !== hu) {
      searchTerms.push(meta.englishTitle);
    }
  }

  const seenVideoIds = new Set();

  for (const term of searchTerms.slice(0, 3)) {
    try {
      const searchUrl = `https://videa.hu/kereses/${encodeURIComponent(term)}`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;

      const html = await res.text();
      const videoIds = [...html.matchAll(/\/videok\/[^"'#\s]+-([A-Za-z0-9]{16})/g)].map(m => m[1]);

      for (const vid of videoIds.slice(0, 5)) {
        if (seenVideoIds.has(vid)) continue;
        seenVideoIds.add(vid);

        const videoStreams = await extractVideaStreams(vid);
        for (const vs of videoStreams) {
          const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
          streams.push({
            name: `[HU] Videa ${qualLabel}`,
            title: `${vs.videoTitle}\n🇭🇺 Videa.hu • ${qualLabel} • Direct Stream`,
            url: vs.url,
            quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
            height: vs.height,
            source: 'videa',
            behaviorHints: {
              bingeGroup: `hu-videa-${qualLabel}`
            }
          });
        }
      }

      if (streams.length >= 4) break;
    } catch (e) {
      // Continue to next search term
    }
  }

  return streams;
}

module.exports = {
  scrapeVidea,
  extractVideaStreams
};
