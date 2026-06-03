# webamp-obs

Webamp als transparente OBS Browser Source — selbstgehostet, kein Setup außer Bun.

## Voraussetzungen

- [Bun](https://bun.sh) installiert (`curl -fsSL https://bun.sh/install | bash`)

## Setup

```bash
bun install
bun run dev
```

→ Server läuft auf http://localhost:9002

## Musik & Skins hinzufügen

| Was    | Wohin      | Format                                      |
|--------|------------|---------------------------------------------|
| Musik  | `./music/` | `.mp3` `.ogg` `.flac` `.wav` `.aac` `.m4a` |
| Skins  | `./skins/` | `.wsz` `.wal`                               |

Einfach Dateien reinwerfen, Server neu starten → fertig.  
Skins erscheinen im Webamp-Menü unter **Options → Skins**.

## OBS einrichten

1. **Browser Source** hinzufügen
2. URL: `http://localhost:9002`
3. **Breite/Höhe = deine Stream-Auflösung** (z.B. 1920 × 1080)
4. Custom CSS:
   ```css
   body { background-color: rgba(0,0,0,0) !important; }
   ```
5. ✅ „Control audio via OBS" aktivieren
6. Im Audio Mixer → ⋮ → **Monitor Only (mute output)** (verhindert Echo)

## Fenster positionieren

Standard-Layout in [`src/client.ts`](src/client.ts) im Objekt `DEFAULT_LAYOUT` anpassen:

```ts
const DEFAULT_LAYOUT = {
  main:      { position: { x: 20, y: 20 } },
  equalizer: { position: { x: 20, y: 136 } },
  playlist:  { position: { x: 20, y: 136 } },
  milkdrop:  { position: { x: 295, y: 20 } },
};
```

Beispiele für 1920×1080:

| Wo               | x    | y    |
|------------------|------|------|
| Oben links       | 20   | 20   |
| Oben rechts      | 1625 | 20   |
| Unten links      | 20   | 944  |
| Unten rechts     | 1625 | 944  |

Nach dem Anpassen: Server neu starten (baut `client.js` neu) und Browser Source in OBS refreshen.

Fensterpositionen werden automatisch in `localStorage` gespeichert und beim nächsten Laden wiederhergestellt.

## Projektstruktur

```
webamp-obs/
├── music/           ← MP3s etc. hier rein
├── skins/           ← .wsz Skins hier rein
├── src/
│   ├── client.ts    ← Webamp UI + DEFAULT_LAYOUT
│   ├── server.ts    ← Bun HTTP Server
│   └── public/
│       └── index.html
├── package.json
└── README.md
```

## Skins finden

https://skins.webamp.org → Download → in `./skins/` legen
