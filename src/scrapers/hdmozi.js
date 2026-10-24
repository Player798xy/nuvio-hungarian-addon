/**
 * HDMozi.hu Scraper
 * Extracts streams from hdmozi.hu movies and series.
 */

const { extractVideaStreams } = require('./videa');

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

      let targetUrl = results[0].url;
      let postTitle = results[0].title;

      // If series, handle episode URL
      if (meta.season && meta.episode) {
        // Look for show url
        const showResult = results.find(r => r.url.includes('/tvshows/')) || results[0];
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

        // If Videa embed
        const videaMatch = embedUrl.match(/videa\.hu\/player\?v=([A-Za-z0-9]{16})/);
        if (videaMatch) {
          const vcode = videaMatch[1];
          const vStreams = await extractVideaStreams(vcode);
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
        } else if (embedUrl.includes('http')) {
          streams.push({
            name: `[HU] HDMozi 1080p`,
            title: `${postTitle || hu}\n🇭🇺 HDMozi.hu • 1080p FHD • Magyar Szinkron`,
            url: embedUrl,
            quality: '1080p',
            height: 1080,
            source: 'hdmozi'
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
  scrapeHDMozi
};
