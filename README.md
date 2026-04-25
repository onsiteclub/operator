# OnSite Operator

Standalone repo for the OnSite Operator app — extracted from the `onsite-eagle` monorepo on 2026-04-25 to escape cross-app hoisting issues.

## Stack

- Expo SDK 52 + React Native 0.76 + React 18.3.1
- expo-router v4
- Supabase (auth + data)
- Mini-monorepo: 1 app at root + 3 internal packages under `packages/`

## Layout

```
onsite-operator/
├── app/                     # Expo Router routes
├── src/                     # App source (api, components, lib, store)
├── assets/                  # icons, splash
├── docs/                    # internal docs
├── packages/
│   ├── auth/                # @onsite/auth — Supabase auth core
│   ├── auth-ui/             # @onsite/auth-ui — login/signup UI
│   └── tokens/              # @onsite/tokens — design tokens
├── package.json             # app deps + workspaces:["packages/*"]
├── app.json                 # Expo config
├── babel.config.js          # only babel-preset-expo
├── metro.config.js          # workspace-aware, no React/RN isolation needed
└── codemagic.yaml           # iOS build (Mac mini M2)
```

## Development

```bash
npm install
npm run android    # physical device (Samsung SM_G990W) via USB
npm run dev        # metro only
```

For physical device builds: `adb reverse tcp:8081 tcp:8081` if Metro can't connect.

## CI

Codemagic workflow `Operator · iOS Release` builds a signed IPA on Mac mini M2 — manual dispatch only. Bundle id: `ca.onsiteclub.operator2`.

## Adding a new shared package

1. `mkdir packages/<name>` with `package.json` (name `@onsite/<name>`, `main: "./src/index.ts"`)
2. Add to `metro.config.js` `watchFolders`
3. Run `npm install` to wire the workspace symlink
4. Import as `@onsite/<name>` from anywhere

## Adding a new shared package across multiple OnSite apps

Each OnSite app is a separate repo (this is intentional — see commit history of `onsite-eagle` for why). To share a package across repos:

- **Quick:** copy `packages/<name>/` into the other repo's `packages/`. Manual sync is the trade-off.
- **Proper:** publish to a private npm registry or GitHub Packages, install as a regular dep. Adds a publish workflow but solves cross-repo updates.

Currently, manual copy is the chosen trade-off.
