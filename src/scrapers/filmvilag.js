/**
 * Filmvilag2 Scraper (onlinefilmvilag2.eu)
 * Extracts 1080p and 720p direct streams from Filmvilag2 articles (Videa, Indavideo, OK.ru).
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

async function scrapeFilmvilag(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const searchQueries = [hu];
  if (meta.englishTitle && normalize(meta.englishTitle) !== normalize(hu)) {
    searchQueries.push(meta.englishTitle);
  }

  for (const q of searchQueries) {
    try {
      const body = new URLSearchParams({
        uid: '1504382',
        key: q
      }).toString();

      const searchRes = await fetch('https://katalog.estranky.cz/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://onlinefilmvilag2.eu/'
        },
        body,
        signal: AbortSignal.timeout(4500)
      });
      if (!searchRes.ok) continue;

      const searchHtml = await searchRes.text();
      const links = [...searchHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => ({
          url: m[1].replace('http://', 'https://'),
          title: m[2].replace(/<[^>]+>/g, '').trim()
        }))
        .filter(l => l.url.includes('.html') && !l.url.includes('filmkeres-es-hibas-link'));

      if (links.length === 0) continue;

      const normTarget = normalize(hu);
      const candidates = links.slice(0, 3).filter(item => {
        const normItemTitle = normalize(item.title);
        const targetWords = normTarget.split(' ').filter(w => w.length > 2);
        return targetWords.some(w => normItemTitle.includes(w) || item.url.toLowerCase().includes(w));
      });

      await Promise.all(candidates.map(async (item) => {
        try {
          const artRes = await fetch(item.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(5000)
          });
          if (!artRes.ok) return;

          const artHtml = await artRes.text();
          const iframes = [...artHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);

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
                    name: `[HU] Filmvilag2 ${qualLabel}`,
                    title: `${item.title}\n🇭🇺 Filmvilág2 (Videa) • ${qualLabel} • Szinkron`,
                    url: vs.url,
                    quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
                    height: vs.height,
                    source: 'filmvilag2'
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
                    name: `[HU] Filmvilag2 ${qualLabel}`,
                    title: `${item.title}\n🇭🇺 Filmvilág2 (Indavideo) • ${qualLabel} • Szinkron`,
                    url: is.url,
                    quality: is.height >= 1080 ? '1080p' : is.height >= 720 ? '720p' : '480p',
                    height: is.height,
                    source: 'filmvilag2'
                  });
                }
              }
            }
          }
        } catch (e) {}
      }));

      if (streams.length > 0) break;
    } catch (err) {
      // Continue
    }
  }

  return streams;
}

module.exports = {
  scrapeFilmvilag
};
