/**
 * Videa.hu Scraper & Direct Stream Extractor
 * Extracts 1080p, 720p, etc. direct MP4 streams using native RC4 XML decryption.
 * Features strict duration, category, and title matching so only real, full movies/episodes are returned.
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

/**
 * Extracts streams using fcode (Videa's internal format used to bypass noembed blocks).
 */
async function extractVideaFCodeStreams(fcode) {
  try {
    const playerUrl = `https://videa.hu/player?f=${encodeURIComponent(fcode)}&s=%7B%22loc%22%3A1%7D`;
    const resp = await fetch(playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://videa.hu/'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!resp.ok) return null;

    const html = await resp.text();
    const nonceMatch = html.match(/_xt\s*=\s*"([^"]+)"/);
    if (!nonceMatch) return null;

    const _xt = nonceMatch[1];
    const e = _xt.split('');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let t = '';
    for (let i = 0; i < 8; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));

    const c = {};
    const o = "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";
    let r = ["e", "a", "g", "j", "d", "c", "h", "i", "b", "f"];

    for (let i = 0; i < e.length; i++) {
      if (i % 8 === 0) c[r[Math.floor(i / 8) + 1]] = "";
      c[r[Math.floor(i / 8) + 1]] += e[i];
    }
    c[r[0]] = t;

    const d = c.a + c.g + c.j + c.d;
    const u = c.c + c.h + c.i + c.b;
    let m = "";
    for (let i = 0; i < d.length; i++) {
      m += u.charAt(i - (o.indexOf(d.charAt(i)) - 31));
    }

    r = ["f", "h", "c", "b", "i"];
    for (let i = 0; i < m.length; i++) {
      if (i % 8 === 0) c[r[Math.floor(i / 8) + 1]] = "";
      c[r[Math.floor(i / 8) + 1]] += m.charAt(i);
    }
    c[r[0]] = "";

    const _s = c.e;
    const _t = c.h + c.c;

    const xmlUrl = `https://videa.hu/player/xml?f=${encodeURIComponent(fcode)}&s=%7B%22loc%22%3A1%7D&_s=${encodeURIComponent(_s)}&_t=${encodeURIComponent(_t)}`;
    const xmlResp = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://videa.hu/'
      },
      signal: AbortSignal.timeout(6000)
    });
    const xs = xmlResp.headers.get('x-videa-xs') || '';
    c.f = xs;
    const raw = await xmlResp.text();

    let xmlStr = '';
    if (raw.startsWith('<?xml')) {
      xmlStr = raw;
    } else {
      const key = c.b + c.i + c.e + c.f;
      const cipherBuf = Buffer.from(raw, 'base64');
      xmlStr = rc4Decrypt(cipherBuf, key);
    }

    if (!xmlStr.includes('<video_source')) return null;

    const titleMatch = xmlStr.match(/<title>([^<]+)<\/title>/);
    const durationMatch = xmlStr.match(/<duration>(\d+)<\/duration>/);
    const videoTitle = titleMatch ? titleMatch[1].trim() : 'Videa Stream';
    const duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;

    const sources = [];
    const sourceRegex = /<video_source\s+([^>]+)>([^<]+)<\/video_source>/g;
    let match;
    while ((match = sourceRegex.exec(xmlStr)) !== null) {
      const attrs = match[1];
      let url = match[2];
      if (url.startsWith('//')) url = 'https:' + url;

      const nameMatch = attrs.match(/name="([^"]+)"/);
      const heightMatch = attrs.match(/height="([^"]+)"/);
      const expMatch = attrs.match(/exp="([^"]+)"/);

      const name = nameMatch ? nameMatch[1] : 'unknown';
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
        height: hNum,
        url,
        videoTitle,
        duration
      });
    }

    return { videoTitle, duration, sources };
  } catch (e) {
    return null;
  }
}

/**
 * Extracts streams and metadata (including duration in seconds) from a Videa video code.
 */
