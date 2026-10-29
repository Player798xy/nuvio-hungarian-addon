/**
 * DMDAMedia Scraper (dmdamedia.hu)
 * Scrapes movies and series from dmdamedia.hu and resolves direct streams and hosters.
 * Supports Videa, Indavideo, Filemoon / Byse, VOE, Vidmoly, StreamRuby, and other major video hosters.
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

/**
 * Normalizes hoster URLs (Filemoon, Byse, VOE, Vidmoly, StreamRuby, etc.)
 */
function formatDMDAMediaHosterStream(embedUrl, cleanTitle) {
  if (!embedUrl) return null;
  const locLower = embedUrl.toLowerCase();

  let hosterName = 'Hoster';
  let height = 720;
  let finalUrl = embedUrl.startsWith('//') ? 'https:' + embedUrl : embedUrl;

  // 1. Filemoon & Byse mirrors
  if (locLower.includes('filemoon') || locLower.includes('byse')) {
    hosterName = 'Filemoon';
    height = 720;
    const fMatch = embedUrl.match(/(?:filemoon\.(?:to|sx|org|me)|byse[a-z0-9]*\.(?:com|to))\/(?:d\/|e\/)?([a-zA-Z0-9]+)/i);
    if (fMatch) {
      finalUrl = embedUrl.startsWith('http') ? embedUrl : 'https:' + embedUrl;
    }
  }
  // 2. VOE
  else if (locLower.includes('voe.sx') || locLower.includes('voe.')) {
    hosterName = 'VOE';
    height = 1080;
    const voeMatch = embedUrl.match(/voe\.(?:sx|net|to|org)\/(?:e\/)?([a-zA-Z0-9]+)/i);
    if (voeMatch) finalUrl = `https://voe.sx/e/${voeMatch[1]}`;
  }
  // 3. Vidmoly
  else if (locLower.includes('vidmoly')) {
    hosterName = 'Vidmoly';
    height = 720;
    const vMatch = embedUrl.match(/vidmoly\.(?:me|to|net|biz|org)\/(?:embed-|w\/|v\/|dl\/)?([0-9a-zA-Z]+)/i);
    if (vMatch) finalUrl = `https://vidmoly.me/embed-${vMatch[1]}.html`;
  }
  // 4. StreamRuby
  else if (locLower.includes('streamruby') || locLower.includes('rubystream') || locLower.includes('rubyvidhub')) {
    hosterName = 'StreamRuby';
    height = 720;
    const sMatch = embedUrl.match(/(?:streamruby|sruby|rubystream|rubyvidhub)\.(?:com|xyz|buzz)\/(?:embed-|e\/|d\/)?([a-zA-Z0-9]+)/i);
    if (sMatch) finalUrl = `https://streamruby.com/embed-${sMatch[1]}.html`;
  }
  // 5. Vinovo
  else if (locLower.includes('vinovo')) {
    hosterName = 'Vinovo';
    height = 720;
  }
  // 6. Vidara
  else if (locLower.includes('vidara')) {
    hosterName = 'Vidara';
    height = 720;
  }
  // 7. Mixdrop
  else if (locLower.includes('mixdrop') || locLower.includes('mxdrop')) {
    hosterName = 'Mixdrop';
    height = 720;
  }
  // 8. Upstream
  else if (locLower.includes('upstream')) {
    hosterName = 'Upstream';
    height = 720;
  }
  // 9. Waaw / Netu
  else if (locLower.includes('waaw') || locLower.includes('netu')) {
    hosterName = 'Netu / Waaw';
    height = 720;
  }
  // 10. DoodStream
  else if (locLower.includes('dood') || locLower.includes('ds2play')) {
    hosterName = 'DoodStream';
    height = 720;
  }
  // 11. Generic fallback
  else {
    try {
      const u = new URL(finalUrl);
      hosterName = u.hostname.replace(/^www\./, '');
    } catch (e) {
      hosterName = 'Hoster';
    }
  }

  const qualBadge = height >= 1080 ? '1080p FHD' : '720p HD';
  return {
    name: `[HU] DMDAMedia (${hosterName}) ${qualBadge}`,
    title: `${cleanTitle} [${qualBadge}]\n🇭🇺 DMDAMedia / ${hosterName} • Szinkron • Közvetlen Lejátszó`,
    url: finalUrl,
    externalUrl: finalUrl,
    playerUrl: finalUrl,
    quality: height >= 1080 ? '1080p' : '720p',
    height: height,
    source: 'dmdamedia',
    behaviorHints: { bingeGroup: `hu-dmdamedia-${hosterName.toLowerCase()}` }
  };
}

const EXCLUDED_PATHS = new Set([
  '/filmek', '/sorozatok', '/hirek', '/kapcsolat', '/belepes',
  '/regisztracio', '/kereses', '/top-filmek', '/top-sorozatok',
  '/rolunk', '/kategoria', '/szineszek', '/cdn-cgi'
]);

