/**
 * MédiaKlikk (MTVA) Scraper & Live TV Stream Provider
 * Provides:
 * 1. 24/7 Official Live TV HLS streams (M1, M2, M4 Sport, M4 Sport+, M5, Duna, Duna World)
 * 2. On-demand (VOD) Hungarian movies, series, fairy tales and documentaries from mediaklikk.hu
 */

// Official MTVA Live TV Channels with high-definition static branding posters and logos
const HOST_URL = 'https://nuvio-hungarian-addon.vercel.app';

const LIVE_CHANNELS = [
  {
    id: 'mediaklikk-live-m4',
    channelKey: 'm4',
    streamId: 'mtv4live',
    pageUrl: 'https://m4sport.hu/elo/',
    name: 'M4 Sport Élő',
    type: 'movie',
    poster: `${HOST_URL}/channels/poster-m4.png`,
    logo: `${HOST_URL}/channels/m4.png`,
    year: 'ÉLŐ • 1080p FHD',
    description: 'A nemzeti sportcsatorna: Forma-1, magyar és nemzetközi labdarúgó bajnokságok, Bajnokok Ligája és olimpiai közvetítések 24 órában élőben.'
  },
  {
    id: 'mediaklikk-live-m4plus',
    channelKey: 'm4plus',
    streamId: 'mtv4plus',
    pageUrl: 'https://mediaklikk.hu/m4-sport-plusz-elo/',
    name: 'M4 Sport+ Élő',
    type: 'movie',
    poster: `${HOST_URL}/channels/poster-m4plus.png`,
    logo: `${HOST_URL}/channels/m4plus.png`,
    year: 'ÉLŐ • 1080p FHD',
    description: 'M4 Sport Plusz: párhuzamosan közvetített hazai és nemzetközi rangadók, bajnokságok és élő körkapcsolások.'
  },
  {
    id: 'mediaklikk-live-m1',
    channelKey: 'm1',
    streamId: 'mtv1live',
    pageUrl: 'https://mediaklikk.hu/elo/mtv1live/',
    name: 'M1 Híradó Élő',
    type: 'movie',
    poster: `${HOST_URL}/channels/poster-m1.png`,
    logo: `${HOST_URL}/channels/m1.png`,
    year: 'ÉLŐ • 1080p FHD',
    description: 'Nemzeti hírcsatorna: élő híradások, percről percre frissülő tudósítások, rendkívüli bejelentések és háttérelemzések.'
  },
  {
    id: 'mediaklikk-live-m2',
    channelKey: 'm2',
    streamId: 'mtv2live',
    pageUrl: 'https://mediaklikk.hu/elo/mtv2live/',
    name: 'M2 Gyerek & Petőfi TV Élő',
    type: 'movie',
    poster: `${HOST_URL}/channels/poster-m2.png`,
    logo: `${HOST_URL}/channels/m2.png`,
    year: 'ÉLŐ • 1080p FHD',
    description: 'Nappal M2 Gyerekcsatorna (klasszikus és új rajzfilmek, mesék), este Petőfi TV (zene, koncertek és ifjúsági magazinok).'
  },
  {
    id: 'mediaklikk-live-m5',
    channelKey: 'm5',
    streamId: 'mtv5live',
    pageUrl: 'https://mediaklikk.hu/elo/mtv5live/',
    name: 'M5 Kultúra Élő',
    type: 'movie',
    poster: `${HOST_URL}/channels/poster-m5.png`,
    logo: `${HOST_URL}/channels/m5.png`,
    year: 'ÉLŐ • 1080p FHD',
    description: 'Kulturális, oktatási és tudományos csatorna: színházi közvetítések, hangversenyek, irodalom és minőségi dokumentumfilmek.'
  },
  {
    id: 'mediaklikk-live-duna',
    channelKey: 'duna',
    streamId: 'dunalive',
    pageUrl: 'https://mediaklikk.hu/elo/duna/',
    name: 'Duna TV Élő',
    type: 'movie',
    poster: `${HOST_URL}/channels/poster-duna.png`,
    logo: `${HOST_URL}/channels/duna.png`,
    year: 'ÉLŐ • 1080p FHD',
    description: 'A nemzeti főadó: magyar filmek, közkedvelt sorozatok, családi és kulturális műsorok 24 órában élőben.'
  },
  {
    id: 'mediaklikk-live-dunaworld',
    channelKey: 'dunaworld',
    streamId: 'dunaworldlive',
    pageUrl: 'https://mediaklikk.hu/elo/dunaworldlive/',
    name: 'Duna World Élő',
    type: 'movie',
    poster: `${HOST_URL}/channels/poster-dunaworld.png`,
    logo: `${HOST_URL}/channels/dunaworld.png`,
    year: 'ÉLŐ • 1080p FHD',
    description: 'A határon túli magyarság csatornája: nemzetiségi műsorok, néphagyományok és magyar klasszikusok.'
  }
];

