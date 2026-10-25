/**
 * MeseFilm Scraper (Mesekincstar.tv & Retromesek.hu)
 * Dedicated scraper for Hungarian animations, cartoons, and fairy tales.
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

async function scrapeMeseFilm(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const normTarget = normalize(hu);

  // 1. Search Mesekincstar.tv
  try {
    const sUrl = `https://mesekincstar.tv/mesekereso/${encodeURIComponent(hu)}`;
    const sRes = await fetch(sUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(4000)
    });
    if (sRes.ok) {
      const html = await sRes.text();
      const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*title="([^"]+)"/gi)]
        .map(m => ({ url: m[1], title: m[2] }))
        .filter(l => !l.url.includes('/tag/') && !l.url.includes('/mesekereso/'));

      for (const item of links.slice(0, 3)) {
        try {
          const pageRes = await fetch(item.url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(3500)
          });
          if (pageRes.ok) {
            const pHtml = await pageRes.text();
            const iframes = [...pHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
            for (const ifr of iframes) {
              let iframeSrc = ifr.startsWith('//') ? 'https:' + ifr : ifr;

              // Videa embed
              if (iframeSrc.includes('videa.hu/player?v=')) {
                const vcodeMatch = iframeSrc.match(/v=([a-zA-Z0-9]{16})/);
                if (vcodeMatch) {
                  const vData = await extractVideaStreams(vcodeMatch[1]);
                  const vStreams = vData?.sources || [];
                  for (const vs of vStreams) {
                    const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
                    streams.push({
                      name: `[HU] MeseFilm ${qualLabel}`,
                      title: `${item.title}\n🇭🇺 MeseKincstár (Videa) • ${qualLabel} • Magyar Rajzfilm`,
                      url: vs.url,
                      quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
                      height: vs.height,
                      source: 'mesefilm'
                    });
                  }
                }
              }

              // Indavideo embed
              if (iframeSrc.includes('embed.indavideo.hu/player/video/')) {
                const ihashMatch = iframeSrc.match(/video\/([a-zA-Z0-9]+)/);
                if (ihashMatch) {
                  const iData = await extractIndavideoStreams(ihashMatch[1]);
                  const iStreams = iData?.streams || [];
                  for (const is of iStreams) {
                    const qualLabel = is.height >= 1080 ? '1080p FHD' : is.height >= 720 ? '720p HD' : `${is.height}p`;
                    streams.push({
                      name: `[HU] MeseFilm ${qualLabel}`,
                      title: `${item.title}\n🇭🇺 MeseKincstár (Indavideo) • ${qualLabel} • Magyar Rajzfilm`,
                      url: is.url,
                      quality: is.height >= 1080 ? '1080p' : is.height >= 720 ? '720p' : '480p',
                      height: is.height,
                      source: 'mesefilm'
                    });
                  }
                }
              }
            }
          }
        } catch (e) {}
        if (streams.length >= 3) break;
      }
    }
  } catch (e) {}

  return streams;
}

module.exports = {
  scrapeMeseFilm
};
