/**
 * NetMozi Scraper (Kodi NetMozi Addon Port for Nuvio & Stremio)
 * Scrapes netmozi.com with full Cloudflare TLS bypass (OP_NO_TICKET) and linkpayload unpacking.
 * Extracts direct MP4 streams for Videa, Indavideo, OK.ru, frdl.io, and supported hosters.
 */

const tls = require('tls');
const crypto = require('crypto');
const { URL } = require('url');
const { unpack, resolveContent } = require('../utils/linkpayload');
const { extractVideaStreams } = require('./videa');
const { extractIndavideoStreams } = require('./indavideo');
const { extractOkRuStreams } = require('./filmezek');

const netmoziTitleCache = new Map();
const netmoziSlugCache = new Map();

function getNetMoziTitle(mid) {
  return netmoziTitleCache.get(String(mid)) || '';
}

function getNetMoziSlug(mid) {
  return netmoziSlugCache.get(String(mid)) || '';
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

function decodeChunkedBuffer(buf) {
  let pos = 0;
  const chunks = [];
  while (pos < buf.length) {
    let crlf = -1;
    for (let i = pos; i < buf.length - 1; i++) {
      if (buf[i] === 0x0D && buf[i + 1] === 0x0A) {
        crlf = i;
        break;
      }
    }
    if (crlf === -1) break;

    const sizeStr = buf.slice(pos, crlf).toString('ascii').trim().split(';')[0];
    const chunkSize = parseInt(sizeStr, 16);
    if (isNaN(chunkSize) || chunkSize === 0) break;

    const start = crlf + 2;
    const end = start + chunkSize;
    if (end > buf.length) {
      chunks.push(buf.slice(start));
      break;
    }

    chunks.push(buf.slice(start, end));
    pos = end + 2;
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Cloudflare TLS bypass request using SSL_OP_NO_TICKET and no ALPN
 */
function netmoziTlsRequest(targetUrl, options = {}, cookieJar = new Map()) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 443;
    const method = options.method || 'GET';
    const postBody = options.body ? Buffer.from(options.body) : null;

    const socket = tls.connect({
      host: host,
      port: port,
      servername: host,
      secureOptions: crypto.constants.SSL_OP_NO_TICKET,
      rejectUnauthorized: false
    }, () => {
      let pathAndQuery = parsed.pathname || '/';
      if (parsed.search) pathAndQuery += parsed.search;

      let reqHeaders = `${method} ${pathAndQuery} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n` +
        `Accept: ${options.headers?.Accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}\r\n` +
        `Accept-Language: hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7\r\n` +
        `Connection: close\r\n`;

      if (options.referer) {
        reqHeaders += `Referer: ${options.referer}\r\n`;
      }
      if (options.headers) {
        for (const [hk, hv] of Object.entries(options.headers)) {
          const lhk = hk.toLowerCase();
          if (!['host', 'user-agent', 'accept', 'connection', 'referer', 'cookie', 'content-type', 'content-length'].includes(lhk)) {
            reqHeaders += `${hk}: ${hv}\r\n`;
          }
        }
      }

      const hasXff = options.headers && Object.keys(options.headers).some(k => k.toLowerCase() === 'x-forwarded-for');
      if (!hasXff) {
        const huIp = options.clientIp || '185.112.156.1';
        reqHeaders += `X-Forwarded-For: ${huIp}\r\n`;
        reqHeaders += `Client-IP: ${huIp}\r\n`;
        reqHeaders += `X-Real-IP: ${huIp}\r\n`;
      }

      if (cookieJar && cookieJar.size > 0) {
        const cookieStr = Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
        reqHeaders += `Cookie: ${cookieStr}\r\n`;
      }

      if (postBody) {
        reqHeaders += `Content-Type: ${options.headers?.['Content-Type'] || 'application/x-www-form-urlencoded'}\r\n`;
        reqHeaders += `Content-Length: ${postBody.length}\r\n`;
      }

      reqHeaders += '\r\n';

      socket.write(reqHeaders);
      if (postBody) {
        socket.write(postBody);
      }
    });

    const chunks = [];
    socket.on('data', d => chunks.push(d));

    socket.on('end', () => {
      const fullBuf = Buffer.concat(chunks);
      let headerEnd = -1;
      for (let i = 0; i < fullBuf.length - 3; i++) {
        if (fullBuf[i] === 0x0D && fullBuf[i + 1] === 0x0A && fullBuf[i + 2] === 0x0D && fullBuf[i + 3] === 0x0A) {
          headerEnd = i;
          break;
        }
      }

      if (headerEnd === -1) {
        return resolve({ statusCode: 0, headers: {}, body: '' });
      }

      const headerText = fullBuf.slice(0, headerEnd).toString('latin1');
      const rawBody = fullBuf.slice(headerEnd + 4);

      const headerLines = headerText.split('\r\n');
      const statusLine = headerLines[0] || '';
      const statusCode = parseInt(statusLine.split(' ')[1] || '0', 10);

      const headers = {};
      for (let i = 1; i < headerLines.length; i++) {
        const colon = headerLines[i].indexOf(':');
        if (colon > 0) {
          const key = headerLines[i].slice(0, colon).trim().toLowerCase();
          const val = headerLines[i].slice(colon + 1).trim();
          headers[key] = val;

          if (key === 'set-cookie' && cookieJar) {
            const parts = val.split(';')[0].split('=');
            if (parts.length >= 2) {
              cookieJar.set(parts[0].trim(), parts.slice(1).join('=').trim());
            }
          }
        }
      }

      let bodyStr = '';
      if ((headers['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
        bodyStr = decodeChunkedBuffer(rawBody);
      } else {
        bodyStr = rawBody.toString('utf8');
      }

      resolve({ statusCode, headers, body: bodyStr });
    });

    socket.on('error', reject);
    socket.setTimeout(6500, () => {
      socket.destroy();
      reject(new Error('NetMozi TLS timeout'));
    });
  });
}

/**
 * Follows HTTP 301/302 redirects automatically (used for details & episode pages)
 */
async function netmoziFetchWithRedirects(targetUrl, options = {}, cookieJar = new Map(), maxRedirects = 3) {
  let currentUrl = targetUrl;
  let currentOptions = { ...options };

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await netmoziTlsRequest(currentUrl, currentOptions, cookieJar);
    if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers['location']) {
      let loc = res.headers['location'];
      if (!loc.startsWith('http')) {
        const base = new URL(currentUrl);
        loc = `${base.protocol}//${base.host}${loc.startsWith('/') ? '' : '/'}${loc}`;
      }
      currentOptions.referer = currentUrl;
      currentOptions.method = 'GET';
      delete currentOptions.body;
      currentUrl = loc;
      continue;
    }
    return res;
  }
  return { statusCode: 0, headers: {}, body: '' };
}