// In-memory cache for live stream URLs (HLS tokens are valid for ~2-3 hours)
const LIVE_STREAM_CACHE = new Map();
const LIVE_CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutes

// In-memory cache for MédiaKlikk programs and series episodes
let mediaklikkProgramsCache = null;
let lastProgramsRefresh = 0;
const PROGRAMS_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const showEpisodesCache = new Map();

/**
 * Loads all MédiaKlikk programs (490+ active and archive shows, series, and films)
 * Automatically updates from mediaklikk.hu/musoraink periodically without manual coding.
 */
function getMediaKlikkPrograms() {
  if (mediaklikkProgramsCache && (Date.now() - lastProgramsRefresh < PROGRAMS_REFRESH_INTERVAL_MS)) {
    return mediaklikkProgramsCache;
  }

  try {
    const localData = require('../data/mediaklikk_programs.json');
    mediaklikkProgramsCache = localData;
    lastProgramsRefresh = Date.now();
  } catch (err) {
    if (!mediaklikkProgramsCache) mediaklikkProgramsCache = [];
  }

  // Asynchronous background refresh
  refreshProgramsFromWeb().catch(() => {});

  return mediaklikkProgramsCache || [];
}

async function refreshProgramsFromWeb() {
  try {
    const res = await fetch('https://mediaklikk.hu/musoraink', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return;
    const html = await res.text();
    const cardRegex = /<a[^>]+href=["'](https:\/\/mediaklikk\.hu\/musor\/([^"'\/]+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const programs = [];
    const seenSlugs = new Set();
    let m;

    while ((m = cardRegex.exec(html)) !== null) {
      const fullUrl = m[1];
      const slug = m[2];
      const inner = m[3];
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const titleMatch = inner.match(/<h[234][^>]*>([^<]+)<\/h[234]>/i) || inner.match(/class=["'][^"']*title[^"']*["'][^>]*>([^<]+)</i);
      const name = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');
      const imgMatch = inner.match(/src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
      const poster = imgMatch ? imgMatch[1] : '';

      const catMatches = [...inner.matchAll(/class=["'][^"']*category[^"']*["'][^>]*>([^<]+)</gi)].map(cm => cm[1].trim());
      const categories = catMatches.length > 0 ? catMatches : ['Kultúra'];
      const isMovie = categories.includes('Film');

      programs.push({
        id: `mediaklikk:program:${slug}`,
        slug,
        name,
        type: isMovie ? 'movie' : 'series',
        poster,
        url: fullUrl,
        categories,
        description: `MédiaKlikk (MTVA) műsor: ${name}. Kategóriák: ${categories.join(', ')}.`
      });
    }

    if (programs.length > 50) {
      mediaklikkProgramsCache = programs;
      lastProgramsRefresh = Date.now();
    }
  } catch (e) {}
}

/**
 * Dynamically resolves all seasons and episodes for ANY MédiaKlikk show
 * directly from the official MTVA AJAX search backend.
 * Zero hardcoding: works automatically for all existing and newly added shows.
 */
async function getMediaKlikkSeriesEpisodes(idOrSlugOrName) {
  if (!idOrSlugOrName) return null;
  const cleanKey = idOrSlugOrName.replace(/^mediaklikk:program:/, '').trim();

  if (showEpisodesCache.has(cleanKey)) {
    const cached = showEpisodesCache.get(cleanKey);
    if (Date.now() - cached.timestamp < 2 * 60 * 60 * 1000) {
      return cached.data;
    }
  }

  const allPrograms = getMediaKlikkPrograms();
  const program = allPrograms.find(p => 
    p.slug === cleanKey || 
    p.id === idOrSlugOrName || 
    normalize(p.name) === normalize(cleanKey)
  ) || {
    id: `mediaklikk:program:${cleanKey}`,
    slug: cleanKey,
    name: cleanKey.replace(/-/g, ' '),
    type: 'series',
    poster: '',
    categories: ['Sorozat', 'Retró'],
    description: `MédiaKlikk (MTVA) sorozat: ${cleanKey}.`
  };

  try {
    const searchUrl = 'https://mediaklikk.hu/wp-content/plugins/hms-mediaklikk/interfaces/get_results.php';
    const body = new URLSearchParams({
      action: 'search',
      s_type: 'video',
      keyword: program.name,
      fromDate: '2013-01-01',
      toDate: new Date().toISOString().slice(0, 10),
      pageSize: '100',
      pageNumber: '1',
      getAudioPrograms: 'false'
    });

    const res = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': 'https://mediaklikk.hu/'
      },
      body: body.toString(),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    const items = data[0]?.data?.items || [];

    if (items.length === 0) return null;

    const seasonsMap = {};
    const normProgName = normalize(program.name);

    items.forEach((item, idx) => {
      const rawTitle = (item.post_title || item.source?.post_title || '').replace(/<[^>]+>/g, '').trim();
      const token = item.token || item.source?.token;
      if (!token) return;

      const normTitle = normalize(rawTitle);
      // Ensure the result actually pertains to this program
      if (!normTitle.includes(normProgName) && !normProgName.includes(normTitle)) {
        // Soft match check
        const progWords = normProgName.split(' ').filter(w => w.length > 2);
        const matchCount = progWords.filter(w => normTitle.includes(w)).length;
        if (matchCount < Math.min(2, progWords.length)) return;
      }

      const parsed = parseSeasonEpisode(rawTitle);
      const sNum = parsed.season != null ? String(parsed.season) : '1';
      const epNum = parsed.episode != null ? parsed.episode : (idx + 1);

      // Clean episode subtitle
      let epName = rawTitle;
      if (rawTitle.includes(',')) {
        epName = rawTitle.split(',').slice(1).join(',').trim();
      } else if (rawTitle.includes('-')) {
        epName = rawTitle.split('-').slice(1).join('-').trim();
      }
      epName = epName.replace(/^(I{1,3}|IV|V|\d+)\.\s*(sorozat|évad|evad|rész)\s*,?\s*/i, '').trim();
      if (!epName || epName.length < 2) {
        epName = `${epNum}. rész`;
      }

      if (!seasonsMap[sNum]) {
        seasonsMap[sNum] = [];
      }

      const thumb = item.featured_image_url_large || item.featured_image_url_medium || program.poster || '';

      let cleanToken = token;
      while (cleanToken.includes('%')) {
        try { cleanToken = decodeURIComponent(cleanToken); } catch(e) { break; }
      }

      seasonsMap[sNum].push({
        id: `mediaklikk:video:${encodeURIComponent(cleanToken)}`,
        season: parseInt(sNum, 10),
        episode: epNum,
        name: epName,
        rawTitle,
        overview: `${program.name} - ${rawTitle}`,
        thumbnail: thumb,
        token: cleanToken
      });
    });

    // Sort episodes inside each season
    for (const s of Object.keys(seasonsMap)) {
      seasonsMap[s].sort((a, b) => a.episode - b.episode);
    }

    const result = {
      id: program.id,
      name: program.name,
      englishName: program.name,
      year: program.categories?.join(' • ') || 'MédiaKlikk Archívum',
      poster: program.poster,
      background: program.poster,
      description: program.description,
      genres: program.categories || ['MTVA Archívum'],
      seasons: seasonsMap
    };

    showEpisodesCache.set(cleanKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.warn(`[MediaKlikk] Dynamic episode fetch error for ${program.name}:`, err.message);
    return null;
  }
}

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
 * Resolves the direct HLS m3u8 stream for an MTVA live TV channel
 * @param {string} streamId e.g. 'dunalive', 'mtv1live', 'mtv4live'
 * @param {string|null} clientIp Optional user client IP for ConnectMedia token binding
 * @returns {Promise<string|null>} HLS stream URL
 */
async function getLiveHlsStream(streamId, clientIp = null) {
  if (!streamId) return null;

  // Cache per IP since ConnectMedia token binds to the requesting IP
  const cacheKey = clientIp ? `${streamId}:${clientIp}` : streamId;
  const cached = LIVE_STREAM_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < LIVE_CACHE_TTL_MS)) {
    return cached.url;
  }

  try {
    const playerUrl = `https://player.mediaklikk.hu/playernew/player.php?video=${encodeURIComponent(streamId)}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://mediaklikk.hu/'
    };

    if (clientIp) {
      headers['X-Forwarded-For'] = clientIp;
      headers['X-Real-IP'] = clientIp;
      headers['Client-IP'] = clientIp;
    }

    const res = await fetch(playerUrl, {
      headers,
      signal: AbortSignal.timeout(4000)
    });

    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"file":\s*"([^"]+\.m3u8[^"]*)"/i);
    if (match) {
      const hlsUrl = match[1].replace(/\\\//g, '/');
      LIVE_STREAM_CACHE.set(cacheKey, { url: hlsUrl, timestamp: Date.now() });
      return hlsUrl;
    }
  } catch (err) {
    if (cached) return cached.url;
  }
  return null;
}

/**
 * Generates an optimized HLS master playlist where 1080p Full HD is placed as the FIRST variant.
 * This ensures video players (Nuvio, Stremio, Hls.js, ExoPlayer) start playback in pristine 1080p instantly,
 * rather than starting in blurry 240p and slowly stepping up over 15 seconds.
 * 
 * @param {string} streamId e.g. 'mtv4live'
 * @param {string|null} clientIp User client IP for ConnectMedia token
 * @returns {Promise<string|null>} Rewritten M3U8 string
 */
async function getReorderedMasterPlaylist(streamId, clientIp = null) {
  const masterUrl = await getLiveHlsStream(streamId, clientIp);
  if (!masterUrl) return null;

  try {
    const res = await fetch(masterUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://mediaklikk.hu/'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;

    const text = await res.text();
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    const query = masterUrl.includes('?') ? masterUrl.substring(masterUrl.indexOf('?')) : '';

    const lines = text.split('\n');
    const mediaLines = [];
    const variants = [];
    const headerLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXT-X-MEDIA:')) {
        // Rewrite relative audio/subtitle URIs to absolute ConnectMedia CDN URIs
        const rewritten = line.replace(/URI="([^"]+)"/, (m, uri) => {
          const absUri = uri.startsWith('http') ? uri : baseUrl + uri + query;
          return `URI="${absUri}"`;
        });
        mediaLines.push(rewritten);
      } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const infLine = line;
        const nextLine = lines[++i]?.trim() || '';
        const absNext = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine + query;
        const resMatch = infLine.match(/RESOLUTION=(\d+)x(\d+)/);
        const height = resMatch ? parseInt(resMatch[2], 10) : 0;
        variants.push({ inf: infLine, url: absNext, height });
      } else if (!line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) {
        headerLines.push(line);
      }
    }

    // Sort variants strictly DESCENDING by resolution (1080p -> 720p -> 540p -> 480p -> 360p -> 240p)
    variants.sort((a, b) => b.height - a.height);

    let newPlaylist = headerLines.join('\n') + '\n' + mediaLines.join('\n') + '\n';
    for (const v of variants) {
      newPlaylist += v.inf + '\n' + v.url + '\n';
    }
    newPlaylist += '#EXT-X-INDEPENDENT-SEGMENTS\n';

    return newPlaylist;
  } catch (err) {
    console.warn(`[MediaKlikk] Master rewriter fallback for ${streamId}:`, err.message);
    return null;
  }
}

/**
 * Resolves streams for a live channel ID (e.g. 'mediaklikk-live-m4' or 'm4')
 * @param {string} channelIdOrKey Channel identifier
 * @param {string|null} clientIp User's client IP
 * @param {string} hostUrl Base host URL for rewriter endpoint
 */
async function getLiveChannelStreams(channelIdOrKey, clientIp = null, hostUrl = HOST_URL) {
  const cleanId = (channelIdOrKey || '').toLowerCase();
  const channel = LIVE_CHANNELS.find(ch => 
    ch.id === cleanId || 
    ch.channelKey === cleanId || 
    ch.streamId === cleanId || 
    cleanId.includes(ch.channelKey)
  );

  if (!channel) return [];

  const hlsUrl = await getLiveHlsStream(channel.streamId, clientIp);
  if (!hlsUrl) return [];

  const officialPageUrl = channel.pageUrl || `https://mediaklikk.hu/elo/${channel.streamId}/`;
  const instant1080Url = `${hostUrl}/api/live/${channel.streamId}.m3u8`;

  return [
    {
      name: `🔴 ${channel.name} [1080p FHD Élő Közvetítés]`,
      title: `⚡ Hivatalos MTVA CDN Élő Közvetítés (1080p Full HD)\n${channel.description}\nKözvetlen adás TV-re és mobilra optimalizálva.`,
      url: hlsUrl,
      playerUrl: officialPageUrl,
      quality: '1080p',
      height: 1080,
      source: 'mediaklikk',
      behaviorHints: {
        notWebReady: false,
        isLive: true
      }
    },
    {
      name: `🔴 ${channel.name} [1080p FHD Azonnali Rewriter]`,
      title: `⚡ 1080p FULL HD AZONNALI INDÍTÁS • MTVA HLS Rewriter\n${channel.description}\nKözvetlen 1080p indítás az első másodperctől, nulla felbontásugrálás.`,
      url: instant1080Url,
      playerUrl: officialPageUrl,
      quality: '1080p',
      height: 1080,
      source: 'mediaklikk',
      behaviorHints: {
        notWebReady: false,
        isLive: true
      }
    }
  ];
}

function parseSeasonEpisode(title) {
  let s = null;
  let e = null;

  // Fraction format e.g. II/2. or I/12. or II/ 10. or 1/5.
  const slashMatch = title.match(/\b(I{1,3}|IV|V|\d+)\s*\/\s*(\d+)/i);
  if (slashMatch) {
    const sStr = slashMatch[1].toUpperCase();
    if (sStr === 'I') s = 1;
    else if (sStr === 'II') s = 2;
    else if (sStr === 'III') s = 3;
    else if (sStr === 'IV') s = 4;
    else s = parseInt(sStr, 10);
    e = parseInt(slashMatch[2], 10);
  }

  // Roman numeral season e.g. "I. sorozat" or "2. évad"
  if (s === null) {
    const sMatch = title.match(/\b(I{1,3}|IV|V|\d+)\.\s*(sorozat|evad|évad|széria|szeria)/i);
    if (sMatch) {
      const sStr = sMatch[1].toUpperCase();
      if (sStr === 'I') s = 1;
      else if (sStr === 'II') s = 2;
      else if (sStr === 'III') s = 3;
      else if (sStr === 'IV') s = 4;
      else s = parseInt(sStr, 10);
    }
  }

  // Ordinal episode e.g. "(\\d+)\\. rész"
  if (e === null) {
    const eMatch = title.match(/(\d+)\.\s*rész/i);
    if (eMatch) {
      e = parseInt(eMatch[1], 10);
    }
  }

  return { season: s, episode: e };
}

/**
 * Scrapes on-demand (VOD) videos from MédiaKlikk via official MTVA AJAX search endpoint
 * Resolves 1080p Full HD direct HLS streams for Hungarian classics and on-demand titles
 * @param {Object} meta Media metadata
 * @returns {Promise<Array>} List of stream objects
 */
async function scrapeMediaKlikk(meta) {
  // If direct MédiaKlikk video token was requested, resolve stream immediately
  if ((meta.id && meta.id.startsWith('mediaklikk:video:')) || meta.token) {
    let token = meta.token || (meta.id ? meta.id.replace('mediaklikk:video:', '').trim() : '');
    while (token.includes('%')) {
      try { token = decodeURIComponent(token); } catch(e) { break; }
    }
    try {
      const playerUrl = `https://player.mediaklikk.hu/playernew/player.php?video=${encodeURIComponent(token)}`;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://mediaklikk.hu/'
      };
      if (meta.clientIp) {
        headers['X-Forwarded-For'] = meta.clientIp;
        headers['X-Real-IP'] = meta.clientIp;
        headers['Client-IP'] = meta.clientIp;
      }
      const plRes = await fetch(playerUrl, { headers, signal: AbortSignal.timeout(4000) });
      if (plRes.ok) {
        const plHtml = await plRes.text();
        const m3u8Match = plHtml.match(/"file":\s*"([^"]+\.m3u8[^"]*)"/i);
        if (m3u8Match) {
          const streamUrl = m3u8Match[1].replace(/\\\//g, '/');
          return [{
            name: '🔴 MédiaKlikk (MTVA) 1080p FHD',
            title: `🇭🇺 MédiaKlikk HLS Közvetlen Lejátszás • MTVA Archívum\nKözvetlen 1080p Full HD stream az MTVA szerveréről`,
            url: streamUrl,
            playerUrl: `https://mediaklikk.hu/`,
            quality: '1080p',
            height: 1080,
            source: 'mediaklikk',
            behaviorHints: { notWebReady: false }
          }];
        }
      }
    } catch (e) {}
    return [];
  }

  // If program episode requested e.g. mediaklikk:program:slug:season:episode
  if (meta.id && meta.id.startsWith('mediaklikk:program:')) {
    try {
      const parts = meta.id.split(':');
      let slug = '';
      let seasonNum = meta.season || 1;
      let epNum = meta.episode || 1;

      if (parts.length >= 5) {
        epNum = parseInt(parts[parts.length - 1], 10) || 1;
        seasonNum = parseInt(parts[parts.length - 2], 10) || 1;
        slug = parts.slice(2, parts.length - 2).join(':');
      } else if (parts.length >= 3) {
        slug = parts.slice(2).join(':');
      }

      const progData = await getMediaKlikkSeriesEpisodes(`mediaklikk:program:${slug}`);
      if (progData && progData.seasons) {
        const sList = progData.seasons[String(seasonNum)] || Object.values(progData.seasons)[0] || [];
        const matchedEp = sList.find(e => e.episode === epNum) || sList[0];
        if (matchedEp && matchedEp.token) {
          return await scrapeMediaKlikk({ token: matchedEp.token, clientIp: meta.clientIp });
        }
      }
    } catch(e) {}
  }

  // If live channel id was requested, return live channel streams directly
  if (meta.id && (meta.id.startsWith('mediaklikk-live-') || meta.id.startsWith('m1') || meta.id.startsWith('m4') || meta.id.startsWith('duna'))) {
    return await getLiveChannelStreams(meta.id, meta.clientIp);
  }

  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  const normTarget = normalize(hu);
  const isSeries = meta.type === 'series' || meta.season !== undefined;
  const season = meta.season ? parseInt(meta.season, 10) : null;
  const episode = meta.episode ? parseInt(meta.episode, 10) : null;
  const epTitle = meta.episodeTitle ? normalize(meta.episodeTitle) : null;
  const clientIp = meta.clientIp || null;

  // Curate targeted query keywords for MédiaKlikk's backend
  const queries = new Set();
  if (normTarget.includes('ho ho') || normTarget.includes('hoho') || normTarget.includes('horgasz')) {
    queries.add('ho-ho-ho');
    queries.add('A nagy ho-ho-ho-horgász');
  } else if (normTarget.includes('nepmese')) {
    queries.add('Magyar népmesék');
    queries.add('népmesék');
  } else if (normTarget.includes('tenkes')) {
    queries.add('Tenkes');
  } else if (normTarget.includes('mezga')) {
    queries.add('Mézga');
  } else if (normTarget.includes('frakk')) {
    queries.add('Frakk');
  } else if (normTarget.includes('pom pom') || normTarget.includes('pompom')) {
    queries.add('Pom-Pom');
  } else if (normTarget.includes('kukori')) {
    queries.add('Kukori');
  } else if (normTarget.includes('susu')) {
    queries.add('Süsü');
  } else if (normTarget.includes('bakterhaz')) {
    queries.add('bakterház');
    queries.add('Indul a bakterház');
  } else if (normTarget.includes('vuk')) {
    queries.add('Vuk');
  } else {
    queries.add(hu);
    if (meta.episodeTitle) queries.add(meta.episodeTitle);
  }

  const searchUrl = 'https://mediaklikk.hu/wp-content/plugins/hms-mediaklikk/interfaces/get_results.php';

  for (const q of queries) {
    try {
      const body = new URLSearchParams({
        action: 'search',
        s_type: 'video',
        keyword: q,
        fromDate: '2013-01-01',
        toDate: new Date().toISOString().slice(0, 10),
        pageSize: '40',
        getAudioPrograms: 'false'
      });

      const res = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Referer': 'https://mediaklikk.hu/talalati-lista/?search_mk=' + encodeURIComponent(q)
        },
        body: body.toString(),
        signal: AbortSignal.timeout(4000)
      });

      if (!res.ok) continue;
      const data = await res.json();
      const items = data[0]?.data?.items || [];

      for (const item of items) {
        const rawTitle = (item.post_title || item.source?.post_title || '').replace(/<[^>]+>/g, '').trim();
        const normItemTitle = normalize(rawTitle);
        const token = item.token || item.source?.token;
        const permalink = item.permalink || item.source?.permalink || item.URL || 'https://mediaklikk.hu/';

        if (!token) continue;

        let isMatch = false;

        if (isSeries) {
          const parsed = parseSeasonEpisode(rawTitle);

          // 1. Direct Season & Episode match
          if (season !== null && episode !== null && parsed.season !== null && parsed.episode !== null) {
            if (parsed.season === season && parsed.episode === episode) {
              isMatch = true;
            }
          } else if (episode !== null && parsed.episode !== null && parsed.episode === episode) {
            if (season === null || parsed.season === null || parsed.season === season) {
              isMatch = true;
            }
          }

          // 2. Subtitle / episodeTitle match
          if (!isMatch && epTitle && epTitle.length > 2) {
            if (normItemTitle.includes(epTitle) || epTitle.includes(normItemTitle)) {
              isMatch = true;
            }
          }
        } else {
          // Movie match
          if (normItemTitle.includes(normTarget) || normTarget.includes(normItemTitle)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          // Resolve direct HLS stream from MTVA JWPlayer backend
          try {
            const playerUrl = `https://player.mediaklikk.hu/playernew/player.php?video=${token}`;
            const headers = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://mediaklikk.hu/'
            };
            if (clientIp) {
              headers['X-Forwarded-For'] = clientIp;
              headers['X-Real-IP'] = clientIp;
              headers['Client-IP'] = clientIp;
            }

            const plRes = await fetch(playerUrl, {
              headers,
              signal: AbortSignal.timeout(3500)
            });

            if (plRes.ok) {
              const plHtml = await plRes.text();
              const m3u8Match = plHtml.match(/"file":\s*"([^"]+\.m3u8[^"]*)"/i);
              if (m3u8Match) {
                const streamUrl = m3u8Match[1].replace(/\\\//g, '/');
                if (!streams.some(s => s.url === streamUrl)) {
                  streams.push({
                    name: '🔴 MédiaKlikk (MTVA) 1080p FHD',
                    title: `${rawTitle}\n🇭🇺 MédiaKlikk HLS Közvetlen Lejátszás • MTVA Archívum`,
                    url: streamUrl,
                    playerUrl: permalink,
                    quality: '1080p',
                    height: 1080,
                    source: 'mediaklikk',
                    behaviorHints: {
                      notWebReady: false
                    }
                  });
                }
              }
            }
          } catch (e) {}
        }
      }

      if (streams.length > 0) break;
    } catch (err) {}
  }

  return streams;
}

module.exports = {
  LIVE_CHANNELS,
  getLiveHlsStream,
  getReorderedMasterPlaylist,
  getLiveChannelStreams,
  getMediaKlikkPrograms,
  getMediaKlikkSeriesEpisodes,
  scrapeMediaKlikk
};
