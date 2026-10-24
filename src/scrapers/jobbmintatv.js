/**
 * JobbMintATV Scraper
 * Extracts direct Videa, Indavideo, and OK.ru streams from jobbmintatv.org / jobbmintatv.pro.
 */

const { extractVideaStreams } = require('./videa');
const { extractIndavideoStreams } = require('./indavideo');
const { extractOkRuStreams } = require('./filmezek');

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeJobbMintATV(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const searchTerms = [normalize(hu)];
  if (meta.englishTitle && normalize(meta.englishTitle) !== normalize(hu)) {
    searchTerms.push(normalize(meta.englishTitle));
  }

  const baseDomains = ['https://jobbmintatv.org', 'https://jobbmintatv.pro'];

  for (const term of searchTerms) {
    for (const baseDom of baseDomains) {
      try {
        const searchUrl = `${baseDom}/ajax.php?keres=${encodeURIComponent(term)}`;
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) continue;

        const html = await res.text();
        if (html.includes('Nincs')) continue;

        const links = [...html.matchAll(/<a href=["']([^"']+)["'][^>]*><div[^>]*>([^<]+)<\/div><\/a>/gi)].map(m => ({
          url: m[1].startsWith('//') ? 'https:' + m[1] : m[1],
          title: m[2].trim()
        }));

        if (links.length === 0) continue;

        // Find best matching item
        const normTarget = normalize(hu);
        let bestItem = null;
        let bestScore = -1;

        for (const item of links) {
          const normTitle = normalize(item.title);
          let score = 0;
          if (normTitle === normTarget) {
            score += 100;
          } else if (normTitle.startsWith(normTarget) || normTarget.startsWith(normTitle)) {
            score += 60;
          } else {
            const targetWords = normTarget.split(' ').filter(w => w.length > 2);
            const itemWords = normTitle.split(' ').filter(w => w.length > 2);
            let overlap = 0;
            for (const w of targetWords) {
              if (itemWords.includes(w)) overlap++;
            }
            if (overlap === 0) continue;
            score += (overlap / Math.max(targetWords.length, 1)) * 40;
          }

          if (score > bestScore) {
            bestScore = score;
            bestItem = item;
          }
        }

        if (!bestItem || bestScore < 40) continue;

        let targetUrl = bestItem.url;

        // If series, construct episode URL
        if (meta.season && meta.episode) {
          const s = meta.season;
          const e = meta.episode;
          // Format: /online/{slug}/{s}_evad/{e}_resz/
          const cleanUrl = targetUrl.replace(/\/+$/, '');
          targetUrl = `${cleanUrl}/${s}_evad/${e}_resz/`;
        }

        const pageRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          signal: AbortSignal.timeout(5000)
        });
        if (!pageRes.ok) continue;

        const pageHtml = await pageRes.text();
        const iframes = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);

        for (const ifr of iframes) {
          let iframeSrc = ifr.startsWith('//') ? 'https:' + ifr : ifr;

          // 1. Videa embed -> decode direct MP4s
          if (iframeSrc.includes('videa.hu/player?v=')) {
            const vcodeMatch = iframeSrc.match(/v=([a-zA-Z0-9]{16})/);
            if (vcodeMatch) {
              const vcode = vcodeMatch[1];
              const vData = await extractVideaStreams(vcode);
              const vStreams = vData?.sources || [];
              for (const vs of vStreams) {
                const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
                streams.push({
                  name: `[HU] JobbMintATV ${qualLabel}`,
                  title: `${bestItem.title}\n🇭🇺 JobbMintATV (Videa) • ${qualLabel} • Szinkron`,
                  url: vs.url,
                  quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
                  height: vs.height,
                  source: 'jobbmintatv'
                });
              }
            }
          }

          // 2. Indavideo embed -> decode direct MP4s
          if (iframeSrc.includes('embed.indavideo.hu/player/video/')) {
            const ihashMatch = iframeSrc.match(/video\/([a-zA-Z0-9]+)/);
            if (ihashMatch) {
              const ihash = ihashMatch[1];
              const iData = await extractIndavideoStreams(ihash);
              const iStreams = iData?.streams || [];
              for (const is of iStreams) {
                const qualLabel = is.height >= 1080 ? '1080p FHD' : is.height >= 720 ? '720p HD' : `${is.height}p`;
                streams.push({
                  name: `[HU] JobbMintATV (Inda) ${qualLabel}`,
                  title: `${bestItem.title}\n🇭🇺 JobbMintATV (Indavideo) • ${qualLabel} • Szinkron`,
                  url: is.url,
                  quality: is.height >= 1080 ? '1080p' : is.height >= 720 ? '720p' : '480p',
                  height: is.height,
                  source: 'jobbmintatv'
                });
              }
            }
          }

          // 3. OK.ru embed -> decode direct MP4s / HLS
          if (iframeSrc.includes('ok.ru/videoembed/')) {
            const okStreams = await extractOkRuStreams(iframeSrc, 'JobbMintATV');
            streams.push(...okStreams);
          }
        }

        if (streams.length > 0) break;
      } catch (err) {
        // Continue
      }
    }
    if (streams.length > 0) break;
  }

  return streams;
}

module.exports = {
  scrapeJobbMintATV
};