/**
 * Parses search candidates from either Modern SSR HTML (<article class="movie-card">)
 * or Classic AJAX HTML (<div class="col-12">).
 */
function parseCandidatesFromHtml(html, isSeries, normTarget, targetYear) {
  const candidates = [];

  // Check 1: Modern SSR Cards (<article class="movie-card" ...>)
  const articleMatches = [...html.matchAll(/<article[^>]*class=["'][^"']*movie-card[^"']*["'][\s\S]*?<\/article>/gi)];
  for (const match of articleMatches) {
    const cardStr = match[0];
    const linkMatch = cardStr.match(/href=["'](\/(?:adatlap|sorozatok|film)\/[^"']+)["']/i);
    const titleMatch = cardStr.match(/<h3[^>]*class=["']movie-title["'][^>]*>([\s\S]*?)<\/h3>/i);
    const yearMatch = cardStr.match(/Év:[\s\S]*?([0-9]{4})/i);
    const posterMatch = cardStr.match(/src=["']([^"']+)["']/i);
    const descMatch = cardStr.match(/<p[^>]*class=["']movie-description["'][^>]*>([\s\S]*?)<\/p>/i);
    const itemIsSeries = cardStr.includes('(sorozat)') || cardStr.includes('/sorozatok/') || cardStr.includes('évad');

    if (linkMatch && titleMatch) {
      const itemTitle = titleMatch[1].replace(/<[^>]+>/g, '').replace('(sorozat)', '').trim();
      const itemYear = yearMatch ? yearMatch[1] : '';
      const itemLink = linkMatch[1];
      const midMatch = itemLink.match(/\/(?:sorozatok|adatlap|film)\/(\d+)/i);
      const itemMid = midMatch ? midMatch[1] : '';

      let itemPoster = '';
      if (posterMatch) {
        itemPoster = posterMatch[1].startsWith('//') ? 'https:' + posterMatch[1] : (posterMatch[1].startsWith('http') ? posterMatch[1] : 'https://netmozi.com' + posterMatch[1]);
      }
      const itemDesc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      const normItem = normalize(itemTitle);
      const matchScore = normItem === normTarget ? 100 : (normItem.includes(normTarget) || normTarget.includes(normItem) ? 75 : 0);
      const yearScore = (targetYear && itemYear && String(targetYear) === String(itemYear)) ? 20 : 0;
      let typeScore = 0;
      if (isSeries === true) {
        typeScore = itemIsSeries ? 30 : -20;
      } else if (isSeries === false) {
        typeScore = !itemIsSeries ? 20 : -10;
      }

      if (matchScore > 0) {
        candidates.push({
          title: itemTitle,
          year: itemYear,
          link: itemLink,
          poster: itemPoster,
          description: itemDesc,
          isSeries: itemIsSeries,
          mid: itemMid,
          score: matchScore + yearScore + typeScore
        });
      }
    }
  }

  if (candidates.length > 0) return candidates;

  // Check 2: Classic Cards (<div class="col-12" ...)
  const cardBlocks = [...html.matchAll(/<div[^>]*class=["']col-12[\s\S]*?(?=<div[^>]*class=["']col-12|$)/gi)];
  for (const c of cardBlocks) {
    const cardStr = c[0];
    const titleMatch = cardStr.match(/class=["']col_name["'][^>]*>([\s\S]*?)<\/div>/i);
    const linkMatch = cardStr.match(/href=["']([^"']+)["'][^>]*class=["']col_a["']/i);
    const yearMatch = cardStr.match(/Év:[\s\S]*?([0-9]{4})/i);
    const posterMatch = cardStr.match(/src=["']([^"']+)["']/i);
    const descMatch = cardStr.match(/title=["']([^"']{15,})["']/i);
    const itemIsSeries = cardStr.includes('(sorozat)') || (linkMatch && linkMatch[1].includes('/sorozatok/'));

    if (titleMatch && linkMatch) {
      const itemTitle = titleMatch[1].replace(/<[^>]+>/g, '').replace('(sorozat)', '').trim();
      const itemYear = yearMatch ? yearMatch[1] : '';
      const itemLink = linkMatch[1];
      const midMatch = itemLink.match(/\/(?:sorozatok|adatlap|film)\/(\d+)/i);
      const itemMid = midMatch ? midMatch[1] : '';

      let itemPoster = '';
      if (posterMatch) {
        itemPoster = posterMatch[1].startsWith('//') ? 'https:' + posterMatch[1] : (posterMatch[1].startsWith('http') ? posterMatch[1] : 'https://netmozi.com' + posterMatch[1]);
      }
      const itemDesc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      const normItem = normalize(itemTitle);
      const matchScore = normItem === normTarget ? 100 : (normItem.includes(normTarget) || normTarget.includes(normItem) ? 75 : 0);
      const yearScore = (targetYear && itemYear && String(targetYear) === String(itemYear)) ? 20 : 0;
      let typeScore = 0;
      if (isSeries === true) {
        typeScore = itemIsSeries ? 30 : -20;
      } else if (isSeries === false) {
        typeScore = !itemIsSeries ? 20 : -10;
      }

      if (matchScore > 0) {
        candidates.push({
          title: itemTitle,
          year: itemYear,
          link: itemLink,
          poster: itemPoster,
          description: itemDesc,
          isSeries: itemIsSeries,
          mid: itemMid,
          score: matchScore + yearScore + typeScore
        });
      }
    }
  }

  return candidates;
}

/**
 * Searches and scrapes NetMozi for a specific title candidate.
 */
async function searchAndScrapeNetMozi(cleanTitle, targetYear, isSeries, season, episode, clientIp = null) {
  const streams = [];
  const cookieJar = new Map();
  const reqOpts = { clientIp };

  try {
    const normTarget = normalize(cleanTitle);

    // Step 1: Initial Search Request
    const searchUrl = `https://netmozi.com/?search=${encodeURIComponent(cleanTitle)}`;
    const searchRes = await netmoziTlsRequest(searchUrl, reqOpts, cookieJar);
    if (!searchRes.body) return streams;

    // Step 2: Extract Candidates (Modern SSR mode or Classic AJAX mode)
    let candidates = parseCandidatesFromHtml(searchRes.body, isSeries, normTarget, targetYear);

    // If no candidates found in initial HTML, check if classic async search is used (data-results-url)
    if (candidates.length === 0) {
      const m = searchRes.body.match(/data-results-url="([^"]+)"\s+data-results-token="([^"]+)"/);
      if (m) {
        const resultsUrl = 'https://netmozi.com' + m[1];
        const resultsToken = m[2];

        const resultsRes = await netmoziTlsRequest(resultsUrl, {
          method: 'POST',
          body: 'token=' + encodeURIComponent(resultsToken),
          referer: searchUrl,
          clientIp,
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
          }
        }, cookieJar);

        try {
          const data = JSON.parse(resultsRes.body);
          if (data && data.success) {
            const classicHtml = data.html?.classic || '';
            const resolvedHtml = resolveContent(classicHtml);
            candidates = parseCandidatesFromHtml(resolvedHtml, isSeries, normTarget, targetYear);
          }
        } catch (e) {}
      }
    }

    if (candidates.length === 0) return streams;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    console.log(`[NetMozi] Best match: "${best.title}" (${best.year}) [${best.isSeries ? 'Series' : 'Movie'}] -> ${best.link}`);

    // Step 3: Fetch details/episode page with automatic 301/302 redirect following
    let targetPageUrl = best.link.startsWith('http') ? best.link : (`https://netmozi.com${best.link}`);
    if (best.isSeries) {
      const s = season || 1;
      const e = episode || 1;
      targetPageUrl += `/s${s}/e${e}`;
    }

    const detailPageRes = await netmoziFetchWithRedirects(targetPageUrl, { referer: 'https://netmozi.com/', clientIp }, cookieJar);
    if (!detailPageRes.body) return streams;

    // Step 4: Extract data-movie-id, data-token, data-csrf
    const attrs = {};
    for (const mMatch of detailPageRes.body.matchAll(/(data-movie-id|data-token|data-csrf)="([^"]+)"/g)) {
      attrs[mMatch[1]] = mMatch[2];
    }

    if (!attrs['data-movie-id'] || !attrs['data-token'] || !attrs['data-csrf']) {
      return streams;
    }

    // Step 5: Load Links via AJAX
    const loadLinksUrl = `https://netmozi.com/details/loadLinks/${attrs['data-movie-id']}${attrs['data-csrf']}`;
    const loadLinksRes = await netmoziTlsRequest(loadLinksUrl, {
      method: 'POST',
      body: 'token=' + encodeURIComponent(attrs['data-token']),
      referer: targetPageUrl,
      clientIp,
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }, cookieJar);

    let linksData;
    try {
      linksData = JSON.parse(loadLinksRes.body);
    } catch (e) {
      return streams;
    }

    if (!linksData.success || !linksData.linkPayload) {
      return streams;
    }

    const redirectPages = unpack(linksData.linkPayload.value, attrs['data-token']);
    if (!Array.isArray(redirectPages) || redirectPages.length === 0) return streams;

    // Step 6: Fetch Mindjart redirect page
    const mindjartUrl = redirectPages[0];
    const mindjartRes = await netmoziFetchWithRedirects(mindjartUrl, { referer: 'https://netmozi.com/', clientIp }, cookieJar);

    const mPayload = mindjartRes.body.match(/<script[^>]*data-link-payload[^>]*data-link-context="([^"]+)"[^>]*>(.*?)<\/script>/s);
    if (!mPayload) return streams;

    let routes = [];
    try {
      routes = unpack(JSON.parse(mPayload[2]).value, mPayload[1]);
    } catch (e) {
      return streams;
    }

    if (!Array.isArray(routes) || routes.length === 0) return streams;

    // Step 7: Resolve Host Routes
    const seenUrls = new Set();
    const streamingRoutes = routes.filter(r => !r.startsWith('////diablo') && !r.startsWith('////torrent'));
    const routesToResolve = streamingRoutes.slice(0, 8);

    await Promise.all(routesToResolve.map(async (route) => {
      const fullRouteUrl = route.startsWith('http') ? route : ('https://mindjart.megnezed.com' + route);
      try {
        const routeRes = await netmoziTlsRequest(fullRouteUrl, { referer: mindjartUrl, clientIp }, cookieJar);
        const loc = routeRes.headers['location'];
        if (!loc || seenUrls.has(loc)) return;
        seenUrls.add(loc);

        const locLower = loc.toLowerCase();

        // Skip non-stream file hosters or search fallbacks
        if (
          locLower.includes('videa.hu/kereses/') ||
          locLower.includes('katfile') ||
          locLower.includes('rapidgator') ||
          locLower.includes('nitroflare') ||
          locLower.includes('turbobit') ||
          locLower.includes('1fichier') ||
          locLower.includes('filefactory')
        ) {
          return;
        }

        // 1. Direct Videa stream extraction
        if (locLower.includes('videa')) {
          const vcodeMatch = loc.match(/(?:v=|[-_])([a-zA-Z0-9]{16})(?:[?&#/]|$)/);
          if (vcodeMatch) {
            const vData = await extractVideaStreams(vcodeMatch[1]);
            const vSources = vData?.sources || [];
            if (vSources.length > 0) {
              for (const vs of vSources) {
                const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
                streams.push({
                  name: `[HU] NetMozi ${qualLabel}`,
                  title: `${cleanTitle}\n🇭🇺 NetMozi (Videa) • ${qualLabel} • Szinkron`,
                  url: vs.url,
                  quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
                  height: vs.height,
                  source: 'netmozi'
                });
              }
              return;
            }
          }
          return;
        }

        // 2. Direct Indavideo stream extraction
        if (locLower.includes('indavideo.hu')) {
          const hashMatch = loc.match(/(?:video\/|v\/)([a-zA-Z0-9]+)/);
          if (hashMatch) {
            const iData = await extractIndavideoStreams(hashMatch[1]);
            const iSources = iData?.sources || [];
            if (iSources.length > 0) {
              for (const is of iSources) {
                const qualLabel = is.height >= 1080 ? '1080p FHD' : is.height >= 720 ? '720p HD' : `${is.height}p`;
                streams.push({
                  name: `[HU] NetMozi ${qualLabel}`,
                  title: `${cleanTitle}\n🇭🇺 NetMozi (Indavideo) • ${qualLabel} • Szinkron`,
                  url: is.url,
                  quality: is.height >= 1080 ? '1080p' : is.height >= 720 ? '720p' : '480p',
                  height: is.height,
                  source: 'netmozi'
                });
              }
              return;
            }
          }
          return;
        }

        // 3. OK.ru stream extraction
        if (locLower.includes('ok.ru')) {
          const okStreams = await extractOkRuStreams(loc, 'NetMozi');
          if (okStreams.length > 0) {
            streams.push(...okStreams);
            return;
          }
        }

        // 4. Direct MP4 or hoster link
        let hosterName = 'Hoster';
        let height = 720;

        if (locLower.includes('frdl.io') || locLower.includes('.mp4')) {
          hosterName = 'Direct MP4';
          height = 1080;
        } else if (locLower.includes('filemoon')) {
          hosterName = 'Filemoon';
          height = 720;
        } else if (locLower.includes('streamruby') || locLower.includes('rubystream')) {
          hosterName = 'StreamRuby';
          height = 720;
        } else if (locLower.includes('vidmoly')) {
          hosterName = 'Vidmoly';
          height = 720;
        } else if (locLower.includes('mixdrop')) {
          hosterName = 'Mixdrop';
          height = 720;
        } else if (locLower.includes('upstream')) {
          hosterName = 'Upstream';
          height = 720;
        } else if (locLower.includes('streamwish')) {
          hosterName = 'Streamwish';
          height = 720;
        } else if (locLower.includes('waaw') || locLower.includes('netu')) {
          hosterName = 'Netu / Waaw';
          height = 720;
        } else if (locLower.includes('voe')) {
          hosterName = 'VOE';
          height = 1080;
        } else if (locLower.includes('dood') || locLower.includes('byselapuix')) {
          hosterName = 'DoodStream';
          height = 720;
        } else if (locLower.includes('vidoza')) {
          hosterName = 'Vidoza';
          height = 720;
        } else if (locLower.includes('vinovo')) {
          hosterName = 'Vinovo';
          height = 720;
        } else if (locLower.includes('streamtape')) {
          hosterName = 'Streamtape';
          height = 720;
        }

        const qualityBadge = height >= 1080 ? '1080p FHD' : '720p HD';
        streams.push({
          name: `[HU] NetMozi ${qualityBadge}`,
          title: `${cleanTitle} [${qualityBadge}]\n🇭🇺 NetMozi / ${hosterName} • Szinkron`,
          url: loc,
          quality: height >= 1080 ? '1080p' : '720p',
          height: height,
          source: 'netmozi'
        });
      } catch (err) {
        // Individual route failed
      }
    }));

    console.log(`[NetMozi] Found ${streams.length} stream(s) for "${cleanTitle}"`);
  } catch (err) {
    console.warn('[NetMozi] Scraping error:', err.message);
  }

  return streams;
}

/**
 * Scrapes NetMozi.com for movies and series episodes.
 * Supports both meta object (Addon engine) and positional arguments.
 */
async function scrapeNetMozi(metaOrTitle, year = null, season = null, episode = null) {
  let cleanTitle = '';
  let targetYear = year;
  let targetSeason = season;
  let targetEpisode = episode;
  let englishTitle = '';
  let clientIp = null;
  let imdbId = '';

  if (typeof metaOrTitle === 'object' && metaOrTitle !== null) {
    cleanTitle = metaOrTitle.hungarianTitle || metaOrTitle.englishTitle || '';
    englishTitle = metaOrTitle.englishTitle || '';
    targetYear = metaOrTitle.year || null;
    targetSeason = metaOrTitle.season || null;
    targetEpisode = metaOrTitle.episode || null;
    clientIp = metaOrTitle.clientIp || null;
    imdbId = metaOrTitle.imdbId || metaOrTitle.id || '';
  } else {
    cleanTitle = (metaOrTitle || '').trim();
  }

  // Fast-path: If ID is directly a NetMozi identifier (e.g. netmozi:series:42579:1:1)
  if (imdbId && imdbId.startsWith('netmozi:')) {
    const parts = imdbId.split(':');
    const itemType = parts[1] || 'movie';
    const mid = parts[2] || '';
    const s = parts[3] ? parseInt(parts[3], 10) : (targetSeason || 1);
    const e = parts[4] ? parseInt(parts[4], 10) : (targetEpisode || 1);
    const slug = getNetMoziSlug(mid);

    if (mid && slug) {
      let pageUrl = itemType === 'series'
        ? `https://netmozi.com/sorozatok/${mid}/${slug}/s${s}/e${e}`
        : `https://netmozi.com/adatlap/${mid}/${slug}`;
      
      const cookieJar = new Map();
      const directStreams = await scrapeNetMoziDetailPage(pageUrl, cleanTitle || 'NetMozi Média', clientIp, cookieJar);
      if (directStreams.length > 0) return directStreams;
    }
  }

  if (!cleanTitle) return [];

  const isSeries = Boolean(targetSeason && targetEpisode);

  // Search Hungarian title first
  let streams = await searchAndScrapeNetMozi(cleanTitle, targetYear, isSeries, targetSeason, targetEpisode, clientIp);

  // If no streams found and englishTitle is different, try searching English title
  if (streams.length === 0 && englishTitle && normalize(englishTitle) !== normalize(cleanTitle)) {
    console.log(`[NetMozi] Fallback search with English title: "${englishTitle}"`);
    streams = await searchAndScrapeNetMozi(englishTitle, targetYear, isSeries, targetSeason, targetEpisode, clientIp);
  }

  return streams;
}

/**
 * Scrapes a specific NetMozi detail page URL (e.g. /sorozatok/42579/.../s1/e1 or /adatlap/1234/...)
 */
async function scrapeNetMoziDetailPage(targetPageUrl, cleanTitle, clientIp = null, cookieJar = new Map()) {
  const streams = [];
  try {
    const detailPageRes = await netmoziFetchWithRedirects(targetPageUrl, { referer: 'https://netmozi.com/', clientIp }, cookieJar);
    if (!detailPageRes.body) return streams;

    const attrs = {};
    for (const mMatch of detailPageRes.body.matchAll(/(data-movie-id|data-token|data-csrf)="([^"]+)"/g)) {
      attrs[mMatch[1]] = mMatch[2];
    }

    if (!attrs['data-movie-id'] || !attrs['data-token'] || !attrs['data-csrf']) {
      return streams;
    }

    const loadLinksUrl = `https://netmozi.com/details/loadLinks/${attrs['data-movie-id']}${attrs['data-csrf']}`;
    const loadLinksRes = await netmoziTlsRequest(loadLinksUrl, {
      method: 'POST',
      body: 'token=' + encodeURIComponent(attrs['data-token']),
      referer: targetPageUrl,
      clientIp,
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }, cookieJar);

    let linksData;
    try {
      linksData = JSON.parse(loadLinksRes.body);
    } catch (e) {
      return streams;
    }

    if (!linksData.success || !linksData.linkPayload) {
      return streams;
    }

    const redirectPages = unpack(linksData.linkPayload.value, attrs['data-token']);
    if (!Array.isArray(redirectPages) || redirectPages.length === 0) return streams;

    const mindjartUrl = redirectPages[0];
    const mindjartRes = await netmoziFetchWithRedirects(mindjartUrl, { referer: 'https://netmozi.com/', clientIp }, cookieJar);

    const mPayload = mindjartRes.body.match(/<script[^>]*data-link-payload[^>]*data-link-context="([^"]+)"[^>]*>(.*?)<\/script>/s);
    if (!mPayload) return streams;

    let routes = [];
    try {
      routes = unpack(JSON.parse(mPayload[2]).value, mPayload[1]);
    } catch (e) {
      return streams;
    }

    if (!Array.isArray(routes) || routes.length === 0) return streams;

    const seenUrls = new Set();
    const streamingRoutes = routes.filter(r => !r.startsWith('////diablo') && !r.startsWith('////torrent'));
    const routesToResolve = streamingRoutes.slice(0, 8);

    await Promise.all(routesToResolve.map(async (route) => {
      const fullRouteUrl = route.startsWith('http') ? route : ('https://mindjart.megnezed.com' + route);
      try {
        const routeRes = await netmoziTlsRequest(fullRouteUrl, { referer: mindjartUrl, clientIp }, cookieJar);
        const loc = routeRes.headers['location'];
        if (!loc || seenUrls.has(loc)) return;
        seenUrls.add(loc);

        const locLower = loc.toLowerCase();

        if (
          locLower.includes('videa.hu/kereses/') ||
          locLower.includes('katfile') ||
          locLower.includes('rapidgator') ||
          locLower.includes('nitroflare') ||
          locLower.includes('turbobit') ||
          locLower.includes('1fichier') ||
          locLower.includes('filefactory')
        ) {
          return;
        }

        if (locLower.includes('videa')) {
          const vcodeMatch = loc.match(/(?:v=|[-_])([a-zA-Z0-9]{16})(?:[?&#/]|$)/);
          if (vcodeMatch) {
            const vData = await extractVideaStreams(vcodeMatch[1]);
            const vSources = vData?.sources || [];
            if (vSources.length > 0) {
              for (const vs of vSources) {
                const qualLabel = vs.height >= 1080 ? '1080p FHD' : vs.height >= 720 ? '720p HD' : `${vs.height}p`;
                streams.push({
                  name: `[HU] NetMozi ${qualLabel}`,
                  title: `${cleanTitle}\n🇭🇺 NetMozi (Videa) • ${qualLabel} • Szinkron`,
                  url: vs.url,
                  quality: vs.height >= 1080 ? '1080p' : vs.height >= 720 ? '720p' : '480p',
                  height: vs.height,
                  source: 'netmozi'
                });
              }
              return;
            }
          }
          return;
        }

        if (locLower.includes('indavideo.hu')) {
          const hashMatch = loc.match(/(?:video\/|v\/)([a-zA-Z0-9]+)/);
          if (hashMatch) {
            const iData = await extractIndavideoStreams(hashMatch[1]);
            const iSources = iData?.sources || [];
            if (iSources.length > 0) {
              for (const is of iSources) {
                const qualLabel = is.height >= 1080 ? '1080p FHD' : is.height >= 720 ? '720p HD' : `${is.height}p`;
                streams.push({
                  name: `[HU] NetMozi ${qualLabel}`,
                  title: `${cleanTitle}\n🇭🇺 NetMozi (Indavideo) • ${qualLabel} • Szinkron`,
                  url: is.url,
                  quality: is.height >= 1080 ? '1080p' : is.height >= 720 ? '720p' : '480p',
                  height: is.height,
                  source: 'netmozi'
                });
              }
              return;
            }
          }
          return;
        }

        if (locLower.includes('ok.ru')) {
          const okStreams = await extractOkRuStreams(loc, 'NetMozi');
          if (okStreams.length > 0) {
            streams.push(...okStreams);
            return;
          }
        }

        let hosterName = 'Hoster';
        let height = 720;

        if (locLower.includes('frdl.io') || locLower.includes('.mp4')) {
          hosterName = 'Direct MP4';
          height = 1080;
        } else if (locLower.includes('filemoon')) {
          hosterName = 'Filemoon';
          height = 720;
        } else if (locLower.includes('streamruby') || locLower.includes('rubystream')) {
          hosterName = 'StreamRuby';
          height = 720;
        } else if (locLower.includes('vidmoly')) {
          hosterName = 'Vidmoly';
          height = 720;
        } else if (locLower.includes('mixdrop')) {
          hosterName = 'Mixdrop';
          height = 720;
        } else if (locLower.includes('upstream')) {
          hosterName = 'Upstream';
          height = 720;
        } else if (locLower.includes('streamwish')) {
          hosterName = 'Streamwish';
          height = 720;
        } else if (locLower.includes('waaw') || locLower.includes('netu')) {
          hosterName = 'Netu / Waaw';
          height = 720;
        } else if (locLower.includes('voe')) {
          hosterName = 'VOE';
          height = 1080;
        } else if (locLower.includes('dood') || locLower.includes('byselapuix')) {
          hosterName = 'DoodStream';
          height = 720;
        } else if (locLower.includes('vidoza')) {
          hosterName = 'Vidoza';
          height = 720;
        } else if (locLower.includes('vinovo')) {
          hosterName = 'Vinovo';
          height = 720;
        } else if (locLower.includes('streamtape')) {
          hosterName = 'Streamtape';
          height = 720;
        }

        const qualityBadge = height >= 1080 ? '1080p FHD' : '720p HD';
        streams.push({
          name: `[HU] NetMozi ${qualityBadge}`,
          title: `${cleanTitle} [${qualityBadge}]\n🇭🇺 NetMozi / ${hosterName} • Szinkron`,
          url: loc,
          quality: height >= 1080 ? '1080p' : '720p',
          height: height,
          source: 'netmozi'
        });
      } catch (err) {}
    }));
  } catch (err) {
    console.warn('[NetMozi] scrapeNetMoziDetailPage error:', err.message);
  }
  return streams;
}

/**
 * Searches NetMozi for catalog browsing. Returns parsed media items.
 */
async function searchNetMozi(query, type = null) {
  if (!query || query.trim().length < 2) return [];
  const clean = query.trim();
  const cookieJar = new Map();

  try {
    const searchUrl = `https://netmozi.com/?search=${encodeURIComponent(clean)}`;
    const searchRes = await netmoziTlsRequest(searchUrl, {}, cookieJar);
    if (!searchRes.body) return [];

    const normTarget = normalize(clean);
    const isSeries = type === 'series' ? true : (type === 'movie' ? false : null);
    let candidates = parseCandidatesFromHtml(searchRes.body, isSeries, normTarget, null);

    if (candidates.length === 0) {
      const m = searchRes.body.match(/data-results-url="([^"]+)"\s+data-results-token="([^"]+)"/);
      if (m) {
        const resultsUrl = 'https://netmozi.com' + m[1];
        const resultsToken = m[2];

        const resultsRes = await netmoziTlsRequest(resultsUrl, {
          method: 'POST',
          body: 'token=' + encodeURIComponent(resultsToken),
          referer: searchUrl,
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
          }
        }, cookieJar);

        try {
          const data = JSON.parse(resultsRes.body);
          if (data && data.success && data.html?.classic) {
            const resolvedHtml = resolveContent(data.html.classic);
            candidates = parseCandidatesFromHtml(resolvedHtml, isSeries, normTarget, null);
          }
        } catch (e) {}
      }
    }

    const filtered = candidates.filter(c => {
      if (type === 'series' && !c.isSeries) return false;
      if (type === 'movie' && c.isSeries) return false;
      return true;
    });

    return (filtered.length > 0 ? filtered : candidates).map(c => {
      const mid = c.mid || (c.link.match(/\d+/) ? c.link.match(/\d+/)[0] : '');
      const itemType = c.isSeries ? 'series' : 'movie';
      if (mid && c.title) {
        netmoziTitleCache.set(String(mid), c.title);
      }
      if (mid && c.link) {
        const slugMatch = c.link.match(/\/(?:sorozatok|adatlap|film)\/\d+\/([^/?#]+)/);
        if (slugMatch) {
          netmoziSlugCache.set(String(mid), slugMatch[1]);
        }
      }
      return {
        id: `netmozi:${itemType}:${mid}`,
        name: c.title,
        type: itemType,
        poster: c.poster || 'https://images.metahub.space/poster/medium/tt8111088/img',
        year: c.year || '',
        description: c.description || `NetMozi ${itemType === 'series' ? 'sorozat' : 'film'}: ${c.title}`,
        netmoziLink: c.link
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Fetches episode structure for a NetMozi series (e.g. netmozi:series:42579).
 */
async function getNetMoziSeriesEpisodes(netmoziId) {
  if (!netmoziId) return null;
  const parts = netmoziId.split(':');
  const mid = parts[2] || parts[1];
  if (!mid) return null;
  const cookieJar = new Map();

  try {
    const targetUrl = `https://netmozi.com/sorozatok/${mid}/_`;
    const res = await netmoziFetchWithRedirects(targetUrl, { referer: 'https://netmozi.com/' }, cookieJar);
    if (!res.body) return null;

    let title = 'NetMozi Sorozat';
    let poster = '';
    let description = '';
    let year = '';

    const jsonLdMatch = res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd.name) title = jsonLd.name;
        if (jsonLd.image) poster = jsonLd.image;
        if (jsonLd.description) description = jsonLd.description;
      } catch (e) {}
    }

    const yearMatch = res.body.match(/Év:[\s\S]*?([0-9]{4})/i);
    if (yearMatch) year = yearMatch[1];

    const seasonsMap = {};

    const progressMatches = [...res.body.matchAll(/data-season=["'](\d+)["'][^>]*?data-episodes=["']([^"']+)["']/gi)];
    for (const pm of progressMatches) {
      const sNum = parseInt(pm[1], 10);
      const epNums = pm[2].split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
      seasonsMap[sNum] = epNums.map(eNum => ({
        id: `netmozi:series:${mid}:${sNum}:${eNum}`,
        season: sNum,
        episode: eNum,
        name: `${eNum}. Rész`,
        overview: `${title} - ${sNum}. Évad ${eNum}. Rész`,
        thumbnail: poster
      }));
    }

    if (Object.keys(seasonsMap).length === 0) {
      const tabMatches = [...res.body.matchAll(/data-season=["'](\d+)["'][^>]*?data-episode=["'](\d+)["']/gi)];
      for (const tm of tabMatches) {
        const sNum = parseInt(tm[1], 10);
        const eNum = parseInt(tm[2], 10);
        if (!seasonsMap[sNum]) seasonsMap[sNum] = [];
        if (!seasonsMap[sNum].some(e => e.episode === eNum)) {
          seasonsMap[sNum].push({
            id: `netmozi:series:${mid}:${sNum}:${eNum}`,
            season: sNum,
            episode: eNum,
            name: `${eNum}. Rész`,
            overview: `${title} - ${sNum}. Évad ${eNum}. Rész`,
            thumbnail: poster
          });
        }
      }
    }

    if (Object.keys(seasonsMap).length === 0) {
      seasonsMap['1'] = [{
        id: `netmozi:series:${mid}:1:1`,
        season: 1,
        episode: 1,
        name: '1. Rész',
        overview: `${title} - 1. Évad 1. Rész`,
        thumbnail: poster
      }];
    }

    if (mid && title) {
      netmoziTitleCache.set(String(mid), title);
    }

    return {
      id: `netmozi:series:${mid}`,
      name: title,
      englishName: title,
      year,
      poster,
      background: poster,
      description,
      genres: ['Magyar Sorozat'],
      seasons: seasonsMap
    };
  } catch (err) {
    return null;
  }
}

module.exports = {
  scrapeNetMozi,
  scrapeNetMoziDetailPage,
  searchNetMozi,
  getNetMoziSeriesEpisodes,
  getNetMoziTitle,
  getNetMoziSlug,
  netmoziTitleCache,
  netmoziSlugCache,
  netmoziTlsRequest,
  netmoziFetchWithRedirects
};
