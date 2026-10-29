/**
 * NetMozi Payload Decoder & Content Resolver
 * Pure Node.js port of the Kodi NetMozi addon linkpayload module.
 * Reconstructs encrypted data-content-payload and linkPayload structures from netmozi.com.
 * Supports both v2 (current NetMozi standard) and v1 (legacy).
 */

const M = BigInt(0xFFFFFFFF);

function _seed(value) {
  let state = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    state ^= value.charCodeAt(i);
    state = (state + (state << 1) + (state << 4) + (state << 7) + (state << 8) + (state << 24)) >>> 0;
  }
  return state >>> 0;
}

function _generator(state) {
  let s = state >>> 0;
  return function nxt() {
    s ^= (s << 13) >>> 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0;
    return s >>> 0;
  };
}

/**
 * Unpacks encrypted NetMozi payload into an array of URLs or data objects.
 * Supports v2 (v: 2, s, d, m, h) and v1 (r, p, n).
 */
function unpack(value, token) {
  if (!value || typeof token !== 'string' || !token) return [];

  // 1. NetMozi V2 Protocol (current)
  if (value.v === 2) {
    try {
      if (!value.s || !Array.isArray(value.d) || typeof value.m !== 'string') return [];
      const manifest = Buffer.from(value.m, 'base64').toString('binary');
      if (!manifest.length || manifest.length % 4) return [];
      const order = _generator(_seed(token + '|' + value.s + '|v2/positions') || 1);
      let encoded = '';
      for (let i = 0; i < manifest.length; i += 4) {
        const entry = (((manifest.charCodeAt(i) << 24) | (manifest.charCodeAt(i + 1) << 16)
          | (manifest.charCodeAt(i + 2) << 8) | manifest.charCodeAt(i + 3))) >>> 0;
        const position = (entry ^ order()) >>> 0;
        const bin = position % 4;
        const index = Math.floor(position / 4);
        if (!Array.isArray(value.d[bin]) || typeof value.d[bin][index] !== 'string') return [];
        encoded += value.d[bin][index];
      }

      const state = _seed('v2|' + value.s + '|' + token) || 1;
      let previous = state & 255;
      const bytes = Buffer.from(encoded, 'base64').toString('binary');
      const next = _generator(state);
      let plain = '';
      let escaped = '';
      for (let i = 0; i < bytes.length; i++) {
        const cipher = bytes.charCodeAt(i);
        const code = ((cipher ^ (next() & 255)) - previous - (i % 251)) & 255;
        previous = cipher;
        plain += String.fromCharCode(code);
        escaped += '%' + ('0' + code.toString(16)).slice(-2);
      }

      const routes = JSON.parse(decodeURIComponent(escaped));
      return Array.isArray(routes) ? routes : [routes];
    } catch (e) {
      return [];
    }
  }

  // 2. NetMozi V1 Protocol (legacy fallback)
  if (value.r && value.p) {
    try {
      const seedOrder = _seed(token + '|' + value.n + '|order') || 1;
      const order = _generator(seedOrder);
      let encoded = '';
      for (const r of value.r) {
        const position = (Number(r) ^ order()) >>> 0;
        encoded += value.p[position % 3][Math.floor(position / 3)];
      }
      const raw = Buffer.from(encoded, 'base64');
      const seedPlain = _seed(token + '|' + value.n) || 1;
      const nxt = _generator(seedPlain);
      const plain = Buffer.alloc(raw.length);
      for (let i = 0; i < raw.length; i++) {
        plain[i] = raw[i] ^ (nxt() & 255);
      }
      return JSON.parse(plain.toString('utf8'));
    } catch (e) {
      return [];
    }
  }

  return [];
}

/**
 * Resolves all encrypted data-content-payload scripts in NetMozi HTML pages.
 */
function resolveContent(html) {
  if (!html || typeof html !== 'string') return '';
  for (let iter = 0; iter < 3; iter++) {
    if (!html.includes('data-content-payload')) break;
    const regex = /<script[^>]*data-content-payload[^>]*data-content-context="([^"]+)"[^>]*>(.*?)<\/script>/gs;
    let match;
    let replacedAny = false;
    while ((match = regex.exec(html)) !== null) {
      try {
        const context = match[1];
        const payload = JSON.parse(match[2]);
        const decodedArr = unpack(payload.value, context);
        const decoded = Array.isArray(decodedArr) ? decodedArr.join('') : String(decodedArr);
        
        const scopeRegex = new RegExp('<div[^>]*data-content-scope="' + payload.scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>.*?<\\/div>', 's');
        html = html.replace(scopeRegex, decoded);
        html = html.replace(match[0], '');
        replacedAny = true;
      } catch (e) {
        // Continue if single block fails
      }
    }
    if (!replacedAny) break;
  }
  return html;
}

module.exports = {
  unpack,
  resolveContent,
  _seed,
  _generator
};