async function extractVideaStreams(vcode) {
  try {
    const playerUrl = `https://videa.hu/player?v=${vcode}`;
    const resp = await fetch(playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!resp.ok) return null;

    const html = await resp.text();
    const nonceMatch = html.match(/_xt\s*=\s*"([^"]+)"/);
    if (!nonceMatch) return null;

    const _xt = nonceMatch[1];
    const e = _xt.split('');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let t = '';
    for (let i = 0; i < 8; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));

    const c = {};
    const o = "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";
    let r = ["e", "a", "g", "j", "d", "c", "h", "i", "b", "f"];

    for (let i = 0; i < e.length; i++) {
      if (i % 8 === 0) c[r[Math.floor(i / 8) + 1]] = "";
      c[r[Math.floor(i / 8) + 1]] += e[i];
    }
    c[r[0]] = t;

    const d = c.a + c.g + c.j + c.d;
    const u = c.c + c.h + c.i + c.b;
    let m = "";
    for (let i = 0; i < d.length; i++) {
      m += u.charAt(i - (o.indexOf(d.charAt(i)) - 31));
    }

    r = ["f", "h", "c", "b", "i"];
    for (let i = 0; i < m.length; i++) {
      if (i % 8 === 0) c[r[Math.floor(i / 8) + 1]] = "";
      c[r[Math.floor(i / 8) + 1]] += m.charAt(i);
    }
    c[r[0]] = "";

    const _s = c.e;
    const _t = c.h + c.c;

    const xmlUrl = `https://videa.hu/player/xml?v=${vcode}&_s=${encodeURIComponent(_s)}&_t=${encodeURIComponent(_t)}`;
    const xmlResp = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: AbortSignal.timeout(6000)
    });
    const xs = xmlResp.headers.get('x-videa-xs') || '';
    c.f = xs;
    const raw = await xmlResp.text();

    let xmlStr = '';
    if (raw.startsWith('<?xml')) {
      xmlStr = raw;
    } else {
      const key = c.b + c.i + c.e + c.f;
      const cipherBuf = Buffer.from(raw, 'base64');
      xmlStr = rc4Decrypt(cipherBuf, key);
    }

    if (xmlStr.includes('panelstyle="noembed"')) {
      const pageUrlMatch = xmlStr.match(/<error[^>]*>(https?:\/\/videa\.hu\/videok\/[^<]+)<\/error>/);
      if (pageUrlMatch) {
        try {
          const pageRes = await fetch(pageUrlMatch[1], {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(5000)
          });
          if (pageRes.ok) {
            const pageHtml = await pageRes.text();
            const fMatch = pageHtml.match(/\/player\?f=([a-zA-Z0-9_\.]+)/);
            if (fMatch) {
              const fData = await extractVideaFCodeStreams(fMatch[1]);
              if (fData && fData.sources && fData.sources.length > 0) {
                return fData;
              }
            }
          }
        } catch (e) {}
      }
      return null;
    }

    if (xmlStr.includes('<error') || !xmlStr.includes('<video_source')) {
      return null;
    }

    const titleMatch = xmlStr.match(/<title>([^<]+)<\/title>/);
    const durationMatch = xmlStr.match(/<duration>(\d+)<\/duration>/);
    const videoTitle = titleMatch ? titleMatch[1].trim() : 'Videa Stream';
    const duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;

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
        videoTitle,
        duration
      });
    }

    return { videoTitle, duration, sources };
  } catch (err) {
    return null;
  }
}

// Terms indicating music, clips, or trailers that should not be treated as a full feature
const JUNK_TITLE_REGEX = /\b(filmzene|zene|soundtrack|ost|paródia|parodia|főcímdal|focimdal|trailer|előzetes|elozetes|párbaj|parbaj|interjú|interju|dán állami)\b/i;

