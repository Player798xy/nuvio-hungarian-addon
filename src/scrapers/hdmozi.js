/**
 * HDMozi.hu Scraper with RPM Stream Integration
 * Ported from Thsandorh/Hd-mozi-scraper (MIT License)
 * Resolves movies and TV series episodes, extracts DooPlayer/RPM IDs,
 * and decrypts direct HLS (.m3u8) streams from rpmshare.rpmstream.live.
 */

const { extractRpmStream } = require('../utils/rpm');
const { extractVideaStreams } = require('./videa');

const HDMOZI_BASE = 'https://hdmozi.hu';
const HDMOZI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[áàâäã]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôöőõ]/g, 'o')
    .replace(/[úùûüűũ]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function createHdmoziUrl(mediaInfo, season = null, episode = null) {
  try {
    let urlTitle = (mediaInfo.title || '')
      .toLowerCase()
      .replace(/[áàâäã]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòôöőõ]/g, 'o')
      .replace(/[úùûüűũ]/g, 'u')
      .replace(/[ýÿ]/g, 'y')
      .replace(/[\/\:\.\,\;\!\?\(\)\[\]]/g, '-')
      .replace(/[^a-z0-9\s\-]/g, '')
      .replace(/[\s\-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!urlTitle) return null;

    if (mediaInfo.type === 'movie') {
      return `${HDMOZI_BASE}/movies/${urlTitle}/`;
    } else if (mediaInfo.type === 'series' && season && episode) {
      return `${HDMOZI_BASE}/episodes/${urlTitle}-${season}x${episode}/`;
    } else if (mediaInfo.type === 'series') {
      return `${HDMOZI_BASE}/tvshows/${urlTitle}/`;
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function resolveHdmoziUrl(mediaInfo, season = null, episode = null) {
  try {
    const query = encodeURIComponent(mediaInfo.title);
    const searchUrl = `${HDMOZI_BASE}/?s=${query}`;

    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': HDMOZI_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (!resp.ok) return createHdmoziUrl(mediaInfo, season, episode);

    const html = await resp.text();
    const results = [];
    const detailsPattern = /<div class="details">([\s\S]*?)<\/div>\s*<\/div>/gi;
    let m;
    while ((m = detailsPattern.exec(html)) !== null) {
      const block = m[1];
      const titleMatch = block.match(/<div class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/i);
      if (!titleMatch) continue;
      const href = titleMatch[1];
      const title = titleMatch[2].trim();
      const yearMatch = block.match(/<span class="year">\s*(\d{4})\s*<\/span>/i);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const type = href.includes('/movies/') ? 'movie' : (
        (href.includes('/series/') || href.includes('/tvshows/') || href.includes('/episodes/')) ? 'series' : 'unknown'
      );
      results.push({ href, title, year, type });
    }

    if (!results.length) {
      return createHdmoziUrl(mediaInfo, season, episode);
    }

    const targetTitle = normalize(mediaInfo.title);
    const scored = results.map(r => {
      const rt = normalize(r.title);
      let score = 0;
      if (rt === targetTitle) score += 100;
      else if (rt.includes(targetTitle) || targetTitle.includes(rt)) score += 60;
      if (mediaInfo.year && r.year) {
        const diff = Math.abs(mediaInfo.year - r.year);
        score += Math.max(0, 30 - diff * 10);
      }
      if (mediaInfo.type === r.type) score += 15;
      if (r.href.includes('/movies/') || r.href.includes('/series/') || r.href.includes('/tvshows/')) score += 5;
      return { ...r, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score < 40) {
      return createHdmoziUrl(mediaInfo, season, episode);
    }

    let finalUrl = best.href;
    if (mediaInfo.type === 'series' && season && episode) {
      const href = best.href.replace(/\/$/, '');
      const lastSeg = href.split('/').pop();
      let seriesSlug;

      if (href.includes('/series/') || href.includes('/tvshows/')) {
        seriesSlug = lastSeg;
      } else if (href.includes('/episodes/')) {
        const mSlug = lastSeg.match(/(.+)-\d+x\d+$/);
        seriesSlug = mSlug ? mSlug[1] : lastSeg;
      } else {
        return createHdmoziUrl(mediaInfo, season, episode);
      }

      finalUrl = `${HDMOZI_BASE}/episodes/${seriesSlug}-${season}x${episode}/`;
    }

    return finalUrl;
  } catch (e) {
    return createHdmoziUrl(mediaInfo, season, episode);
  }
}

async function extractRpmIdFromDooPlayer(hdmoziUrl, html) {
  try {
    const postIdMatch = html.match(/data-post\s*=\s*['"](\d+)['"]/) ||
      html.match(/post_id['"]\s*:\s*['"]*(\d+)['"]*/) ||
      html.match(/"post"\s*:\s*(\d+)/) ||
      html.match(/postid['"]\s*:\s*['"]*(\d+)['"]*/) ||
      html.match(/wp-post-(\d+)/) ||
      html.match(/player-option[^>]*data-post\s*=\s*['"](\d+)['"]/);

    if (!postIdMatch) return null;
    const postId = postIdMatch[1];

    let adminAjaxUrl = null;
    let restApiUrl = null;
    let playMethod = null;
    try {
      const dtAjaxBlock = html.match(/var\s+dtAjax\s*=\s*(\{[\s\S]*?\})\s*;/i) || html.match(/dtAjax\s*=\s*(\{[\s\S]*?\})/i);
      if (dtAjaxBlock && dtAjaxBlock[1]) {
        const json = JSON.parse(dtAjaxBlock[1].replace(/\\\//g, '/'));
        adminAjaxUrl = json.url || null;
        restApiUrl = json.player_api || null;
        playMethod = json.play_method ? String(json.play_method).toLowerCase() : null;
      }
    } catch (e) {}

    const absolutize = (u) => {
      if (!u) return null;
      if (u.startsWith('http://') || u.startsWith('https://')) return u;
      if (u.startsWith('//')) return `https:${u}`;
      try { return new URL(u, HDMOZI_BASE).href; } catch { return u; }
    };

    let apiUrl = null;
    if (playMethod && playMethod.includes('admin') && adminAjaxUrl) {
      apiUrl = absolutize(adminAjaxUrl);
    } else if (restApiUrl) {
      apiUrl = absolutize(restApiUrl);
    }
    if (!apiUrl) apiUrl = `${HDMOZI_BASE}/wp-admin/admin-ajax.php`;

    let dooType = /\/episodes\//.test(hdmoziUrl) ? 'tv' : 'movie';
    const typeMatch = html.match(/player-option[^>]*data-type=['"](\w+)['"]/i);
    if (typeMatch) dooType = typeMatch[1];

    const nums = [];
    for (const match of html.matchAll(/player-option[^>]*data-nume=['"](\d+)['"]/g)) {
      nums.push(match[1]);
    }
    if (nums.length === 0) nums.push('1', '2', '3');

    for (const nume of nums.slice(0, 3)) {
      try {
        let resp;
        if (apiUrl.includes('admin-ajax.php')) {
          const body = new URLSearchParams({
            action: 'doo_player_ajax',
            post: postId,
            nume: nume,
            type: dooType
          });
          resp = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'User-Agent': HDMOZI_UA,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Referer': hdmoziUrl,
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: body.toString(),
            signal: AbortSignal.timeout(4000)
          });
        } else {
          const target = `${apiUrl.replace(/\/$/, '')}/${postId}/${dooType}/${nume}`;
          resp = await fetch(target, {
            headers: {
              'User-Agent': HDMOZI_UA,
              'Referer': hdmoziUrl,
              'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(4000)
          });
        }

        if (!resp || !resp.ok) continue;
        const text = await resp.text();
        let embed = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed.embed_url) embed = parsed.embed_url;
        } catch (_) {}

        // 1) Direct RPM ID in embed URL or HTML
        const rpmMatch = embed.match(/rpmshare\.rpmstream\.live\/#([a-zA-Z0-9_-]+)/i);
        if (rpmMatch) return rpmMatch[1];

        // 2) Videa in embed
        const vMatch = embed.match(/videa\.hu\/player\?[^"'\s>]*v=([A-Za-z0-9_-]{6,})/i) ||
          embed.match(/videa\.hu\/static\/.*?[?&]v=([A-Za-z0-9_-]{6,})/i);
        if (vMatch) return `videa:${vMatch[1]}`;
      } catch (err) {}
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function extractRpmIdFromHdmozi(hdmoziUrl) {
  try {
    const response = await fetch(hdmoziUrl, {
      headers: {
        'User-Agent': HDMOZI_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(4500)
    });

    if (!response.ok) {
      // If episode was 404, try stripping year suffix
      const m = hdmoziUrl.match(/\/episodes\/([^\/]+)-(\d+)x(\d+)\/?$/);
      if (response.status === 404 && m) {
        const seriesSlug = m[1];
        const season = m[2];
        const episode = m[3];
        const slugNoYear = seriesSlug.replace(/-\d{4}$/, '');
        if (slugNoYear !== seriesSlug) {
          const noYearUrl = `${HDMOZI_BASE}/episodes/${slugNoYear}-${season}x${episode}/`;
          const noYearResp = await fetch(noYearUrl, {
            headers: { 'User-Agent': HDMOZI_UA },
            signal: AbortSignal.timeout(3500)
          });
          if (noYearResp.ok) return await extractRpmIdFromHdmozi(noYearUrl);
        }
      }
      return null;
    }

    const html = await response.text();

    // 1) Direct iframe src match
    const iframeMatch = html.match(/<iframe[^>]*src=["'](?:https?:)?\/\/rpmshare\.rpmstream\.live\/#([a-zA-Z0-9_-]+)["'][^>]*>/i);
    if (iframeMatch) return iframeMatch[1];

    const srcMatch = html.match(/src=["']([^"']*rpmshare\.rpmstream\.live[^"']*)["']/i);
    if (srcMatch) {
      try {
        const raw = srcMatch[1];
        const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
        const urlObj = new URL(normalized);
        const frag = (urlObj.hash || '').replace(/^#/, '');
        if (frag) return frag;
      } catch (e) {}
    }

    // 2) Videa in page
    const vMatch = html.match(/videa\.hu\/player\?[^"'\s>]*v=([A-Za-z0-9_-]{6,})/i);
    if (vMatch) return `videa:${vMatch[1]}`;

    // 3) DooPlayer API
    const dooPlayerRpm = await extractRpmIdFromDooPlayer(hdmoziUrl, html);
    if (dooPlayerRpm) return dooPlayerRpm;

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Main scraper entry point for HDMozi
 */
async function scrapeHDMozi(meta) {
  const streams = [];
  try {
    const title = meta.hungarianTitle || meta.englishTitle;
    if (!title) return streams;

    const isSeries = Boolean(meta.season && meta.episode);
    const mediaInfo = {
      title,
      type: isSeries ? 'series' : (meta.type || 'movie'),
      year: meta.year ? parseInt(meta.year, 10) : null
    };

    let hdmoziUrl = await resolveHdmoziUrl(mediaInfo, meta.season, meta.episode);
    if (!hdmoziUrl && meta.englishTitle && meta.englishTitle !== title) {
      mediaInfo.title = meta.englishTitle;
      hdmoziUrl = await resolveHdmoziUrl(mediaInfo, meta.season, meta.episode);
    }

    if (!hdmoziUrl) return streams;

    const rpmId = await extractRpmIdFromHdmozi(hdmoziUrl);
    if (!rpmId) return streams;

    // Videa fallback
    if (typeof rpmId === 'string' && (rpmId.startsWith('videa:') || /^[a-zA-Z0-9]{16}$/.test(rpmId))) {
      const vId = rpmId.replace(/^videa:/, '');
      const vData = await extractVideaStreams(vId);
      const vSources = vData?.sources || [];
      for (const vs of vSources) {
        const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
        streams.push({
          name: `[HU] HDMozi ${qualLabel}`,
          title: `${title} [${qualLabel}]\n🇭🇺 HDMozi (Videa) • ${qualLabel} • Szinkron`,
          url: vs.url,
          playerUrl: vs.url,
          quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
          height: vs.height,
          source: 'hdmozi',
          behaviorHints: { bingeGroup: `hu-hdmozi-${qualLabel}` }
        });
      }
      return streams;
    }

    // RPM direct HLS streams
    const rpmResult = await extractRpmStream(rpmId);
    const rpmStreams = rpmResult?.streams || [];

    for (const s of rpmStreams) {
      let height = s.height || 720;
      let qualBadge = s.quality || '720p HD';
      if (qualBadge.includes('1080') || height >= 1080) {
        height = 1080;
        qualBadge = '1080p FHD';
      } else if (qualBadge.includes('720') || height >= 720) {
        height = 720;
        qualBadge = '720p HD';
      } else if (qualBadge.includes('480') || height >= 480) {
        height = 480;
        qualBadge = '480p';
      } else if (qualBadge.includes('2160') || qualBadge.includes('4k')) {
        height = 2160;
        qualBadge = '4K UHD';
      }

      streams.push({
        name: `[HU] HDMozi ${qualBadge}`,
        title: `${title} [${qualBadge}]\n🇭🇺 HDMozi / RPM • ${qualBadge} • Szinkron • Közvetlen HLS`,
        url: s.url,
        playerUrl: s.url,
        quality: height >= 1080 ? '1080p' : '720p',
        height: height,
        source: 'hdmozi',
        behaviorHints: { bingeGroup: `hu-hdmozi-${qualBadge}` }
      });
    }

    console.log(`[HDMozi] Extracted ${streams.length} stream(s) for "${title}"`);
  } catch (err) {
    console.warn('[HDMozi] Scraper error:', err.message);
  }
  return streams;
}

module.exports = {
  scrapeHDMozi,
  resolveHdmoziUrl,
  extractRpmIdFromHdmozi
};
