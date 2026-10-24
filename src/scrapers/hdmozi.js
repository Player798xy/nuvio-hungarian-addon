/**
 * HDMozi.hu Scraper
 * Extracts streams from hdmozi.hu movies and series.
 */

const { extractVideaStreams } = require('./videa');
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

async function resolveHDMoziPlayer(post, nume, type, referer) {
  try {
    const body = new URLSearchParams({
      action: 'doo_player_ajax',
      post: post.toString(),
      nume: nume.toString(),
      type: type || 'movie'
    });

    const res = await fetch('https://hdmozi.hu/wp-admin/admin-ajax.php', {
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
    let embed = data?.embed_url;
    if (embed && embed.startsWith('//')) {
      embed = 'https:' + embed;
    }
    return embed || null;
  } catch (err) {
    return null;
  }
}

async function scrapeHDMozi(meta) {
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
      const searchUrl = `https://hdmozi.hu/?s=${encodeURIComponent(term)}`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;

      const html = await res.text();
      const results = [...html.matchAll(/<div class="title"><a href="([^"]+)">([^<]+)<\/a>/g)].map(m => ({
        url: m[1],
        title: m[2]
      }));

      if (results.length === 0) continue;

      // Select best matching result
      const targetHu = normalize(hu);
      let bestResult = null;
      let bestScore = -1;

      for (const r of results) {
        const normTitle = normalize(r.title);
        let score = 0;
        if (normTitle === targetHu) {
          score += 100;
        } else if (normTitle.startsWith(targetHu) || targetHu.startsWith(normTitle)) {
          score += 60;
        } else if (normTitle.includes(targetHu) || targetHu.includes(normTitle)) {
          score += 40;
        }
        if (score > bestScore) {
          bestScore = score;
          bestResult = r;
        }
      }

      if (!bestResult || bestScore < 40) continue;

      let targetUrl = bestResult.url;
      let postTitle = bestResult.title;

      // If series, handle episode URL
      if (meta.season && meta.episode) {
        const showResult = results.find(r => r.url.includes('/tvshows/')) || bestResult;
        const slugMatch = showResult.url.match(/\/tvshows\/([^/]+)\//);
        if (slugMatch) {
          const rawSlug = slugMatch[1].replace(/1-3-evad|1-evad|2-evad|3-evad/g, '').replace(/-+$/, '');
          targetUrl = `https://hdmozi.hu/episodes/${rawSlug}-${meta.season}x${meta.episode}/`;
        }
      }

      const pageRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!pageRes.ok) continue;

      const pageHtml = await pageRes.text();
      const optionMatches = [...pageHtml.matchAll(/class=['"](?:dooplay_player_option[^\'"]*|player_option[^\'"]*)['"]\s+data-type=['"]([^'"]+)['"]\s+data-post=['"]([^'"]+)['"]\s+data-nume=['"]([^'"]+)['"]/g)];

      for (const m of optionMatches.slice(0, 3)) {
        const dtype = m[1];
        const post = m[2];
        const nume = m[3];

        const embedUrl = await resolveHDMoziPlayer(post, nume, dtype, targetUrl);
        if (!embedUrl) continue;

        // 1. If Videa embed
        const videaMatch = embedUrl.match(/videa\.hu\/player\?v=([A-Za-z0-9]{16})/);
        if (videaMatch) {
          const vcode = videaMatch[1];
          const vData = await extractVideaStreams(vcode);
          const vStreams = vData?.sources || [];
          for (const vs of vStreams) {
            const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
            streams.push({
              name: `[HU] HDMozi ${qualLabel}`,
              title: `${postTitle || hu}\n🇭🇺 HDMozi.hu (Videa) • ${qualLabel} • Szinkron`,
              url: vs.url,
              quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
              height: vs.height,
              source: 'hdmozi'
            });
          }
          continue;
        }

        // 2. If OK.ru embed
        if (embedUrl.includes('ok.ru/videoembed/')) {
          const okStreams = await extractOkRuStreams(embedUrl, 'HDMozi');
          streams.push(...okStreams);
          continue;
        }

        // 3. Other hosts -> check if alive
        const alive = await isEmbedAlive(embedUrl);
        if (!alive) {
          console.log(`[HDMozi] Filtered dead/404 embed: ${embedUrl}`);
          continue;
        }

        streams.push({
          name: `[HU] HDMozi 720p`,
          title: `${postTitle || hu}\n🇭🇺 HDMozi.hu • 720p • Magyar Szinkron`,
          url: embedUrl,
          quality: '720p',
          height: 720,
          source: 'hdmozi'
        });
      }

      if (streams.length > 0) break;
    } catch (e) {
      // Continue
    }
  }

  return streams;
}

module.exports = {
  scrapeHDMozi
};
