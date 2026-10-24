# 🇭🇺 Hungarian Streams — Nuvio & Stremio Addon

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Ez egy **Nuvio** és **Stremio** kompatibilis kiegészítő (addon), amely magyar nyelvű (szinkronos és feliratos) filmeket és sorozatokat gyűjt össze a legnépszerűbb magyar streaming oldalakról, kiemelt **1080p FHD és 720p HD** felbontásban.

---

## 🌟 Támogatott Források (Supported Sources)

1. **Videa.hu**:
   - Közvetlen, gyors **1080p FHD** és **720p HD** MP4 adatfolyamok natív hardveres lejátszással
   - Teljes RC4 titkosítás feloldás
2. **Filmezek.com**:
   - Videa és OK.ru beágyazások kibontása
   - 1080p / 720p közvetlen streamek
3. **OnlineFilmekIngyen1.com**:
   - DooPlay AJAX videolejátszó feloldás
   - Videa és VOE 1080p/720p források
4. **HDMozi.hu**:
   - HD epizódok és filmek feloldása

---

## 🚀 1 Perces Telepítés és Üzembe Helyezés (Vercel & GitHub)

### 1. Lépés: Hozd létre a GitHub tárolót
1. Hozz létre egy új üres repository-t a [GitHub fiókodban](https://github.com/new) (pl. `nuvio-hungarian-addon`).
2. A projekted mappájában futtasd a terminálban:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Hungarian Streams Nuvio addon"
   git branch -M main
   git remote add origin https://github.com/<FELHASZNALONEV>/nuvio-hungarian-addon.git
   git push -u origin main
   ```

### 2. Lépés: Telepítsd Vercel-re (Ingyenes)
1. Lépj be a [vercel.com](https://vercel.com) oldalra (a GitHub fiókoddal egyszerűen be tudsz jelentkezni).
2. Kattints az **"Add New..."** ➔ **"Project"** gombra.
3. Válaszd ki a frissen feltöltött `nuvio-hungarian-addon` tárolódat, majd kattints a **"Deploy"** gombra.
4. Pár másodperc múlva a Vercel ad egy élő URL-t, például:
   ```
   https://nuvio-hungarian-addon.vercel.app
   ```

### 3. Lépés: Másold be az Addon URL-t a Nuvio-ba
A te addonod **Manifest URL** címe a következő lesz:
```
https://<a-te-projekted>.vercel.app/manifest.json
```

1. Nyisd meg a **Nuvio** alkalmazást (Android TV-n, Google TV-n, mobilon vagy gépen).
2. Menj a **Settings** (Beállítások) ➔ **Add-ons / Plugins** menüpontba.
3. Válaszd az **Add Addon** (Hozzáadás) lehetőséget.
4. Illeszd be a `https://<a-te-projekted>.vercel.app/manifest.json` címet.
5. Nyomj a mentésre/telepítésre!
6. **Kész!** Amikor megnyitsz bármilyen filmet vagy sorozatot (pl. *A Mandalóri* vagy *Bosszúállók*), meg fognak jelenni a magyar 1080p és 720p opciók.

*(Ugyanezt a linket beillesztheted Stremio-ban is a keresőmezőbe vagy a `stremio://<url>/manifest.json` hivatkozással!)*

---

## 💻 Helyi Futtatás és Tesztelés Saját Gépen

Ha szeretnéd a gépeden tesztelni a telepítés előtt:

1. Függőségek letöltése:
   ```bash
   npm install
   ```

2. Szerver indítása:
   ```bash
   npm start
   ```

3. Nyisd meg a böngésződben:
   - Webes felület és stream tesztelő: [http://localhost:7000](http://localhost:7000)
   - Manifest URL: [http://localhost:7000/manifest.json](http://localhost:7000/manifest.json)
   - Teszt stream lekérés: [http://localhost:7000/stream/series/tt8111088:1:1.json](http://localhost:7000/stream/series/tt8111088:1:1.json)

---

## 🛠 Mappa Struktúra

```
nuvio-hungarian-addon/
├── api/
│   └── index.js             # Vercel Serverless belépési pont
├── public/
│   └── index.html           # Modern webes konfigurációs és tesztelő felület
├── src/
│   ├── scrapers/
│   │   ├── videa.js         # Videa.hu RC4 visszafejtő és 1080p/720p MP4 scraper
│   │   ├── filmezek.js      # Filmezek.com beágyazás feloldó (Videa, OK.ru)
│   │   ├── onlinefilmek.js  # OnlineFilmekIngyen1 DooPlay AJAX scraper
│   │   └── hdmozi.js        # HDMozi DooPlay scraper
│   ├── utils/
│   │   └── meta.js          # Cinemeta és Wikidata magyar cím feloldó
│   └── addon.js             # Stremio / Nuvio protokoll és minőség rendezés
├── server.js                # Express szerver
├── vercel.json              # Vercel telepítési konfiguráció
├── package.json
└── README.md
```

---

## 📄 Licenc
MIT Licenc. Csak oktatási és kísérleti célokra. A kiegészítő nem tárol semmilyen médiafájlt, kizárólag nyilvánosan elérhető források webes hivatkozásait rendezi.
