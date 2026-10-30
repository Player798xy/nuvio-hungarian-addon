/**
 * Filmezek.com Scraper
 * Extracts direct Videa, OK.ru, and third-party hoster streams from filmezek.com movies & series.
 */

const { extractVideaStreams, extractVideaFCodeStreams, isTitleMatch } = require('./videa');

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

/**
 * Resolves a Videa embed URL to direct stream sources.
 * Handles ?v=16char, /videok/.*-16char, ?f=fcode, and iframe players.
 */
async function resolveVideaEmbed(embedUrl) {
  const cleanUrl = embedUrl.replace(/&amp;/g, '&');

  // 1. Check direct 16-character vcode in query parameter (?v=... or &v=...)
  const vParam = cleanUrl.match(/[?&]v=([A-Za-z0-9]{16})/);
  if (vParam) {
    try {
      const vData = await extractVideaStreams(vParam[1]);
      if (vData?.sources?.length) return vData.sources;
    } catch (e) {}
  }

  // 2. Check /videok/.*-16char
  const pathMatch = cleanUrl.match(/\/videok\/.*-([A-Za-z0-9]{16})/);
  if (pathMatch) {
    try {
      const vData = await extractVideaStreams(pathMatch[1]);
      if (vData?.sources?.length) return vData.sources;
    } catch (e) {}
  }

  // 3. Check ?f=fcode (e.g. ?f=8.3068504.1958019.0)
  const fParam = cleanUrl.match(/[?&]f=([^&"'\s>]+)/);
  if (fParam) {
    const fcode = decodeURIComponent(fParam[1]);
    try {
      const fData = await extractVideaFCodeStreams(fcode);
      if (fData?.sources?.length) return fData.sources;
    } catch (e) {}
  }

  // 4. Fetch player HTML to extract internal vcode or fallback sources
  if (cleanUrl.includes('videa.hu/player')) {
    try {
      const resp = await fetch(cleanUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) {
        const html = await resp.text();
        const vcodeMatch = html.match(/vcode\s*=\s*["']([A-Za-z0-9]{16})["']/);
        if (vcodeMatch) {
          const vData = await extractVideaStreams(vcodeMatch[1]);
          if (vData?.sources?.length) return vData.sources;
        }
      }
    } catch (e) {}
  }

  return [];
}

async function scrapeFilmezek(meta) {
  const streams = [];
  const searchTerms = [];

  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  // Filmezek autocomplete search handles titles very well
  searchTerms.push(hu);
  const strippedHu = hu.replace(/^(?:A|Az)\s+/i, '');
  if (strippedHu !== hu) searchTerms.push(strippedHu);

  if (meta.englishTitle && meta.englishTitle !== hu) {
    searchTerms.push(meta.englishTitle);
    const strippedEn = meta.englishTitle.replace(/^(?:The|A|An)\s+/i, '');
    if (strippedEn !== meta.englishTitle) searchTerms.push(strippedEn);
  }

  const seenUrls = new Set();

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
      const isSeries = Boolean(meta.season);
      let matchingItem = items.find(it => it.MovieCover && meta.imdbId && it.MovieCover.includes(meta.imdbId));
      if (!matchingItem) {
        matchingItem = items.find(it => {
          const title = it.MovieTitle || it.value || it.label || '';
          if (isSeries && it.type === 'online-sorozatok') {
            return isTitleMatch(hu, title, meta.year, true) && (!meta.season || title.includes(`${meta.season}.`));
          }
          if (!isSeries && it.type === 'online-filmek') {
            return isTitleMatch(hu, title, meta.year, false);
          }
          return false;
        });
      }

      if (!matchingItem) continue;

      const pageType = matchingItem.type || (meta.season ? 'online-sorozatok' : 'online-filmek');
      const itemUrl = `https://filmezek.com/${pageType}/${matchingItem.MovieSlug}/`;

      const pageRes = await fetch(itemUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      });
      if (!pageRes.ok) continue;

      const pageHtml = await pageRes.text();

      // Extract embed urls from data-url attributes and iframes
      const dataUrls = [...pageHtml.matchAll(/data-url=["']([^"']+)["']/g)].map(m => m[1]);
      const iframes = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
      const allEmbeds = [...new Set([...dataUrls, ...iframes])];

      for (const embed of allEmbeds) {
        // A. Videa embed
        if (embed.includes('videa.hu')) {
          const vSources = await resolveVideaEmbed(embed);
          for (const vs of vSources) {
            if (seenUrls.has(vs.url)) continue;
            seenUrls.add(vs.url);

            const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
            streams.push({
              name: `[HU] Filmezek (Videa) ${qualLabel}`,
              title: `${matchingItem.MovieTitle}\n🇭🇺 Filmezek.com (Videa) • ${qualLabel} • Szinkron`,
              url: vs.url,
              quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
              height: vs.height,
              source: 'filmezek',
              behaviorHints: { bingeGroup: `hu-filmezek-videa-${qualLabel}` }
            });
          }
          continue;
        }

        // B. OK.ru embed
        if (embed.includes('ok.ru/videoembed/') || embed.includes('ok.ru/video/')) {
          const okStreams = await extractOkRuStreams(embed, 'Filmezek');
          for (const os of okStreams) {
            if (seenUrls.has(os.url)) continue;
            seenUrls.add(os.url);
            streams.push(os);
          }
          continue;
        }

        // C. Other video hosters (Filemoon, VOE, Streamruby, Vidmoly, etc.)
        const locLower = embed.toLowerCase();
        let hosterName = null;
        if (locLower.includes('filemoon')) hosterName = 'Filemoon';
        else if (locLower.includes('voe.sx')) hosterName = 'VOE';
        else if (locLower.includes('vidmoly')) hosterName = 'Vidmoly';
        else if (locLower.includes('streamruby') || locLower.includes('rubystream')) hosterName = 'StreamRuby';
        else if (locLower.includes('streamwish')) hosterName = 'Streamwish';
        else if (locLower.includes('dood')) hosterName = 'DoodStream';
        else if (locLower.includes('mixdrop')) hosterName = 'Mixdrop';

        if (hosterName) {
          const cleanEmbed = embed.replace(/&amp;/g, '&');
          if (!seenUrls.has(cleanEmbed)) {
            seenUrls.add(cleanEmbed);
            streams.push({
              name: `[HU] Filmezek (${hosterName}) 720p HD`,
              title: `${matchingItem.MovieTitle} [720p HD]\n🇭🇺 Filmezek.com (${hosterName}) • Szinkron • Közvetlen Lejátszó`,
              url: cleanEmbed,
              playerUrl: cleanEmbed,
              quality: '720p',
              height: 720,
              source: 'filmezek',
              behaviorHints: { bingeGroup: `hu-filmezek-${hosterName.toLowerCase()}` }
            });
          }
        }
      }

      if (streams.length > 0) break;
    } catch (e) {
      // Continue to next search term
    }
  }

  return streams;
}

module.exports = {
  scrapeFilmezek,
  extractOkRuStreams,
  resolveVideaEmbed
};