function isTitleMatch(targetTitle, candidateTitle, targetYear, isSeries = false) {
  if (!targetTitle || !candidateTitle) return false;
  const norm = (s) => s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let cleanTarget = targetTitle.replace(/\s*[-–:]\s*(a film|the movie|film|sorozat)\s*$/i, "").trim();
  if (!cleanTarget) cleanTarget = targetTitle;

  const normTarget = norm(cleanTarget);
  const normCand = norm(candidateTitle);

  if (!isSeries) {
    const targetHasNumber = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normTarget);
    const candHasNumber = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normCand);
    if (!targetHasNumber && candHasNumber) return false;

    if (targetYear) {
      const candYearMatch = normCand.match(/\b(19\d\d|20\d\d)\b/);
      if (candYearMatch) {
        const candYear = parseInt(candYearMatch[1], 10);
        const tYear = parseInt(targetYear, 10);
        if (Math.abs(candYear - tYear) > 2) return false;
      }
    }
  }

  const stopWords = ["egy", "nem", "mint", "hogy", "the", "and", "film", "teljes", "magyarul", "online", "szinkronos"];
  const targetWords = normTarget.split(" ").filter(w => w.length >= 2 && !stopWords.includes(w));

  if (targetWords.length === 0) {
    const rawWords = normTarget.split(" ").filter(w => w.length >= 2);
    if (rawWords.length === 0) {
      return new RegExp("\\b" + normTarget + "\\b", "i").test(normCand);
    }
    return rawWords.every(w => new RegExp("\\b" + w + "\\b", "i").test(normCand));
  }

  if (targetWords.length === 1 && targetWords[0].length <= 3) {
    return new RegExp("\\b" + targetWords[0] + "\\b", "i").test(normCand);
  }

  const matched = targetWords.filter(w => {
    if (w.length <= 3) return new RegExp("\\b" + w + "\\b", "i").test(normCand);
    return normCand.includes(w);
  });

  if (targetWords.length <= 2) {
    return matched.length === targetWords.length;
  }
  const ratio = matched.length / targetWords.length;
  return ratio >= 0.6;
}

function matchesEpisode(title, season, episode, epTitle = '') {
  if (!season && !episode) return true;
  const t = title.toLowerCase();

  // If episode title is known (e.g. "A vérdíj")
  if (epTitle && epTitle.length >= 4 && t.includes(epTitle.toLowerCase())) {
    return true;
  }

  // Check SxxExx or sxxexx or SxEx
  const seMatch = t.match(/s(\d+)e(\d+)/i) || t.match(/(\d+)x(\d+)/i);
  if (seMatch) {
    const s = parseInt(seMatch[1], 10);
    const e = parseInt(seMatch[2], 10);
    return e === episode && (s === season || isNaN(s));
  }

  // Check "X. rész" or "X.resz"
  const reszMatch = t.match(/(\d+)\s*\.?\s*r[eé]sz/i);
  if (reszMatch) {
    const e = parseInt(reszMatch[1], 10);
    return e === episode;
  }

  // Check "X. epizód"
  const epMatch = t.match(/(\d+)\s*\.?\s*epiz[oó]d/i);
  if (epMatch) {
    const e = parseInt(epMatch[1], 10);
    return e === episode;
  }

  return true;
}

/**
 * Searches Videa.hu for a movie/episode and returns validated full-length streaming links.
 */
