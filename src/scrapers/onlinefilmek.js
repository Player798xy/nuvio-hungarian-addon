/**
 * OnlineFilmekIngyen1.com Scraper
 * Uses DooPlay search and AJAX player options to resolve video sources.
 */

const { extractOkRuStreams, resolveVideaEmbed } = require('./filmezek');

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestDooPlayItem(results, meta) {
  if (!results || typeof results !== 'object') return null;
  const targetHu = normalize(meta.hungarianTitle);
  const targetEn = normalize(meta.englishTitle);
  const targetYear = meta.year ? parseInt(meta.year, 10) : null;
  const isSeries = !!meta.season;

  let bestItem = null;
  let bestScore = -1;

  for (const key of Object.keys(results)) {
    const item = results[key];
    if (!item || !item.url) continue;

    const isTvShow = item.url.includes('/tvshows/');

    // Check media type
    if (isSeries && !isTvShow) continue;
    if (!isSeries && isTvShow) continue;

    const itemTitle = normalize(item.title);
    const itemYear = item.extra?.date ? parseInt(item.extra.date, 10) : null;

    let score = 0;

    // Check title match
    if (itemTitle === targetHu || (targetEn && itemTitle === targetEn)) {
      score += 100;
    } else if (itemTitle.startsWith(targetHu) || targetHu.startsWith(itemTitle)) {
      score += 60;
    } else {
      const targetWords = new Set(targetHu.split(' ').filter(w => w.length > 2));
      const itemWords = new Set(itemTitle.split(' ').filter(w => w.length > 2));
      let overlap = 0;
      for (const w of targetWords) {
        if (itemWords.has(w)) overlap++;
      }
      if (overlap === 0) continue; // Completely unrelated title
      score += (overlap / Math.max(targetWords.size, 1)) * 40;
    }

    // Check year match
    if (targetYear && itemYear) {
      if (itemYear === targetYear) {
        score += 50;
      } else if (Math.abs(itemYear - targetYear) <= 1) {
        score += 20;
      } else {
        score -= 70; // Penalty for wrong sequel or unrelated movie
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 40 ? bestItem : null;
}

async function isEmbedAlive(embedUrl) {
  if (!embedUrl || !embedUrl.startsWith('http')) return false;
  try {
    const res = await fetch(embedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(3500)
    });
    if (!res.ok || res.status === 404 || res.status === 410 || res.status === 500) {
      return false;
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('html')) {
      const text = await res.text();
      if (
        text.includes('404 - Not found') ||
        text.includes('404 Not Found') ||
        text.includes('File was deleted') ||
        text.includes('The file you were looking for could not be found') ||
        text.includes('File Not Found') ||
        text.includes('Resource Not Found')
      ) {
        return false;
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function resolveDooPlayPlayer(post, nume, type, referer) {
  try {
    const body = new URLSearchParams({
      action: 'doo_player_ajax',
      post: post.toString(),
      nume: nume.toString(),
      type: type || 'movie'
    });

    const res = await fetch('https://www.onlinefilmekingyen1.com/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': referer,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: body.toString(),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.embed_url || null;
  } catch (err) {
    return null;
  }
}

async function scrapeOnlineFilmek(meta) {
  const streams = [];
  const searchTerms = [];

  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  searchTerms.push(hu);
  if (meta.englishTitle && meta.englishTitle !== hu) {
    searchTerms.push(meta.englishTitle);
  }

  for (const term of searchTerms) {
    try {
      let itemUrl = null;
      let postTitle = '';

      // 1. DooPlay search API with title & year verification
      const apiUrl = `https://www.onlinefilmekingyen1.com/wp-json/dooplay/search/?keyword=${encodeURIComponent(term)}&nonce=7b089995bb`;
      try {
        const apiRes = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://www.onlinefilmekingyen1.com/'
          },
          signal: AbortSignal.timeout(4000)
        });
        if (apiRes.ok) {
          const results = await apiRes.json();
          const matched = findBestDooPlayItem(results, meta);
          if (matched) {
            itemUrl = matched.url;
            postTitle = matched.title;
          }
        }
      } catch (e) {
        // Fallback to standard WP search
      }

      // 2. Fallback search via HTML if API failed
      if (!itemUrl) {
        const wpSearchUrl = `https://www.onlinefilmekingyen1.com/?s=${encodeURIComponent(term)}`;
        const wpRes = await fetch(wpSearchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(4000)
        });
        if (wpRes.ok) {
          const wpHtml = await wpRes.text();
          const matches = [...wpHtml.matchAll(/<div class="title"><a href="([^"]+)">([^<]+)<\/a>/g)];
          for (const m of matches) {
            const mUrl = m[1];
            const mTitle = m[2];
            const normMTitle = normalize(mTitle);
            const normHu = normalize(hu);
            if (normMTitle.includes(normHu) || normHu.includes(normMTitle)) {
              itemUrl = mUrl;
              postTitle = mTitle;
              break;
            }
          }
        }
      }

      if (!itemUrl) continue;

      // If it's a TV series, convert show url to episode url
      let targetUrl = itemUrl;
      if (meta.season && meta.episode) {
        const slugMatch = itemUrl.match(/\/tvshows\/([^/]+)\//);
        if (slugMatch) {
          const slug = slugMatch[1];
          targetUrl = `https://www.onlinefilmekingyen1.com/episodes/${slug}-${meta.season}x${meta.episode}/`;
        }
      }

      const pageRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!pageRes.ok) continue;

      const pageHtml = await pageRes.text();

      // Find player options: data-type='...' data-post='...' data-nume='...'
      const optionMatches = [...pageHtml.matchAll(/data-type=['"]([^'"]+)['"]\s+data-post=['"]([^'"]+)['"]\s+data-nume=['"]([^'"]+)['"]/g)];

      for (const m of optionMatches.slice(0, 4)) {
        const dtype = m[1];
        const post = m[2];
        const nume = m[3];

        const embedUrl = await resolveDooPlayPlayer(post, nume, dtype, targetUrl);
        if (!embedUrl) continue;

        // 1. Check if Videa embed -> decode to direct MP4
        if (embedUrl.includes('videa.hu')) {
          const vSources = await resolveVideaEmbed(embedUrl);
          for (const vs of vSources) {
            const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
            streams.push({
              name: `[HU] OnlineFilmek (Videa) ${qualLabel}`,
              title: `${postTitle || hu}\n🇭🇺 OnlineFilmekIngyen (Videa) • ${qualLabel} • Szinkron`,
              url: vs.url,
              quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
              height: vs.height,
              source: 'onlinefilmek'
            });
          }
          if (vSources.length > 0) continue;
        }

        // 2. Check if OK.ru embed -> decode to direct MP4/HLS
        if (embedUrl.includes('ok.ru/videoembed/')) {
          const okStreams = await extractOkRuStreams(embedUrl, 'OnlineFilmek');
          streams.push(...okStreams);
          continue;
        }

        // 3. Direct video file (.mp4, .m3u8)
        if (embedUrl.includes('.mp4') || embedUrl.includes('.m3u8')) {
          streams.push({
            name: `[HU] OnlineFilmek 720p`,
            title: `${postTitle || hu}\n🇭🇺 OnlineFilmekIngyen • 720p HD • Szinkron`,
            url: embedUrl,
            quality: '720p',
            height: 720,
            source: 'onlinefilmek'
          });
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
  scrapeOnlineFilmek
};
