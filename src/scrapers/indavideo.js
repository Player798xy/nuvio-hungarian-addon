/**
 * Indavideo.hu Scraper
 * Extracts direct MP4 streams with authenticated CDN tokens from Indavideo.
 */

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractIndavideoStreams(embHash) {
  try {
    const rnd = Math.floor(Math.random() * 2147483647);
    const dataUrl = `https://amfphp.indavideo.hu/SYm0json.php/player.playerHandler.getVideoData/${embHash}/12/?callback=json&_=${rnd}`;

    const res = await fetch(dataUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://embed.indavideo.hu/'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return null;
    let text = await res.text();
    if (text.startsWith('json(')) {
      text = text.slice(5, text.lastIndexOf(')'));
    }
    const json = JSON.parse(text);
    const data = json?.data;
    if (!data) return null;

    const title = data.title || '';
    const filesh = data.filesh || {};
    const videoFiles = [];

    if (Array.isArray(data.video_files)) {
      videoFiles.push(...data.video_files);
    } else if (data.video_files && typeof data.video_files === 'object') {
      videoFiles.push(...Object.values(data.video_files));
    }
    if (data.video_file && !videoFiles.includes(data.video_file)) {
      videoFiles.push(data.video_file);
    }

    const streams = [];
    const seenHeights = new Set();

    for (const vUrl of videoFiles) {
      if (!vUrl || typeof vUrl !== 'string') continue;
      const heightMatch = vUrl.match(/\.(\d{3,4})\.mp4/);
      const height = heightMatch ? parseInt(heightMatch[1], 10) : 360;

      if (seenHeights.has(height)) continue;
      seenHeights.add(height);

      let token = filesh[height.toString()] || filesh[height];
      if (!token) {
        token = Object.values(filesh)[0] || '';
      }

      let finalUrl = vUrl.replace('??', '?');
      if (token) {
        finalUrl += `&token=${token}`;
      }

      streams.push({
        height,
        url: finalUrl,
        title
      });
    }

    streams.sort((a, b) => b.height - a.height);
    return { title, streams };
  } catch (err) {
    return null;
  }
}

async function scrapeIndavideo(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const searchTerms = [];
  if (meta.season && meta.episode) {
    const s = meta.season;
    const e = meta.episode;
    const ePad = e.toString().padStart(2, '0');
    searchTerms.push(`${hu} S${s}E${ePad}`);
    searchTerms.push(`${hu} ${s}x${e}`);
    searchTerms.push(`${hu} ${s} evad ${e} resz`);
  } else {
    searchTerms.push(`${hu} teljes film`);
    if (meta.year) searchTerms.push(`${hu} ${meta.year}`);
    searchTerms.push(hu);
  }

  const seenVideoSlugs = new Set();

  for (const term of searchTerms.slice(0, 2)) {
    try {
      const searchUrl = `https://indavideo.hu/search?search=${encodeURIComponent(term)}&view=detailed&sort_mode=magic`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;

      const html = await res.text();
      const videoLinks = [...html.matchAll(/href="https?:\/\/indavideo\.hu\/video\/([^"#\s]+)"/g)].map(m => m[1]);

      for (const slug of videoLinks.slice(0, 5)) {
        if (seenVideoSlugs.has(slug)) continue;
        seenVideoSlugs.add(slug);

        try {
          const pageRes = await fetch(`https://indavideo.hu/video/${slug}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(4000)
          });
          if (!pageRes.ok) continue;

          const pHtml = await pageRes.text();
          const hashMatch = pHtml.match(/id=['"]emb_hash['"][^>]+value=['"]([^'"]+)['"]/i) ||
                            pHtml.match(/value=['"]([^'"]+)['"][^>]+id=['"]emb_hash['"]/i) ||
                            pHtml.match(/embed\.indavideo\.hu\/player\/video\/([a-zA-Z0-9]+)/);

          if (!hashMatch) continue;
          const embHash = hashMatch[1];

          const vData = await extractIndavideoStreams(embHash);
          if (!vData || !vData.streams || vData.streams.length === 0) continue;

          // Check title match
          const normCand = normalize(vData.title);
          const normHu = normalize(hu);
          if (!normCand.includes(normHu) && !normHu.includes(normCand)) {
            // Check word overlap
            const words = normHu.split(' ').filter(w => w.length > 2);
            const matches = words.filter(w => normCand.includes(w));
            if (matches.length < Math.max(1, Math.ceil(words.length * 0.6))) {
              continue;
            }
          }

          // If looking for movie, reject sequel numbers if not in query
          if (!meta.season) {
            const targetHasNum = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normHu);
            const candHasNum = /\b([2-9]|ii|iii|iv|v|vi)\b/i.test(normCand);
            if (!targetHasNum && candHasNum) continue;
          }

          for (const s of vData.streams) {
            const qualLabel = s.height >= 1080 ? '1080p FHD' : s.height >= 720 ? '720p HD' : `${s.height}p`;
            streams.push({
              name: `[HU] Indavideo ${qualLabel}`,
              title: `${vData.title}\n🇭🇺 Indavideo.hu • ${qualLabel} • Közvetlen MP4`,
              url: s.url,
              quality: s.height >= 1080 ? '1080p' : s.height >= 720 ? '720p' : '480p',
              height: s.height,
              source: 'indavideo'
            });
          }
        } catch (e) {
          // Continue to next slug
        }
      }

      if (streams.length > 0) break;
    } catch (err) {
      // Continue
    }
  }

  return streams;
}

module.exports = {
  scrapeIndavideo,
  extractIndavideoStreams
};