async function scrapeVidea(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const isMovie = meta.type === 'movie' || !meta.season;
  
  // Calculate acceptable runtime window based on official IMDb/TMDB runtime
  let minDuration = isMovie ? 2400 : 600;
  let maxDuration = isMovie ? 18000 : 7200;

  if (meta.runtimeMinutes && meta.runtimeMinutes > 0) {
    const targetSec = meta.runtimeMinutes * 60;
    if (isMovie) {
      // For movies: allow -30% to +35% (covers PAL 25fps speedup and extended/director cuts)
      minDuration = Math.max(2100, Math.round(targetSec * 0.70));
      maxDuration = Math.round(targetSec * 1.35);
    } else {
      // For series episodes: allow -40% to +50%
      minDuration = Math.max(600, Math.round(targetSec * 0.60));
      maxDuration = Math.round(targetSec * 1.50);
    }
  }

  const searchTerms = [];
  if (meta.season && meta.episode) {
    const s = meta.season;
    const e = meta.episode;
    const sPad = String(s).padStart(2, '0');
    const ePad = String(e).padStart(2, '0');
    if (meta.episodeTitle) {
      searchTerms.push(`${hu} ${meta.episodeTitle}`);
    }
    searchTerms.push(`${hu} S${sPad}E${ePad}`);
    searchTerms.push(`${hu} ${e}. resz`);
    searchTerms.push(`${hu} ${s}x${ePad}`);
  } else {
    // Movies: Prioritize full movie queries
    searchTerms.push(`${hu} teljes film`);
    if (meta.year) searchTerms.push(`${hu} ${meta.year}`);
    searchTerms.push(`${hu} teljes film magyarul`);
    searchTerms.push(hu);
  }

  const seenVideoIds = new Set();

  for (const term of searchTerms) {
    try {
      const searchUrl = `https://videa.hu/kereses/${encodeURIComponent(term)}`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;

      const html = await res.text();

      // Extract all video items with their link path: /videok/<category>/<slug>-<vcode>
      const linkRegex = /href=["'](https?:\/\/videa\.hu)?\/videok\/([^/"'\s]+)\/[^"'#\s]+-([A-Za-z0-9]{16})["']/g;
      const matches = [...html.matchAll(linkRegex)];

      const candidateIds = [];
      for (const m of matches) {
        const category = m[2];
        const vid = m[3];

        // Skip non-movie categories (e.g. zene, hirek, emberek-vlogok)
        if (category === 'zene' || category === 'emberek-vlogok' || category === 'hirek-politika' || category === 'vicces') {
          continue;
        }

        if (!seenVideoIds.has(vid)) {
          seenVideoIds.add(vid);
          candidateIds.push(vid);
          if (candidateIds.length >= 8) break;
        }
      }

      // Parallel stream extraction for candidates (cuts latency by 4x)
      const videoDataList = await Promise.all(
        candidateIds.map(vid => extractVideaStreams(vid).catch(() => null))
      );

      for (const videoData of videoDataList) {
        if (!videoData || !videoData.sources || videoData.sources.length === 0) continue;

        // Strict Duration Filter against IMDb/TMDB official runtime:
        if (videoData.duration < minDuration || videoData.duration > maxDuration) {
          continue;
        }

        // Title filter: ignore music / parody / clips
        if (JUNK_TITLE_REGEX.test(videoData.videoTitle)) {
          continue;
        }

        // Title relevance match: must match searched title (and year/sequel rules for movies)
        if (!isTitleMatch(hu, videoData.videoTitle, meta.year, !isMovie) && !isTitleMatch(meta.englishTitle, videoData.videoTitle, meta.year, !isMovie)) {
          continue;
        }

        // Strict episode filter for series:
        if (!isMovie && !matchesEpisode(videoData.videoTitle, meta.season, meta.episode, meta.episodeTitle)) {
          continue;
        }

        const durationMins = Math.round(videoData.duration / 60);

        for (const vs of videoData.sources) {
          const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
          streams.push({
            name: `[HU] Videa ${qualLabel}`,
            title: `${videoData.videoTitle}\n🇭🇺 Videa.hu • ${qualLabel} • ${durationMins} perc • Teljes film`,
            url: vs.url,
            quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
            height: vs.height,
            source: 'videa',
            behaviorHints: {
              bingeGroup: `hu-videa-${qualLabel}`
            }
          });
        }

        // Keep collecting to maximize 1080p finds
        const count1080 = streams.filter(s => s.height >= 1080).length;
        if (count1080 >= 5 || streams.length >= 15) break;
      }

      const count1080 = streams.filter(s => s.height >= 1080).length;
      if (count1080 >= 4 || streams.length >= 12) break;
    } catch (e) {
      // Continue to next search term
    }
  }

  return streams;
}

module.exports = {
  scrapeVidea,
  extractVideaStreams,
  extractVideaFCodeStreams,
  isTitleMatch
};
