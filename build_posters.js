const fs = require('fs');
const path = require('path');

const CHANNELS = [
  {
    key: 'm4',
    name: 'M4 SPORT',
    badge: 'ÉLŐ SPORT',
    themeColor: '#e30613',
    glowColor: '#ff2233',
    bg1: '#1c0305',
    bg2: '#38060b',
    svgLogo: `
      <g transform="translate(300, 420) scale(1.15)">
        <circle cx="0" cy="0" r="140" fill="#e30613" fill-opacity="0.3" filter="blur(30px)" />
        <g transform="skewX(-14)">
          <g transform="translate(-155, 0)">
            <circle cx="0" cy="0" r="62" fill="none" stroke="#ffffff" stroke-width="11" />
            <circle cx="0" cy="0" r="62" fill="none" stroke="#e30613" stroke-width="11" stroke-dasharray="80 300" stroke-dashoffset="40" />
            <line x1="-32" y1="-68" x2="32" y2="68" stroke="#ffffff" stroke-width="11" stroke-linecap="round" />
            <line x1="-12" y1="-72" x2="12" y2="72" stroke="#e30613" stroke-width="9" stroke-linecap="round" />
          </g>
          <text x="-70" y="38" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="115" fill="#ffffff" letter-spacing="-2">m4</text>
          <g transform="translate(105, 5)">
            <rect x="-10" y="-38" width="135" height="48" rx="8" fill="#e30613" />
            <text x="57" y="-5" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="34" fill="#ffffff" letter-spacing="1.5">SPORT</text>
          </g>
        </g>
      </g>
    `
  },
  {
    key: 'm4plus',
    name: 'M4 SPORT+',
    badge: 'ÉLŐ SPORT+',
    themeColor: '#ff2b3e',
    glowColor: '#ff4455',
    bg1: '#1f0407',
    bg2: '#42080f',
    svgLogo: `
      <g transform="translate(300, 420) scale(1.12)">
        <circle cx="0" cy="0" r="140" fill="#ff2b3e" fill-opacity="0.32" filter="blur(30px)" />
        <g transform="skewX(-14)">
          <g transform="translate(-175, 0)">
            <circle cx="0" cy="0" r="58" fill="none" stroke="#ffffff" stroke-width="11" />
            <line x1="-30" y1="-64" x2="30" y2="64" stroke="#ffffff" stroke-width="11" stroke-linecap="round" />
            <line x1="-10" y1="-68" x2="10" y2="68" stroke="#ff2b3e" stroke-width="9" stroke-linecap="round" />
          </g>
          <text x="-95" y="36" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="108" fill="#ffffff" letter-spacing="-2">m4</text>
          <g transform="translate(70, 5)">
            <rect x="-8" y="-36" width="130" height="46" rx="8" fill="#ff2b3e" />
            <text x="57" y="-4" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="30" fill="#ffffff" letter-spacing="1">SPORT</text>
            <rect x="128" y="-36" width="46" height="46" rx="8" fill="#ffffff" />
            <text x="151" y="-2" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="36" fill="#e30613">+</text>
          </g>
        </g>
      </g>
    `
  },
  {
    key: 'm1',
    name: 'M1 HÍRADÓ',
    badge: 'ÉLŐ HÍRADÓ',
    themeColor: '#0074d9',
    glowColor: '#00a8ff',
    bg1: '#040d1a',
    bg2: '#0a1e3d',
    svgLogo: `
      <g transform="translate(300, 410) scale(1.2)">
        <circle cx="0" cy="0" r="140" fill="#0074d9" fill-opacity="0.3" filter="blur(30px)" />
        <g transform="translate(-85, 0)">
          <circle cx="0" cy="0" r="68" fill="none" stroke="#ffffff" stroke-width="12" />
          <line x1="0" y1="-88" x2="0" y2="88" stroke="#0088ff" stroke-width="14" stroke-linecap="round" />
          <circle cx="0" cy="0" r="68" fill="none" stroke="#00a8ff" stroke-width="12" stroke-dasharray="60 200" stroke-dashoffset="30" />
        </g>
        <g transform="translate(35, 36)">
          <text x="0" y="0" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="115" fill="#ffffff" letter-spacing="-3">m1</text>
        </g>
        <g transform="translate(0, 115)">
          <rect x="-105" y="-22" width="210" height="40" rx="6" fill="#0074d9" />
          <text x="0" y="6" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="22" fill="#ffffff" letter-spacing="3">HÍRADÓ</text>
        </g>
      </g>
    `
  },
  {
    key: 'm2',
    name: 'M2 GYEREK & PETŐFI',
    badge: 'ÉLŐ MESE ÉS ZENE',
    themeColor: '#84cc16',
    glowColor: '#a3e635',
    bg1: '#03170a',
    bg2: '#083317',
    svgLogo: `
      <g transform="translate(300, 410) scale(1.2)">
        <circle cx="0" cy="0" r="140" fill="#84cc16" fill-opacity="0.32" filter="blur(30px)" />
        <g transform="translate(-85, 0)">
          <circle cx="0" cy="0" r="68" fill="none" stroke="#ffffff" stroke-width="12" />
          <circle cx="0" cy="0" r="68" fill="none" stroke="#84cc16" stroke-width="12" stroke-dasharray="140 200" stroke-dashoffset="50" />
          <line x1="-40" y1="40" x2="40" y2="-40" stroke="#facc15" stroke-width="12" stroke-linecap="round" />
        </g>
        <g transform="translate(35, 36)">
          <text x="0" y="0" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="115" fill="#ffffff" letter-spacing="-3">m2</text>
        </g>
        <g transform="translate(0, 115)">
          <rect x="-135" y="-22" width="130" height="40" rx="6" fill="#84cc16" />
          <text x="-70" y="6" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="19" fill="#0f172a" letter-spacing="1.5">GYEREK</text>
          <rect x="5" y="-22" width="130" height="40" rx="6" fill="#f97316" />
          <text x="70" y="6" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="19" fill="#ffffff" letter-spacing="1.5">PETŐFI</text>
        </g>
      </g>
    `
  },
  {
    key: 'm5',
    name: 'M5 KULTÚRA',
    badge: 'ÉLŐ KULTÚRA',
    themeColor: '#a855f7',
    glowColor: '#c084fc',
    bg1: '#14031c',
    bg2: '#320645',
    svgLogo: `
      <g transform="translate(300, 410) scale(1.2)">
        <circle cx="0" cy="0" r="140" fill="#a855f7" fill-opacity="0.32" filter="blur(30px)" />
        <g transform="translate(-85, 0)">
          <circle cx="0" cy="0" r="68" fill="none" stroke="#ffffff" stroke-width="12" />
          <circle cx="0" cy="0" r="68" fill="none" stroke="#a855f7" stroke-width="12" stroke-dasharray="140 200" stroke-dashoffset="50" />
          <line x1="-35" y1="-22" x2="35" y2="-22" stroke="#facc15" stroke-width="9" stroke-linecap="round" />
          <line x1="-22" y1="0" x2="48" y2="0" stroke="#facc15" stroke-width="9" stroke-linecap="round" />
          <line x1="-48" y1="22" x2="22" y2="22" stroke="#facc15" stroke-width="9" stroke-linecap="round" />
        </g>
        <g transform="translate(35, 36)">
          <text x="0" y="0" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="115" fill="#ffffff" letter-spacing="-3">m5</text>
        </g>
        <g transform="translate(0, 115)">
          <rect x="-105" y="-22" width="210" height="40" rx="6" fill="#9333ea" />
          <text x="0" y="6" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="22" fill="#ffffff" letter-spacing="3">KULTÚRA</text>
        </g>
      </g>
    `
  },
  {
    key: 'duna',
    name: 'DUNA TV',
    badge: 'ÉLŐ NEMZETI FŐADÓ',
    themeColor: '#0284c7',
    glowColor: '#38bdf8',
    bg1: '#030f1e',
    bg2: '#08254a',
    svgLogo: `
      <g transform="translate(300, 410) scale(1.15)">
        <circle cx="0" cy="0" r="140" fill="#0284c7" fill-opacity="0.32" filter="blur(30px)" />
        <g transform="translate(-120, 0)">
          <circle cx="0" cy="0" r="66" fill="none" stroke="#ffffff" stroke-width="11" />
          <circle cx="0" cy="0" r="66" fill="none" stroke="#0284c7" stroke-width="11" stroke-dasharray="120 200" stroke-dashoffset="60" />
          <path d="M -50,15 C -25,-30 25,30 50,-15" fill="none" stroke="#38bdf8" stroke-width="11" stroke-linecap="round" />
        </g>
        <g transform="translate(25, 36)">
          <text x="0" y="0" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="100" fill="#ffffff" letter-spacing="-1">duna</text>
        </g>
        <g transform="translate(0, 115)">
          <rect x="-120" y="-22" width="240" height="40" rx="6" fill="#0284c7" />
          <text x="0" y="6" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="19" fill="#ffffff" letter-spacing="2">NEMZETI FŐADÓ</text>
        </g>
      </g>
    `
  },
  {
    key: 'dunaworld',
    name: 'DUNA WORLD',
    badge: 'ÉLŐ VILÁG CSATORNA',
    themeColor: '#0d9488',
    glowColor: '#2dd4bf',
    bg1: '#021417',
    bg2: '#062f36',
    svgLogo: `
      <g transform="translate(300, 410) scale(1.15)">
        <circle cx="0" cy="0" r="140" fill="#0d9488" fill-opacity="0.32" filter="blur(30px)" />
        <g transform="translate(-135, 0)">
          <circle cx="0" cy="0" r="66" fill="none" stroke="#ffffff" stroke-width="11" />
          <path d="M -48,2 C -24,-26 24,26 48,-2" fill="none" stroke="#2dd4bf" stroke-width="9" stroke-linecap="round" />
          <path d="M -48,24 C -24,-4 24,48 48,20" fill="none" stroke="#14b8a6" stroke-width="9" stroke-linecap="round" />
        </g>
        <g transform="translate(10, 15)">
          <text x="0" y="0" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="80" fill="#ffffff" letter-spacing="-1">duna</text>
          <text x="3" y="38" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="34" fill="#2dd4bf" letter-spacing="4">WORLD</text>
        </g>
        <g transform="translate(0, 115)">
          <rect x="-125" y="-22" width="250" height="40" rx="6" fill="#0d9488" />
          <text x="0" y="6" text-anchor="middle" font-family="'Arial Black', -apple-system, sans-serif" font-weight="900" font-size="18" fill="#ffffff" letter-spacing="2">HATÁROK NÉLKÜL</text>
        </g>
      </g>
    `
  }
];

