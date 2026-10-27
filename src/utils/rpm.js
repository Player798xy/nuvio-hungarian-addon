/**
 * RPM Share / RPM Stream Decryption & Extraction Engine
 * Ported from Thsandorh/Hd-mozi-scraper (MIT License)
 * Handles AES-CBC decryption, player token generation, and HLS variant extraction.
 */

const { webcrypto } = require('node:crypto');
const { subtle } = webcrypto;

const RPM_CONFIG = {
  baseUrl: 'https://rpmshare.rpmstream.live',
  keyHex: '6b69656d7469656e6d75613931316361', // "kiemtienmua911ca"
  iv: new Uint8Array([49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 111, 105, 117, 121, 116, 114]), // "123456789oiuytr"
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

function hexToBytes(hex) {
  const clean = (hex || '').trim();
  const matches = clean.match(/[\da-f]{2}/gi);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

function getAESKey() {
  return hexToBytes(RPM_CONFIG.keyHex);
}

// 🔓 Decrypt RPM hex-encoded response
async function decryptRpmResponse(hexData) {
  try {
    const keyBytes = getAESKey();
    const dataBytes = hexToBytes(hexData);

    if (dataBytes.length === 0) {
      throw new Error('Invalid hex data');
    }

    const key = await subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, true, ['decrypt']);
    const plaintext = await subtle.decrypt({ name: 'AES-CBC', iv: RPM_CONFIG.iv }, key, dataBytes);
    return new TextDecoder().decode(new Uint8Array(plaintext));
  } catch (error) {
    throw new Error(`RPM Decryption failed: ${error.message}`);
  }
}

// 🔐 Generate player token (AES-CBC encrypted payload with PKCS7 padding)
async function generatePlayerToken(playerId) {
  try {
    const payload = {
      id: playerId,
      w: 1920,
      h: 1080,
      r: RPM_CONFIG.baseUrl
    };

    const payloadJson = JSON.stringify(payload);
    const keyBytes = getAESKey();
    const payloadBytes = new TextEncoder().encode(payloadJson);

    // PKCS7 padding for AES
    const blockSize = 16;
    const paddingNeeded = blockSize - (payloadBytes.length % blockSize);
    const paddedPayload = new Uint8Array(payloadBytes.length + paddingNeeded);
    paddedPayload.set(payloadBytes);
    for (let i = payloadBytes.length; i < paddedPayload.length; i++) {
      paddedPayload[i] = paddingNeeded;
    }

    const key = await subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, true, ['encrypt']);
    const encrypted = await subtle.encrypt({ name: 'AES-CBC', iv: RPM_CONFIG.iv }, key, paddedPayload);

    const encryptedBytes = new Uint8Array(encrypted);
    return Array.from(encryptedBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    throw new Error(`RPM Token generation failed: ${error.message}`);
  }
}

// 📋 Get video info
async function getVideoInfo(videoId) {
  try {
    const url = `${RPM_CONFIG.baseUrl}/api/v1/info?id=${videoId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': RPM_CONFIG.userAgent,
        'Referer': `${RPM_CONFIG.baseUrl}/#${videoId}`
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const hexData = await response.text();
    const decrypted = await decryptRpmResponse(hexData);
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Failed to get RPM video info: ${error.message}`);
  }
}

// 🎬 Extract stream data
async function extractStreamData(videoId, playerId, token) {
  try {
    const url = `${RPM_CONFIG.baseUrl}/api/v1/video?id=${videoId}&w=1920&h=1080&r=`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': RPM_CONFIG.userAgent,
        'Referer': `${RPM_CONFIG.baseUrl}/#${videoId}`
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const hexData = await response.text();
    if (!/^[0-9a-f\s]+$/i.test(hexData.trim()) || hexData.length < 100) {
      throw new Error('Response is not encrypted data');
    }

    const decrypted = await decryptRpmResponse(hexData);
    const streamData = JSON.parse(decrypted);

    if (!streamData.hls && !streamData.source) {
      throw new Error('No stream URLs found in RPM response');
    }

    return streamData;
  } catch (error) {
    throw new Error(`Failed to extract RPM stream data: ${error.message}`);
  }
}

// 🎯 Main RPM stream extractor
async function extractRpmStream(videoId) {
  try {
    const videoInfo = await getVideoInfo(videoId);
    if (!videoInfo || !videoInfo.playerId) {
      throw new Error('Invalid RPM videoInfo');
    }

    const token = await generatePlayerToken(videoInfo.playerId);
    const streamData = await extractStreamData(videoId, videoInfo.playerId, token);

    const result = {
      title: videoInfo.title,
      streams: []
    };

    if (streamData.source) {
      try {
        const masterUrl = streamData.source;
        const u = new URL(masterUrl);
        const host = u.hostname || '';
        const isIpHost = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
        const isRpmDomain = host.includes('rpmstream.live');
        const baseOrigin = `${u.protocol}//${u.host}`;
        const vParam = u.searchParams.get('v');

        if (isIpHost || !isRpmDomain) {
          const refererBase = isIpHost ? RPM_CONFIG.baseUrl : baseOrigin;
          const resp = await fetch(masterUrl, {
            headers: {
              'User-Agent': RPM_CONFIG.userAgent,
              'Referer': refererBase,
              'Origin': refererBase
            },
            signal: AbortSignal.timeout(4000)
          });

          if (resp.ok) {
            const m3u8 = await resp.text();
            const lines = m3u8.split(/\r?\n/);
            let lastInf = null;
            const variants = [];

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              if (line.startsWith('#EXT-X-STREAM-INF')) {
                lastInf = line;
                continue;
              }
              if (line.startsWith('#')) continue;
              if (lastInf) {
                let variantUrl;
                try {
                  variantUrl = new URL(line, masterUrl);
                } catch (_) {
                  try { variantUrl = new URL(masterUrl); } catch (_) { variantUrl = null; }
                }

                if (variantUrl) {
                  if (vParam && !variantUrl.searchParams.has('v')) {
                    variantUrl.searchParams.set('v', vParam);
                  }

                  let quality = '720p';
                  let height = 720;
                  try {
                    const res = lastInf.match(/RESOLUTION=(\d+)x(\d+)/i);
                    if (res) {
                      height = parseInt(res[2], 10);
                      if (height >= 2160) quality = '2160p';
                      else if (height >= 1440) quality = '1440p';
                      else if (height >= 1080) quality = '1080p';
                      else if (height >= 720) quality = '720p';
                      else if (height >= 480) quality = '480p';
                      else quality = `${height}p`;
                    }
                  } catch (_) {}

                  variants.push({ url: variantUrl.href, quality, height });
                }
                lastInf = null;
              }
            }

            if (variants.length > 0) {
              for (const v of variants) {
                result.streams.push({
                  url: v.url,
                  quality: v.quality,
                  height: v.height,
                  type: 'hls',
                  source: 'rpm'
                });
              }
            } else {
              result.streams.push({
                url: masterUrl,
                quality: '720p',
                height: 720,
                type: 'hls',
                source: 'rpm'
              });
            }
          } else {
            result.streams.push({
              url: masterUrl,
              quality: '720p',
              height: 720,
              type: 'hls',
              source: 'rpm'
            });
          }
        }
      } catch (err) {
        console.warn('[RPM] Master URL parse error:', err.message);
      }
    }

    return result;
  } catch (error) {
    console.warn(`[RPM] Extraction failed: ${error.message}`);
    return null;
  }
}

module.exports = {
  RPM_CONFIG,
  extractRpmStream,
  getVideoInfo,
  generatePlayerToken,
  decryptRpmResponse
};
