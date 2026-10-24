/**
 * OnlineFilmekIngyen1.com Scraper
 * Uses DooPlay search and AJAX player options to resolve video sources.
 */

const { extractVideaStreams } = require('./videa');

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
      // DooPlay search API
      let itemUrl = null;
      let postTitle = '';

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
          if (results && typeof results === 'object') {
            const keys = Object.keys(results);
            if (keys.length > 0) {
              // If series, look for tvshow
              if (meta.season) {
                const tvKey = keys.find(k => results[k]?.url?.includes('/tvshows/'));
                if (tvKey) {
                  itemUrl = results[tvKey].url;
                  postTitle = results[tvKey].title;
                }
              } else {
                const movKey = keys.find(k => results[k]?.url?.includes('/movies/'));
                if (movKey) {
                  itemUrl = results[movKey].url;
                  postTitle = results[movKey].title;
                }
              }
              if (!itemUrl && keys[0]) {
                itemUrl = results[keys[0]].url;
                postTitle = results[keys[0]].title;
              }
            }
          }
        }
      } catch (e) {
        // Fallback to standard WP search
      }

      // Fallback search via HTML if API failed
      if (!itemUrl) {
        const wpSearchUrl = `https://www.onlinefilmekingyen1.com/?s=${encodeURIComponent(term)}`;
        const wpRes = await fetch(wpSearchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(4000)
        });
        if (wpRes.ok) {
          const wpHtml = await wpRes.text();
          const match = wpHtml.match(/<div class="title"><a href="([^"]+)">([^<]+)<\/a>/);
          if (match) {
            itemUrl = match[1];
            postTitle = match[2];
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

      for (const m of optionMatches.slice(0, 3)) {
        const dtype = m[1];
        const post = m[2];
        const nume = m[3];

        const embedUrl = await resolveDooPlayPlayer(post, nume, dtype, targetUrl);
        if (!embedUrl) continue;

        // Check if Videa embed
        const videaMatch = embedUrl.match(/videa\.hu\/player\?v=([A-Za-z0-9]{16})/);
        if (videaMatch) {
          const vcode = videaMatch[1];
          const vData = await extractVideaStreams(vcode);
          const vStreams = vData?.sources || [];
          for (const vs of vStreams) {
            const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
            streams.push({
              name: `[HU] OnlineFilmek ${qualLabel}`,
              title: `${postTitle || hu}\n🇭🇺 OnlineFilmekIngyen (Videa) • ${qualLabel} • Szinkron`,
              url: vs.url,
              quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
              height: vs.height,
              source: 'onlinefilmek'
            });
          }
        } else if (embedUrl.includes('http')) {
          // Direct / HLS embed
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