function buildFullSvg(ch) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${ch.bg1}" />
      <stop offset="100%" stop-color="${ch.bg2}" />
    </linearGradient>

    <radialGradient id="glowGrad" cx="50%" cy="46%" r="55%">
      <stop offset="0%" stop-color="${ch.glowColor}" stop-opacity="0.45" />
      <stop offset="60%" stop-color="${ch.themeColor}" stop-opacity="0.12" />
      <stop offset="100%" stop-color="${ch.bg1}" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="pillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </linearGradient>
  </defs>

  <rect width="600" height="900" fill="url(#bgGrad)" />
  <circle cx="300" cy="415" r="320" fill="url(#glowGrad)" />
  <rect x="18" y="18" width="564" height="864" rx="28" fill="none" stroke="${ch.themeColor}" stroke-opacity="0.35" stroke-width="2" />

  <g transform="translate(300, 75)">
    <rect x="-125" y="-22" width="250" height="44" rx="22" fill="url(#pillGrad)" stroke="${ch.themeColor}" stroke-opacity="0.5" stroke-width="1.5" />
    <circle cx="-85" cy="0" r="6" fill="#ef4444" />
    <text x="-68" y="6" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#ffffff" letter-spacing="2">${ch.badge.replace(/&/g, '&amp;')}</text>
  </g>

  ${ch.svgLogo}

  <g transform="translate(300, 805)">
    <rect x="-140" y="-20" width="280" height="40" rx="20" fill="#000000" fill-opacity="0.65" stroke="${ch.themeColor}" stroke-opacity="0.4" stroke-width="1.5" />
    <text x="0" y="6" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#ffffff" letter-spacing="2">
      FULL HD 1080p • ÉLŐ
    </text>
  </g>
</svg>`;
}

function buildLogoSvg(ch) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
  <g transform="translate(0, -265)">
    ${ch.svgLogo}
  </g>
</svg>`;
}

const outDir = path.join(__dirname, 'public', 'channels');
for (const ch of CHANNELS) {
  const posterSvg = buildFullSvg(ch);
  fs.writeFileSync(path.join(outDir, `poster-${ch.key}.svg`), posterSvg, 'utf8');

  const logoSvg = buildLogoSvg(ch);
  fs.writeFileSync(path.join(outDir, `${ch.key}.svg`), logoSvg, 'utf8');
}
console.log('Successfully generated posters and logos for all 7 channels!');
