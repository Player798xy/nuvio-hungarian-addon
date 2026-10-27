# 🇭🇺 Hungarian Streams — Nuvio & Stremio Addon

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.7.3-blue.svg?style=flat-square)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Deploy on Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://nuvio-hungarian-addon.vercel.app)
[![Docker Support](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](#-docker--docker-compose)

Egy nagy teljesítményű, felhő- és szerverbarát **Nuvio** és **Stremio** kiegészítő (addon), amely magyar szinkronos és feliratos filmeket, sorozatokat, meséket, valamint élő TV csatornákat gyűjt össze a legnépszerűbb magyar forrásokból **1080p FHD és 720p HD** felbontásban, közvetlen indítással.

---

## 🌐 Hivatalos Élő Addon & Webes Felület

A kiegészítő azonnal használható felhőben anélkül, hogy bármit telepítened kellene:

👉 **[https://nuvio-hungarian-addon.vercel.app](https://nuvio-hungarian-addon.vercel.app)**

- **Addon Manifest URL:** `https://nuvio-hungarian-addon.vercel.app/manifest.json`
- **1-Kattintásos Stremio Telepítés:** [Megnyitás Stremio-ban](https://nuvio-hungarian-addon.vercel.app) (vagy illeszd be a `stremio://nuvio-hungarian-addon.vercel.app/manifest.json` hivatkozást)

---

## 📺 Telepítési Útmutató

### Nuvio (Android TV, Google TV, Telefon, Tablet)
1. Nyisd meg a **Nuvio** alkalmazást az eszközödön.
2. Navigálj a **Settings** (Beállítások) ➔ **Add-ons / Plugins** menüpontba.
3. Kattints az **Add Addon** (Hozzáadás URL alapján) gombra.
4. Írd vagy másold be az alábbi címet:
   ```text
   https://nuvio-hungarian-addon.vercel.app/manifest.json
   ```
5. Mentsd el. Ezt követően a filmeknél és sorozatoknál automatikusan megjelennek a magyar szinkronos és HD streamek.

### Stremio (Minden platform)
1. Nyisd meg a [https://nuvio-hungarian-addon.vercel.app](https://nuvio-hungarian-addon.vercel.app) oldalt böngészőben.
2. Igény esetén pipáld be vagy kapcsold ki a kívánt forrásokat, majd kattints a **"Telepítés Stremio-ba"** gombra.
3. Vagy a Stremio keresőjébe (vagy az Addonok menüben az URL beillesztéshez) írd be:
   ```text
   https://nuvio-hungarian-addon.vercel.app/manifest.json
   ```

---

## 🌟 Támogatott Források (11 Integrált Szolgáltató)

Minden forrás **valós idejű, élő scraperrel** működik (nincs memóriát foglaló, elavult stream-cache, minden lekérés a legfrissebb közvetlen linkeket adja vissza):

| Forrás | Típus | Minőség | Leírás |
| :--- | :---: | :---: | :--- |
| **NetMozi.com** | Film / Sorozat | 1080p / 720p | Teljes Kodi addon port, Cloudflare TLS bypass (`OP_NO_TICKET`), VOE, Direct MP4, Videa, DoodStream, Vinovo |
| **Videa.hu** | Film / Sorozat | 1080p / 720p | Natív RC4 XML dekódolás, FCode noembed bypass, hardveresen gyorsított közvetlen MP4 streamek |
| **MédiaKlikk (MTVA)** | Élő TV / Sorozat | 1080p / 720p | Hivatalos MTVA élő csatornák (M1, M2, M4 Sport, Duna, M5, Duna World) és VOD archívum |
| **Indavideo.hu** | Film / Mese | 720p / 480p | Közvetlen MP4 letöltési és stream linkek tokenizált CDN szerverekről |
| **JobbMintATV** | Film / Sorozat | 1080p / 720p | JobbMintATV adatbázis kibontás Videa és OK.ru nagyfelbontású streamekkel |
| **Filmvilág2** | Film | 1080p / 720p | Filmvilág2 Videa motor integráció |
| **MeseFilm / Kincstár** | Mese / Családi | 1080p / 720p | Magyar népmesék, retro és modern rajzfilmek, ifjúsági sorozatok |
| **DMDAMedia** | Film / Sorozat | 1080p / 720p | Online film és epizódtár |
| **Filmezek.com** | Film / Sorozat | 1080p / 720p | Videa és OK.ru beágyazások mély feloldása |
| **OnlineFilmekIngyen** | Film / Sorozat | 1080p / 720p | DooPlay AJAX motor integráció |
| **HDMozi.hu (RPM)** | Film / Sorozat | 1080p / 720p | DooPlayer & RPM AES-CBC motor integráció (Thsandorh/Hd-mozi-scraper port), közvetlen IP HLS (.m3u8) streamek |

---

## 🚀 Önkiszolgáló Üzemeltetés (Self-Hosting Guide)

Az addon futtatható a nyilvános felhőben (Vercel) vagy közvetlenül a saját otthoni hálózatodon / szervereden (Raspberry Pi, Home Assistant, Linux/Windows PC, Docker).

> 💡 **Tipp:** Ha otthoni magyar internetkapcsolaton (vagy magyarországi szerveren) self-hosztolod az addont, a **NetMozi** és az összes szigorúan geo-blokkolt magyar forrás is 100%-ban korlátozásmentesen működik a TV-den és mobilodon, mivel a weboldalak lakossági magyar IP-címről érkező kérésekként azonosítják!

### 1. Docker & Docker Compose (Ajánlott)

A tároló tartalmaz előre konfigurált `Dockerfile`-t és `docker-compose.yml`-t.

1. **Klónozd a tárolót:**
   ```bash
   git clone https://github.com/Player798xy/nuvio-hungarian-addon.git
   cd nuvio-hungarian-addon
   ```

2. **Indítás Docker Compose-zal egyetlen paranccsal:**
   ```bash
   docker compose up -d --build
   ```

3. **Ellenőrzés:**
   A szerver a `7000`-es porton figyel:
   - Webes felület: `http://localhost:7000`
   - Manifest: `http://localhost:7000/manifest.json`

4. **Leállítás és újraindítás:**
   ```bash
   docker compose down
   docker compose restart
   ```

---

### 2. Helyi futtatás vagy VPS (Node.js & PM2)

**Előfeltétel:** Node.js 18.0.0 vagy újabb.

1. **Függőségek telepítése:**
   ```bash
   git clone https://github.com/Player798xy/nuvio-hungarian-addon.git
   cd nuvio-hungarian-addon
   npm install
   ```

2. **Szerver indítása fejlesztői vagy teszt üzemmódban:**
   ```bash
   npm start
   ```

3. **Folyamatos futtatás háttérben PM2 segítségével (Linux VPS-en):**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "nuvio-addon"
   pm2 startup
   pm2 save
   ```

---

### 3. Saját Vercel Telepítés (Ingyenes)

1. Kattints a GitHubon a **Fork** gombra a projektnél.
2. Nyisd meg a [vercel.com](https://vercel.com) felületét és jelentkezz be a GitHub fiókoddal.
3. Válaszd az **"Add New Project"** gombot, majd válaszd ki a leágaztatott `nuvio-hungarian-addon` repót.
4. Kattints a **"Deploy"** gombra (nincs szükség külön környezeti változóra).
5. A Vercel másodperceken belül elkészíti a privát szerverless URL-edet:
   `https://<te-neved>-nuvio-hungarian-addon.vercel.app`

---

## ⚙️ Rendszerarchitektúra & Technológiák

```
                      [ Nuvio / Stremio Kliens ]
                                  │
                                  ▼
                    [ Express / Vercel API Layer ]
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
  [ Meta Provider ]     [ Smart Tiering Orchestrator ] [ Magyar Kereső Katalógus ]
  Cinemeta + Wikidata    Gyors források (~1-2s) + Deep   Cím & évszám normalizálás
                                  │
        ┌─────────────┬───────────┼───────────┬─────────────┐
        ▼             ▼           ▼           ▼             ▼
   [ NetMozi ]    [ Videa ]  [ MédiaKlikk ] [ JobbMintATV ] [ További 7 ]
  Cloudflare TLS   RC4 XML     Élő HLS VOD     1080p MP4      Scraper
  Bypass & Engine  Decoder       Proxy          Kibontó        Motorok
```

- **Cloudflare Bypass:** A NetMozi scraper egyedi `SSL_OP_NO_TICKET` TLS illesztést és BigInt dekódolót használ, így headless böngésző vagy Python nélkül fut serverless Node.js környezetben is.
- **Smart Tiering:** A gyors források (NetMozi, Videa, Indavideo, JobbMintATV, MédiaKlikk) 1.5–2.5 másodpercen belül visszatérnek a találatokkal, megelőzve az Android TV időtúllépési hibáit.
- **Nulla Cache:** Nem tárolja le a streameket merevlemezen vagy RAM-ban, kizárva a szerver memóriaszivárgását és a lejárt linkekből adódó lejátszási hibákat.

---

## 📁 Projekt Struktúra

```
nuvio-hungarian-addon/
├── api/
│   └── index.js             # Vercel Serverless belépési pont
├── public/
│   ├── index.html           # Modern konfigurációs felület és stream tesztelő
│   └── logo.png             # Addon logó és ikon
├── src/
│   ├── scrapers/
│   │   ├── netmozi.js       # NetMozi scraper (Kodi port, Cloudflare bypass, linkpayload)
│   │   ├── videa.js         # Videa.hu RC4 XML visszafejtő & MP4 streamer
│   │   ├── mediaklikk.js    # MédiaKlikk élő TV & VOD archívum
│   │   ├── indavideo.js     # Indavideo közvetlen CDN feloldó
│   │   ├── jobbmintatv.js   # JobbMintATV scraper
│   │   ├── filmvilag.js     # Filmvilág2 scraper
│   │   ├── mesefilm.js      # MeseFilm / Kincstár scraper
│   │   ├── dmdamedia.js     # DMDAMedia scraper
│   │   ├── filmezek.js      # Filmezek.com & OK.ru scraper
│   │   ├── onlinefilmek.js  # OnlineFilmekIngyen1 DooPlay scraper
│   │   └── hdmozi.js        # HDMozi scraper
│   ├── utils/
│   │   ├── linkpayload.js   # NetMozi 32-bit BigInt titkosítás visszafejtő
│   │   └── meta.js          # Cinemeta és Wikidata magyar metaadat motor
│   ├── catalog.js           # Magyar keresési és katalógus kezelő
│   └── addon.js             # Stremio & Nuvio protokoll és stream aggregátor
├── Dockerfile               # Node 20 Alpine Docker leírófájl
├── docker-compose.yml       # Docker Compose konfiguráció
├── server.js                # Helyi Express szerver
├── vercel.json              # Vercel átirányítások és beállítások
├── package.json             # Függőségek és verzióinformációk
└── README.md                # Dokumentáció és útmutató
```

---

## ⚖️ Jogi Nyilatkozat (Disclaimer)

Ez a projekt kizárólag oktatási, tesztelési és kutatási célokat szolgál. A kiegészítő nem üzemeltet szervert illegális tartalom tárolására, és nem tárol semmilyen médiafájlt vagy szerzői jogi védelmet élvező anyagot. A rendszer csupán nyilvánosan elérhető internetes indexelő oldalak hivatkozásait rendezi és jeleníti meg standard médiaböngésző protokollon keresztül.

---

## 📄 Licenc

A szoftver az [MIT Licenc](LICENSE) feltételei szerint szabadon használható és módosítható.
