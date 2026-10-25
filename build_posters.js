const fs = require('fs');
const path = require('path');

const channelsDir = path.join(__dirname, 'public', 'channels');

const CHANNEL_CONFIGS = [
  {
    key: 'm1',
    name: 'M1 HÍRADÓ',
    sub: 'Nemzeti Hírcsatorna • 24/7 Élő',
    tag: 'ÉLŐ HÍRADÓ',
    bg1: '#040d1a',
    bg2: '#0b1f3d',
    glow: '#0066cc',
    accent: '#38bdf8',
    logoWidth: 320,
    logoHeight: 280
  },
  {
    key: 'm2',
    name: 'M2 GYEREK & PETŐFI',
    sub: 'Mesék • Rajzfilmek • Ifjúság',
    tag: 'ÉLŐ MESE & ZENE',
    bg1: '#03170a',
    bg2: '#093618',
    glow: '#65a30d',
    accent: '#a3e635',
    logoWidth: 320,
    logoHeight: 270
  },
  {
    key: 'm4',
    name: 'M4 SPORT',
    sub: 'Forma-1 • Labdarúgás • Bajnokságok',
    tag: 'ÉLŐ SPORT ADÁS',
    bg1: '#190204',
    bg2: '#3d060c',
    glow: '#e30613',
    accent: '#f87171',
    logoWidth: 420,
    logoHeight: 140
  },
  {
    key: 'm4plus',
    name: 'M4 SPORT+',
    sub: 'Párhuzamos Rangadók & Meccsek',
    tag: 'ÉLŐ EXTRA SPORT',
    bg1: '#1c0205',
    bg2: '#45070e',
    glow: '#ff2b3e',
    accent: '#fb7185',
    logoWidth: 380,
    logoHeight: 250
  },
  {
    key: 'm5',
    name: 'M5 KULTÚRA',
    sub: 'Színház • Dokumentumfilm • Művészet',
    tag: 'ÉLŐ KULTÚRA',
    bg1: '#14031c',
    bg2: '#36084a',
    glow: '#9333ea',
    accent: '#c084fc',
    logoWidth: 360,
    logoHeight: 220
  },
  {
    key: 'duna',
    name: 'DUNA TV',
    sub: 'Nemzeti Főadó • Magyar Filmek',
    tag: 'ÉLŐ NEMZETI ADÁS',
    bg1: '#030f1e',
    bg2: '#092952',
    glow: '#0284c7',
    accent: '#38bdf8',
    logoWidth: 400,
    logoHeight: 200
  },
  {
    key: 'dunaworld',
    name: 'DUNA WORLD',
    sub: 'Határon Túli • Nemzetiségi • Hagyomány',
    tag: 'ÉLŐ VILÁG ADÁS',
    bg1: '#021417',
    bg2: '#05343d',
    glow: '#0d9488',
    accent: '#2dd4bf',
    logoWidth: 400,
    logoHeight: 200
  }
];

function generateSvgPoster(cfg) {
  const pngPath = path.join(channelsDir, `${cfg.key}.png`);
  let logoDataUri = '';
  if (fs.existsSync(pngPath)) {
    const pngBase64 = fs.readFileSync(pngPath).toString('base64');
    logoDataUri = `data:image/png;base64,${pngBase64}`;
  }

  const logoX = Math.round((600 - cfg.logoWidth) / 2);
  const logoY = Math.round(390 - (cfg.logoHeight / 2));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${cfg.bg1}" />
      <stop offset="100%" stop-color="${cfg.bg2}" />
    </linearGradient>

    <!-- Center Glow -->
    <radialGradient id="glowGrad" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="${cfg.glow}" stop-opacity="0.38" />
      <stop offset="65%" stop-color="${cfg.glow}" stop-opacity="0.08" />
      <stop offset="100%" stop-color="${cfg.glow}" stop-opacity="0" />
    </radialGradient>

    <!-- Glass Pill Gradient -->
    <linearGradient id="pillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </linearGradient>
  </defs>

  <!-- Background Base -->
  <rect width="600" height="900" fill="url(#bgGrad)" />

  <!-- Ambient Light Circle -->
  <circle cx="300" cy="400" r="340" fill="url(#glowGrad)" />

  <!-- Subtle Modern Border Frame -->
  <rect x="18" y="18" width="564" height="864" rx="28" fill="none" stroke="${cfg.accent}" stroke-opacity="0.25" stroke-width="2" />

  <!-- Top Live Badge -->
  <g transform="translate(300, 80)">
    <rect x="-130" y="-22" width="260" height="44" rx="22" fill="url(#pillGrad)" stroke="${cfg.accent}" stroke-opacity="0.4" stroke-width="1.5" />
    <circle cx="-95" cy="0" r="6" fill="#ef4444">
      <animate attributeName="opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
    </circle>
    <text x="-80" y="5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="14" font-weight="800" fill="#ffffff" letter-spacing="2">${cfg.tag}</text>
  </g>

  <!-- Center Channel Logo -->
  <g transform="translate(0, 0)">
    <!-- Logo Shadow Backdrop -->
    <ellipse cx="300" cy="400" rx="${Math.round(cfg.logoWidth * 0.55)}" ry="${Math.round(cfg.logoHeight * 0.6)}" fill="#000000" fill-opacity="0.45" filter="blur(20px)" />
    
    <!-- Official PNG Logo Image -->
    <image href="${logoDataUri}" x="${logoX}" y="${logoY}" width="${cfg.logoWidth}" height="${cfg.logoHeight}" preserveAspectRatio="xMidYMid meet" />
  </g>

  <!-- Bottom Channel Typography & Badges -->
  <g transform="translate(300, 680)">
    <!-- Main Channel Name -->
    <text x="0" y="0" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff" letter-spacing="2">
      ${cfg.name}
    </text>

    <!-- Subtitle Description -->
    <text x="0" y="32" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="500" fill="${cfg.accent}" letter-spacing="0.5">
      ${cfg.sub}
    </text>

    <!-- Quality Footer Pill -->
    <g transform="translate(0, 85)">
      <rect x="-140" y="-18" width="280" height="36" rx="18" fill="#000000" fill-opacity="0.6" stroke="${cfg.accent}" stroke-opacity="0.35" stroke-width="1" />
      <text x="0" y="5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#f8fafc" letter-spacing="1.5">
        FULL HD 1080p • MTVA ÉLŐ
      </text>
    </g>
  </g>
</svg>`;
}

for (const cfg of CHANNEL_CONFIGS) {
  const svg = generateSvgPoster(cfg);
  const outPath = path.join(channelsDir, `poster-${cfg.key}.svg`);
  fs.writeFileSync(outPath, svg, 'utf8');
  console.log(`Generated poster-${cfg.key}.svg (${svg.length} bytes)`);
}

console.log('All 7 official channel posters generated successfully!');
