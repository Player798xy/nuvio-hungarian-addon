/**
 * NetMozi Payload Decoder & Content Resolver
 * Pure Node.js port of the Kodi NetMozi addon linkpayload module.
 * Reconstructs encrypted data-content-payload and linkPayload structures from netmozi.com.
 */

const M = BigInt(0xFFFFFFFF);

function _seed(value) {
  let state = BigInt(2166136261);
  for (let i = 0; i < value.length; i++) {
    const ch = BigInt(value.charCodeAt(i));
    state = (state ^ ch) & M;
    state = (state + (state << 1n) + (state << 4n) + (state << 7n) + (state << 8n) + (state << 24n)) & M;
  }
  return Number(state);
}

function _generator(state) {
  let s = BigInt(state);
  return function nxt() {
    let x = (s ^ (s << 13n)) & M;
    x = (x ^ (x >> 17n)) & M;
    x = (x ^ (x << 5n)) & M;
    s = x;
    return Number(x);
  };
}

/**
 * Unpacks encrypted NetMozi payload into an array of URLs or data objects.
 */
function unpack(value, token) {
  if (!value || !value.r || !value.p) return [];
  const seedOrder = _seed(token + '|' + value.n + '|order') || 1;
  const order = _generator(seedOrder);
  let encoded = '';
  for (const r of value.r) {
    const position = (Number(r) ^ order()) & Number(M);
    encoded += value.p[position % 3][Math.floor(position / 3)];
  }
  const raw = Buffer.from(encoded, 'base64');
  const seedPlain = _seed(token + '|' + value.n) || 1;
  const nxt = _generator(seedPlain);
  const plain = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) {
    plain[i] = raw[i] ^ (nxt() & 255);
  }
  try {
    return JSON.parse(plain.toString('utf8'));
  } catch (e) {
    return [];
  }
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