async function scrapeDMDAMedia(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const searchQueries = new Set();
  searchQueries.add(hu.trim());

  if (meta.englishTitle) {
    searchQueries.add(meta.englishTitle.trim());
  }

  // If title has a dash, e.g. "Wild Wild West - Vadiúj vadnyugat"
  if (hu.includes(' - ')) {
    const parts = hu.split(' - ').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.length >= 3) searchQueries.add(part);
    }
  }

  for (const q of searchQueries) {
    try {
      const body = new URLSearchParams({ search: q }).toString();
      const sRes = await fetch('https://dmdamedia.hu/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body,
        signal: AbortSignal.timeout(4500)
      });
      if (!sRes.ok) continue;

      const html = await sRes.text();
      const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => ({
          url: m[1].split('?')[0],
          title: m[2].replace(/<[^>]+>/g, '').trim()
        }))
        .filter(l => {
          if (!l.url.startsWith('/') || l.url.length <= 2) return false;
          if (EXCLUDED_PATHS.has(l.url.toLowerCase())) return false;
          if (l.url.startsWith('/kategoria') || l.url.startsWith('/szineszek') || l.url.startsWith('/cdn-cgi')) return false;
          return true;
        });

      if (links.length === 0) continue;

      // Prefer links containing _film or _sorozat, or matching target title
      const normTarget = normalize(hu);
      const isSeries = Boolean(meta.season && meta.episode);

      const scored = links.map(item => {
        let score = 0;
        const normItem = normalize(item.title);
        if (normItem === normTarget) score += 100;
        else if (normItem.includes(normTarget) || normTarget.includes(normItem)) score += 50;

        if (isSeries && item.url.includes('_sorozat')) score += 30;
        if (!isSeries && item.url.includes('_film')) score += 30;

        return { ...item, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const candidates = scored.slice(0, 3);

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
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(5000)
          });
          if (!pageRes.ok) return;

          const pageHtml = await pageRes.text();
          const iframes = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);

          // Also check server tabs (?a=filemoon#lejatszo, ?a=inda#lejatszo, ?a=videa#lejatszo, etc.)
          const tabMatches = [...pageHtml.matchAll(/href=["'](\?a=[^"'#]+)(?:#[^"']*)?["']/gi)].map(m => m[1]);
          const uniqueTabs = [...new Set(tabMatches)].slice(0, 3);

          if (uniqueTabs.length > 0) {
            await Promise.all(uniqueTabs.map(async (tab) => {
              try {
                const tabUrl = targetUrl + tab;
                const tRes = await fetch(tabUrl, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                  signal: AbortSignal.timeout(3000)
                });
                if (tRes.ok) {
                  const tHtml = await tRes.text();
                  const tIframes = [...tHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
                  for (const ti of tIframes) {
                    if (!iframes.includes(ti)) iframes.push(ti);
                  }
                }
              } catch (e) {}
            }));
          }

          const seenUrls = new Set();
          let cleanItemTitle = (item.title || hu)
            .replace(/\r?\n/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^(?:Film|Sorozat)\s+(?:[0-9.]+\s+)?/i, '')
            .replace(/\s+\d{4}$/, '')
            .trim();
          if (!cleanItemTitle || cleanItemTitle.length < 2) cleanItemTitle = hu;

          for (const ifr of iframes) {
            let iframeSrc = ifr.startsWith('//') ? 'https:' + ifr : ifr;
            if (seenUrls.has(iframeSrc)) continue;
            seenUrls.add(iframeSrc);

            // 1. Videa embed (Direct MP4 extraction)
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
                    title: `${cleanItemTitle}\n🇭🇺 DMDAMedia (Videa) • ${qualLabel} • Szinkron`,
                    url: vs.url,
                    quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
                    height: vs.height,
                    source: 'dmdamedia'
                  });
                }
                continue;
              }
            }

            // 2. Indavideo embed (Direct MP4 extraction)
            if (iframeSrc.includes('embed.indavideo.hu/player/video/') || iframeSrc.includes('indavideo.hu/player/video/')) {
              const ihashMatch = iframeSrc.match(/video\/([a-zA-Z0-9]+)/);
              if (ihashMatch) {
                const ihash = ihashMatch[1];
                const iData = await extractIndavideoStreams(ihash);
                const iStreams = iData?.streams || iData?.sources || [];
                for (const is of iStreams) {
                  const qualLabel = is.height >= 1080 ? '1080p FHD' : is.height >= 720 ? '720p HD' : `${is.height}p`;
                  streams.push({
                    name: `[HU] DMDAMedia ${qualLabel}`,
                    title: `${cleanItemTitle}\n🇭🇺 DMDAMedia (Indavideo) • ${qualLabel} • Szinkron`,
                    url: is.url,
                    quality: is.height >= 1080 ? '1080p' : is.height >= 720 ? '720p' : '480p',
                    height: is.height,
                    source: 'dmdamedia'
                  });
                }
                continue;
              }
            }

            // 3. Supported hosters (Filemoon, Byse, VOE, Vidmoly, StreamRuby, etc.)
            const hosterStream = formatDMDAMediaHosterStream(iframeSrc, cleanItemTitle);
            if (hosterStream) {
              streams.push(hosterStream);
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
  scrapeDMDAMedia,
  formatDMDAMediaHosterStream
};
