# PTA — iOS Standalone

## Quick Start

```bash
npm install
npm run build
npm run sync
npm run open
```

This opens the project in **Xcode**.

## Build for App Store

1. Open in Xcode (`npm run open`)
2. Select your signing team (Apple Developer account required)
3. Set Bundle Identifier to `com.precioustotsacademy.pta`
4. Product → Archive
5. Distribute App → App Store Connect

## Scripts

- `npm run build` — Copy web assets to `www/`
- `npm run sync` — Sync web assets into iOS native project
- `npm run open` — Open in Xcode
- `npm run run` — Build and run on connected device/simulator
- `npm run icons` — Regenerate app icons

## Structure

```
iOS/
├── ios/              # Native iOS project (open in Xcode)
├── www/              # Built web assets (copied by `npm run build`)
├── app.js            # Main app logic
├── index.html        # App HTML
├── styles.css        # App styles
├── supabase-config.js  # Supabase client config
├── sw.js             # Service worker
├── manifest.json     # PWA manifest
├── capacitor.config.json  # Capacitor config
├── generate-icons.py # Icon generator script
├── supabase/         # Edge Function source
└── package.json      # iOS-only dependencies
```

## Requirements

- macOS (latest)
- Xcode 16+
- Apple Developer account (for App Store submission)
- CocoaPods (if needed by plugins)
