# ADR-0007 — Web as a dev/UX-testing target + persistence port

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 0

## Context
We want a fast build/UX-testing loop that can be driven in a browser (screenshots,
click-throughs, automated UX checks), not only a native simulator. Expo runs on web
via react-native-web, but `expo-sqlite` (ADR-0001) is native-only and breaks web.

## Options considered
- **Persistence port with platform implementations** — services depend on a small
  storage interface; a `.native` impl uses expo-sqlite/Drizzle, the default `.ts`
  impl uses `localStorage`/in-memory for web + Node tests. Metro's platform
  resolution swaps them automatically.
- **expo-sqlite web (wasm)** — real SQLite on web via wa-sqlite. Powerful but needs
  COOP/COEP headers + wasm bundling; fragile for a quick dev loop.
- **Native-only testing** — no web; slower UX loop. Rejected — we want the fast loop.

## Decision
**Persistence port.** Services/UI talk to `@/data/persistence` (a stable API).
Metro resolves `persistence.native.ts` (expo-sqlite + Drizzle) on device and
`persistence.ts` (localStorage/in-memory) on web and in Node. Web is a supported
**development / UX-testing** target; native remains the product source of truth.

## Consequences
- Fast browser-driven UX testing and screenshots; runs in Node for unit tests too.
- ADR-0001 (SQLite as device source of truth) is preserved behind the port.
- Web/localStorage is **not** a production data store — parity with the native
  schema is our responsibility; keep the port surface small.
- Reversible: could later add a real wasm-SQLite web impl behind the same port.
