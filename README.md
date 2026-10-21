# Overlord

A mobile-first PWA idle/active game: run the Overlord's evil empire one department at a time.
Play at https://short-matthew-f.github.io/passive-tower-defense/ (Add to Home Screen on iPhone for full screen).

- Design specs: [`docs/specs/README.md`](docs/specs/README.md)
- Stack: PixiJS v8, Vite, TypeScript, vite-plugin-pwa. Pixel art at a 180x320+ logical resolution, integer scaled.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173/passive-tower-defense/
npm run typecheck
npm test
npm run build
node scripts/shot.mjs out.png --enter cauldron --wait 2000   # iPhone-sized screenshot
```

Pushing to `main` builds and deploys to GitHub Pages. Installed copies show a reload prompt when a new version is live.

## Layout

- `src/core/`: save, clock and offline accrual, economy (Tribute, Infamy, Falls, Dread), layout and scaling.
- `src/ui/`: pixel font, widgets, HUD, managers, upgrade sheet.
- `src/scenes/`: Throne Room, Fall card, Gobbo's report, settings.
- `src/depts/<name>/`: one folder per department, implementing `DeptDef` from `src/core/dept.ts`.
