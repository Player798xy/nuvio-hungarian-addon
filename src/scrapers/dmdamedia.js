/**
 * DMDAMedia Scraper (dmdamedia.hu)
 * Scrapes movies and series from dmdamedia.hu and resolves direct streams.
 */

const { extractVideaStreams } = require('./videa');
const { extractIndavideoStreams } = require('./indavideo');

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeDMDAMedia(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const searchQueries = [hu];
  if (meta.englishTitle && normalize(meta.englishTitle) !== normalize(hu)) {
    searchQueries.push(meta.englishTitle);
  }

  for (const q of searchQueries) {
    try {
      const body = new URLSearchParams({ search: q }).toString();
      const sRes = await fetch('https://dmdamedia.hu/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body,
        signal: AbortSignal.timeout(4500)
      });
      if (!sRes.ok) continue;

      const html = await sRes.text();
      const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => ({
          url: m[1],
          title: m[2].replace(/<[^>]+>/g, '').trim()
        }))
        .filter(l => l.url.startsWith('/') && !l.url.startsWith('/kategoria') && !l.url.startsWith('/szineszek') && !l.url.startsWith('/cdn-cgi') && l.url.length > 2);

      if (links.length === 0) continue;

      const normTarget = normalize(hu);
      const candidates = links.slice(0, 4);

      await Promise.all(candidates.map(async (item) => {
        let targetUrl = `https://dmdamedia.hu${item.url}`;

        // If series, navigate to specific season & episode
        if (meta.season && meta.episode) {
          const s = meta.season;
          const e = meta.episode;
          targetUrl = `https://dmdamedia.hu${item.url}/${s}.evad/${e}.resz`;
        }

        try {
          const pageRes = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(5000)
          });
          if (!pageRes.ok) return;

          const pageHtml = await pageRes.text();
          const iframes = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);

          for (const ifr of iframes) {
            let iframeSrc = ifr.startsWith('//') ? 'https:' + ifr : ifr;

            // 1. Videa embed
            if (iframeSrc.includes('videa.hu/player?v=')) {
              const vcodeMatch = iframeSrc.match(/v=([a-zA-Z0-9]{16})/);
              if (vcodeMatch) {
                const vcode = vcodeMatch[1];
                const vData = await extractVideaStreams(vcode);
                const vStreams = vData?.sources || [];
                for (const vs of vStreams) {
                  const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
                  streams.push({
                    name: `[HU] DMDAMedia ${qualLabel}`,
                    title: `${item.title || hu}\n🇭🇺 DMDAMedia (Videa) • ${qualLabel} • Szinkron`,
                    url: vs.url,
                    quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
                    height: vs.height,
                    source: 'dmdamedia'
                  });
                }
              }
            }

            // 2. Indavideo embed
            if (iframeSrc.includes('embed.indavideo.hu/player/video/')) {
              const ihashMatch = iframeSrc.match(/video\/([a-zA-Z0-9]+)/);
              if (ihashMatch) {
                const ihash = ihashMatch[1];
                const iData = await extractIndavideoStreams(ihash);
                const iStreams = iData?.streams || [];
                for (const is of iStreams) {
                  const qualLabel = is.height >= 1080 ? '1080p FHD' : is.height >= 720 ? '720p HD' : `${is.height}p`;
                  streams.push({
                    name: `[HU] DMDAMedia ${qualLabel}`,
                    title: `${item.title || hu}\n🇭🇺 DMDAMedia (Indavideo) • ${qualLabel} • Szinkron`,
                    url: is.url,
                    quality: is.height >= 1080 ? '1080p' : is.height >= 720 ? '720p' : '480p',
                    height: is.height,
                    source: 'dmdamedia'
                  });
                }
              }
            }
          }
        } catch (e) {}
      }));

      if (streams.length > 0) break;
    } catch (e) {}
  }

  return streams;
}

module.exports = {
  scrapeDMDAMedia
};
