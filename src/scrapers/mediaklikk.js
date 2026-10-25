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

/**
 * Scrapes on-demand (VOD) videos from MédiaKlikk for a movie or series
 * @param {Object} meta Media metadata
 * @returns {Promise<Array>} List of stream objects
 */
async function scrapeMediaKlikk(meta) {
  const streams = [];
  const hu = meta.hungarianTitle || meta.englishTitle;
  if (!hu) return streams;

  // If live channel id was requested, return live channel streams directly
  if (meta.id && meta.id.startsWith('mediaklikk-live-')) {
    return await getLiveChannelStreams(meta.id);
  }

  const normTarget = normalize(hu);
  const searchQueries = [];

  if (meta.episodeTitle) {
    searchQueries.push(meta.episodeTitle);
    searchQueries.push(`${hu} ${meta.episodeTitle}`);
  }
  searchQueries.push(hu);

  for (const q of searchQueries.slice(0, 2)) {
    try {
      const searchUrl = `https://mediaklikk.hu/?s=${encodeURIComponent(q)}`;
      const sRes = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://mediaklikk.hu/'
        },
        signal: AbortSignal.timeout(3500)
      });

      if (!sRes.ok) continue;
      const html = await sRes.text();

      // Extract video article links
      const videoLinks = [...html.matchAll(/href=["'](\/\/mediaklikk\.hu\/video\/[^"']+)["']/gi)]
        .map(m => m[1].startsWith('//') ? 'https:' + m[1] : m[1]);

      // Deduplicate links
      const uniqueLinks = [...new Set(videoLinks)];

      for (const pageUrl of uniqueLinks.slice(0, 3)) {
        try {
          // Normalize URL with trailing slash to avoid 301
          const normalizedUrl = pageUrl.endsWith('/') ? pageUrl : pageUrl + '/';
          const pRes = await fetch(normalizedUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://mediaklikk.hu/'
            },
            signal: AbortSignal.timeout(3500)
          });

          if (!pRes.ok) continue;
          const pHtml = await pRes.text();

          // Extract loadPlayer config token
          const loadPlayerMatch = pHtml.match(/loadPlayer\s*\(\s*['"][^'"]+['"]\s*,\s*(\{[\s\S]*?\})\s*\)/);
          let token = null;
          let videoTitle = hu;

          if (loadPlayerMatch) {
            try {
              const cfg = JSON.parse(loadPlayerMatch[1]);
              token = cfg.token;
              if (cfg.title) videoTitle = cfg.title;
            } catch (e) {}
          }

          if (token) {
            const playerUrl = `https://player.mediaklikk.hu/playernew/player.php?video=${encodeURIComponent(token)}`;
            const plRes = await fetch(playerUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://mediaklikk.hu/'
              },
              signal: AbortSignal.timeout(3500)
            });

            if (plRes.ok) {
              const plHtml = await plRes.text();
              const m3u8Match = plHtml.match(/"file":\s*"([^"]+\.m3u8[^"]*)"/i);
              if (m3u8Match) {
                const streamUrl = m3u8Match[1].replace(/\\\//g, '/');
                if (!streams.some(s => s.url === streamUrl)) {
                  streams.push({
                    name: 'MédiaKlikk [HLS FHD]',
                    title: `${videoTitle}\n🎬 MédiaKlikk HLS közvetlen lejátszás • 1080p`,
                    url: streamUrl,
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
          }
        } catch (err) {
          // Continue to next page
        }
      }

      if (streams.length > 0) break;
    } catch (err) {
      // Continue to next query
    }
  }

  return streams;
}

module.exports = {
  LIVE_CHANNELS,
  getLiveHlsStream,
  getReorderedMasterPlaylist,
  getLiveChannelStreams,
  scrapeMediaKlikk
};
