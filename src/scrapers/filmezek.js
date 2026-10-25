/**
 * Filmezek.com Scraper
 * Extracts direct Videa and OK.ru streams from filmezek.com movies & series.
 */

const { extractVideaStreams } = require('./videa');

async function extractOkRuStreams(embedUrl, srcName = 'Filmezek') {
  try {
    const res = await fetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];

    const html = await res.text();
    const match = html.match(/data-options=["']([^"']+)["']/);
    if (!match) return [];

    const rawJson = match[1].replace(/&quot;/g, '"');
    const data = JSON.parse(rawJson);
    const meta = typeof data.flashvars?.metadata === 'string'
      ? JSON.parse(data.flashvars.metadata)
      : data.flashvars?.metadata;

    if (!meta) return [];

    const streams = [];
    if (Array.isArray(meta.videos)) {
      for (const v of meta.videos) {
        let height = 480;
        let qLabel = '480p';
        const vName = (v.name || '').toLowerCase();
        if (vName === 'ultra' || vName === 'quad' || vName === 'full' || vName === 'fhd' || vName.includes('1080')) {
          height = 1080;
          qLabel = '1080p FHD';
        } else if (vName === 'hd' || vName.includes('720')) {
          height = 720;
          qLabel = '720p HD';
        } else if (vName === 'sd' || vName.includes('480')) {
          height = 480;
          qLabel = '480p SD';
        } else {
          height = 360;
          qLabel = '360p';
        }

        streams.push({
          name: `[HU] ${srcName} (OK.ru) ${qLabel}`,
          title: `${srcName} • OK.ru ${qLabel} • Magyar Szinkron`,
          url: v.url,
          quality: height >= 1080 ? '1080p' : height >= 720 ? '720p' : '480p',
          height,
          source: srcName.toLowerCase()
        });
      }
    }

    if (meta.hlsManifestUrl) {
      streams.push({
        name: `[HU] ${srcName} (OK.ru) Auto HLS`,
        title: `${srcName} • OK.ru Multi-Quality HLS • Magyar Szinkron`,
        url: meta.hlsManifestUrl,
        quality: '720p',
        height: 720,
        source: srcName.toLowerCase()
      });
    }

    return streams;
  } catch (err) {
    return [];
  }
}

async function scrapeFilmezek(meta) {
  const streams = [];
  const searchTerms = [];

  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  // Filmezek autocomplete search handles titles very well
  searchTerms.push(hu);
  if (meta.englishTitle && meta.englishTitle !== hu) {
    searchTerms.push(meta.englishTitle);
  }

  for (const term of searchTerms) {
    try {
      const searchUrl = `https://filmezek.com/searchinput.php?searchType=1&term=${encodeURIComponent(term)}`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;

      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) continue;

      // Filter matching item by IMDb ID or title similarity
      let matchingItem = items.find(it => it.MovieCover && it.MovieCover.includes(meta.imdbId));
      if (!matchingItem) {
        if (meta.season) {
          matchingItem = items.find(it => it.type === 'online-sorozatok' && it.MovieTitle?.includes(`${meta.season}.`));
        } else {
          matchingItem = items.find(it => it.type === 'online-filmek');
        }
      }
      if (!matchingItem && items.length > 0) {
        matchingItem = items[0];
      }

      if (!matchingItem) continue;

      const pageType = matchingItem.type || (meta.season ? 'online-sorozatok' : 'online-filmek');
      const itemUrl = `https://filmezek.com/${pageType}/${matchingItem.MovieSlug}/`;

      const pageRes = await fetch(itemUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!pageRes.ok) continue;

      const pageHtml = await pageRes.text();

      // Extract embed urls from data-url attributes and iframes
      const dataUrls = [...pageHtml.matchAll(/data-url=["']([^"']+)["']/g)].map(m => m[1]);
      const iframes = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
      const allEmbeds = [...new Set([...dataUrls, ...iframes])];

      for (const embed of allEmbeds) {
        // If Videa embed
        const videaMatch = embed.match(/videa\.hu\/player\?v=([A-Za-z0-9]{16})/);
        if (videaMatch) {
          const vcode = videaMatch[1];
          const vData = await extractVideaStreams(vcode);
          const vStreams = vData?.sources || [];
          for (const vs of vStreams) {
            const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
            streams.push({
              name: `[HU] Filmezek ${qualLabel}`,
              title: `${matchingItem.MovieTitle}\n🇭🇺 Filmezek.com (Videa) • ${qualLabel} • Szinkron`,
              url: vs.url,
              quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
              height: vs.height,
              source: 'filmezek'
            });
          }
        }

        // If OK.ru embed
        if (embed.includes('ok.ru/videoembed/')) {
          const okStreams = await extractOkRuStreams(embed);
          streams.push(...okStreams);
        }
      }

      if (streams.length > 0) break;
    } catch (e) {
      // Continue
    }
  }

  return streams;
}

module.exports = {
  scrapeFilmezek,
  extractOkRuStreams
};
