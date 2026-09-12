# GLOBO-3D — Global Chat: build plan

Working document for the agent AND for Bruno. Written in English on purpose
(Bruno asked for it) so the agent can re-read it in a later session and pick up
exactly where it stopped. **Update the checkboxes as you go.** A box is only
ticked when the acceptance test next to it passed — not when the code compiles.

---

## 0. What already exists (verified by reading the code, 2026-09-11)

| piece | where | state |
|---|---|---|
| 3D globe, borders, labels, city lights | `components/globe/canvas/*` | working |
| News / tourism / culture popups per country & state | `components/globe/ui/*` | working |
| Accounts: email + scrypt password, sessions, ban, rate-limited login | `db/schema-auth.sql`, `lib/auth/*`, `app/api/auth/*` | working |
| Realtime server (own Node process, Socket.io, Redis) | `realtime/src/*` | phases 1-3 + 6 verified |
| Presence per region, beacons with TTL | `realtime/src/presence.ts`, `beacons.ts` | working |
| Handshake + SDP/ICE relay (server never sees content) | `realtime/src/matchmaking.ts`, `signaling.ts` | working |
| P2P text + image (chunked) + video, perfect negotiation | `lib/realtime/peer.ts` | code ready, not yet proven in a browser |
| Small corner chat panel | `components/globe/ui/LiveChatPanel.tsx` | replaced in Phase D |
| Report / block / rate limit | `realtime/src/safety.ts` | working |

**Gaps this plan closes:** nickname identity, global search (the magnifier),
fly-to-person on the globe, full-screen blurred chat, typing indicator,
delivery/read receipts, voice messages.

---

## 1. The architecture question Bruno asked

> "servidor vira ponte, mensagem nem consta no servidor, fica no celular do
> usuário — não é assim que funciona o WhatsApp e o Telegram?"

Half right, and the half that is wrong decides the whole design:

- **WhatsApp** is end-to-end encrypted, but it is **not** peer-to-peer for
  messages. Every message goes *through* WhatsApp's servers, encrypted; the
  server holds it **only until it is delivered**, then deletes it. That store
  step is exactly what makes "send to someone who is offline" possible.
- **Telegram** (default cloud chats) is *not* E2E at all — the server stores
  the messages so they sync across devices. Only "Secret Chats" are E2E.
- **This project today** is stricter than both: real P2P over WebRTC
  DataChannel. The server only introduces the two browsers; the bytes never
  touch it. Nothing is stored anywhere.

The price of that purity: **if the other person is offline, the message cannot
be sent at all** — there is no one to receive it. That is not a bug, it is the
consequence of having no server-side mailbox.

**Decision:** keep P2P as the primary path (it is what gives the
"same-millisecond" feel — one network hop, no server round trip), and add an
**encrypted offline mailbox as Phase G**, opt-in, following the WhatsApp model:
the server stores a blob it cannot read, and deletes it on delivery.

### Latency reality check

| path | typical | why |
|---|---|---|
| P2P DataChannel, same city | 5-30 ms | one hop, no server |
| P2P via TURN relay | 40-120 ms | relayed, still no application server |
| Server relay (Socket.io) | 60-200 ms | browser → server → browser |

"Delivered in the same millisecond" is physically impossible across continents
(light itself needs ~60 ms São Paulo → Tokyo). What we *can* deliver, and what
Phase E implements, is the **receipt**: the recipient's browser acknowledges
the moment the bytes arrive, so the sender sees ✓✓ at real network speed.

---

## 2. Stack, and why each piece

| need | choice | why not the alternative |
|---|---|---|
| App + UI | **Next.js 15 + React 19 + TypeScript** | already the project's stack |
| 3D | **three.js + @react-three/fiber** | already in place |
| Signaling / presence | **Node + Socket.io** (separate always-on process) | a Vercel serverless function cannot hold an open socket |
| Shared state between server instances | **Redis** (`@socket.io/redis-adapter`) | without it, two instances = two half-worlds |
| Message transport | **WebRTC DataChannel** | lowest latency, and the server literally cannot read it |
| Media (photo / audio / video) | **WebRTC**: chunked binary on the DataChannel for files, media tracks for live video | base64 over JSON inflates 33% and closes the channel |
| Accounts / nickname registry | **Postgres (Neon)** | already the project's DB |
| NAT traversal | **STUN + TURN (coturn or managed)** | without TURN, ~15-30% of mobile pairs never connect |

---

## 3. Phases

Legend: `[ ]` todo · `[x]` done **and** tested · `[~]` code written, test pending

### Phase A — Nickname identity `[x]`

The searchable name. Today a user has e-mail + full name; neither is safe to
expose in a public search box.

- [x] `db/schema-nickname.sql`: `nickname` column + unique index on
      `lower(nickname)` + prefix index (`text_pattern_ops`) for `LIKE 'abc%'`
- [x] `lib/auth/nickname.ts`: normalize + validate (3-20 chars, `a-z 0-9 _`,
      must start with a letter, reserved words blocked)
- [x] `lib/db/auth.ts`: `nickname` on `AuthUser`, `createUser`, `searchByNickname`,
      `isNicknameTaken`
- [x] `app/api/auth/register/route.ts`: require + validate nickname, and tell
      the two conflicts apart (e-mail taken vs nickname taken)
- [x] `app/api/users/search/route.ts`: `GET ?q=` → max 8 `{nickname, country,
      state, city}`. Session required (a public endpoint here is a scraper's
      user list), min 2 chars, rate-limited per session.
- [x] `components/login/LoginScreen.tsx`: nickname field, live availability hint
- [x] `app/types/user.ts` + `me` route + session cache carry the nickname

**Test:** register two accounts; a duplicate nickname (any casing) is refused
with a field error; `/api/users/search?q=<prefix>` returns the right rows and
never an e-mail; logged out it answers 401.

### Phase B — Global directory in the realtime server `[x]`

Presence is per-region by design (a global broadcast would wake the whole
planet). Search has to work **across** regions, so it needs its own index.

- [x] `realtime/shared/protocol.ts`: `nickname` on `Presence` and on
      `presence:join`; new `directory:find` → `directory:result`
- [x] `realtime/src/store.ts`: `nick:<lower>` → `clientId` (TTL follows
      presence), `bindNickname` / `unbindNickname` / `clientOfNickname`,
      plus `getPresence(socketId)` so a hit can be resolved to coordinates
- [x] `realtime/src/directory.ts`: the lookup handler, rate-limited
- [x] `realtime/scripts/teste-store.ts`: directory cases added
- [x] `realtime/scripts/probe.ts`: `--find <nickname>` flag

**Test:** `npm run test:store` green; two probes in *different* regions, one
finds the other by nickname and gets lat/lon back.

### Phase C — The magnifier: search, fly to the person, connect `[x]`

- [x] `components/globe/ui/PeopleSearchButton.tsx` — the magnifier, top bar
- [x] `components/globe/ui/PeopleSearchPanel.tsx` — debounced input, results
      merging the DB registry (everyone) with the live directory (who is
      online right now), online dot, "Ver no globo" + "Conectar"
- [x] `app/hooks/useLiveRealtime.ts`: `procurarPessoa(nickname)` + result state
- [x] Fly-to: reuse the globe's existing focus mechanism, drop a pin on the
      person, then `connect:request`

**Test:** two browsers, different accounts; B searches A's nickname, the globe
turns to A's city, "Conectar" raises the invite on A's screen.

### Phase D — Full-screen chat with blur `[x]`

Replaces the corner panel. This is the screen Bruno described: the globe and
everything under it blurred, the conversation floating on top, clean.

- [x] `components/globe/ui/ChatOverlay.tsx`: `fixed inset-0`,
      `backdrop-blur-2xl`, message list, composer, remote/local video, ESC to
      close, report/block always reachable
- [x] Bubbles: text, image, audio player, timestamp, ✓/✓✓ ticks
- [x] "typing…" line under the header
- [x] `GlobeCanvas.tsx` renders the overlay instead of `LiveChatPanel`
- [x] Mobile: full width, composer above the keyboard, safe-area padding

**Test:** with a conversation open, the globe is visibly blurred and does not
capture clicks; ESC closes; at 375px wide nothing overflows.

### Phase E — Typing, receipts, audio (P2P protocol) `[~]`

All of it rides the DataChannel — the server stays blind.

- [x] `lib/realtime/peer.ts`: message envelope gains an `id`
- [x] `digitando` event, throttled (send at most 1/s, auto-expire after 3s)
- [x] `recibo` event: receiver acks `entregue` the instant the bytes land, and
      `lido` when the window is focused → ✓ / ✓✓ in the UI
- [x] generalize chunked transfer: `imagem` → `midia` (`imagem` | `audio`),
      with a send queue so two transfers cannot interleave their chunks
- [~] `enviarAudio(blob)` + `MediaRecorder` recording in the composer —
      code written, and the permission-denied path verified (the composer shows
      "Microfone não liberado." and does not get stuck recording). The
      recording itself could NOT be proven: the agent's embedded browser blocks
      microphone capture. **Bruno has to test this one on a real machine.**
      What IS proven is the transport it uses: the chunked-media path is the
      same one the photo took, end to end.

**Tested (2026-09-11, two browsers, real WebRTC):** "digitando •••" appeared
on the other side while typing and cleared on send; a text message showed ✓✓ in
cyan (read receipt, because the other tab was visible); a 50 KB PNG went across
in 4 chunks and rendered on both sides. **Not tested:** recording a voice note
(microphone blocked in the agent's browser).

### Phase F — Proof `[x]`

- [x] `npm run typecheck` in `realtime/`
- [x] `npx tsc --noEmit` in the app
- [x] `npm run test:store` (store logic, including the new directory)
- [x] `npx eslint app components lib` — 0 errors in project code
- [x] `npm run build` (production build, clean `.next`)
- [x] Two-tab browser run against local Next + local realtime server:
      register (two accounts, two regions) → search → fly to the person →
      connect → accept → text → typing → delivery + read receipt → photo →
      Esc to leave. **Audio recording is the one step not covered** — see
      Phase E.
- [x] Register rules by direct request: duplicate nickname (any casing) → 409
      on the `nickname` field; duplicate e-mail → 409 on `email` with the
      generic message; bad format and reserved names refused; the search
      endpoint answers 401 with no session

### What the two-browser test caught (and the fix)

Both were invisible to TypeScript, to the linter and to the unit tests. Only
two real browsers talking to each other showed them.

1. **`socket.removeAllListeners()` in the presence effect's cleanup** wiped the
   listeners registered by the *peer* effect (`connect:accepted`, `signal`,
   `peer:disconnected`). That effect never re-ran, so the socket went deaf to
   the handshake. Symptom: the person who invited never got the chat window,
   and the person who accepted sat on "conectando…" forever — with no error in
   the console and no error on the server. Fixed by removing only this effect's
   own listeners, one by one.

2. **Whoever pressed Esc was told "a outra pessoa encerrou a conversa"** — the
   app blaming the other person for what you just did yourself. Hang-up is a
   round trip (you tell them, they close, their hang-up comes back to you), and
   the returning event was being treated as theirs. Fixed with a guard on
   `peerRef.current`, which is already null when the hang-up started here.

A third bug was caught earlier by the store tests: the Redis test double's
`del` only deleted hashes, so every string key (client pointer, nickname,
pending request) survived a delete in tests. That made the "a connection
request can only be accepted once" test pass without proving anything. Fixed,
and that invariant now has its own test.

### Phase G — The mailbox: messages through the server `[ ]`

**Decided with Bruno on 2026-09-12**, and it changes the shape of the product:

1. **Every message goes through the server**, like WhatsApp — never peer to
   peer. One path, simple ordering, and it works even when NAT blocks a direct
   connection (today, that case silently fails). WebRTC stays, but only for
   live video/voice calls, where relaying really is worth the trouble.
2. **The server can read the stored message for now**, and the envelope is
   designed opaque from day one so end-to-end encryption drops in later
   without a rewrite. Consequence, and it is not optional: **the screen must
   stop promising that nothing is stored.** The text changes with the feature.

What the server necessarily learns by being able to deliver later: who talks to
whom, and when. That metadata cannot be avoided in any store-and-forward
design, E2E included.

#### G0 — The socket has to know who you are (PREREQUISITE) `[x]`

Today `presence:join` takes `clientId` and `nickname` from whatever the client
sends, and the server believes it. Anyone can appear in the magnifier as
someone else. That is already a hole — with a mailbox it becomes "anyone can
read someone else's messages", so it gets fixed first.

- [x] `realtime/shared/token.ts`: mint/verify a short-lived signed token
      (HMAC, `REALTIME_TOKEN_SECRET`, ~5 min, carrying user id + nickname)
- [x] `app/api/realtime/token/route.ts`: session in, token out
- [x] `lib/realtime/socket.ts`: fetch the token, send it in the handshake,
      renew on reconnect
- [x] `realtime/src/auth.ts`: `io.use(...)` verifies it → `socket.data.userId`
- [x] `presence.ts`: identity comes from the TOKEN, never from the payload.
      No token = anonymous: still visible on the globe, but cannot claim a
      nickname and cannot use the mailbox.

**Tested (2026-09-12, two browsers + a hostile probe):** the search still finds
`@yuki_tokyo` online and the globe still flies to Tokyo — and since the client
no longer sends the nickname at all, the only possible source is the verified
token. Then `npm run probe -- --nick yuki_tokyo` from São Paulo, deliberately
sending the field the protocol no longer declares: it did **not** take over the
name, and the search kept resolving to the real person in Tokyo.

Two things found while doing it:

- **`realtime/.env` was never being read.** The README told you to copy
  `.env.example`, and `npm run dev` loaded nothing — `CORS_ORIGIN`, `STUN_URL`
  and `REDIS_URL` written there were silently ignored. The server now loads it
  itself (`process.loadEnvFile`), and the proof is in the boot line: CORS went
  from "liberado" to the actual list.
- The token is short-lived (5 min) but a connection lives for hours, so the
  client fetches a fresh one on every reconnect attempt. Without that, a tab
  left open overnight would come back **anonymous** — gone from the search,
  with nothing on screen saying so.

#### G1 — The mailbox itself `[x]`

- [x] `db/schema-mailbox.sql`: table `envelopes` — `msg_id` (from the sender,
      for dedupe), from/to user, `to_device` (null today, exists for E2E),
      `kind`, `payload` (opaque bytes), `enc` (`srv-v1` now, `e2e-v1` later),
      timestamps, `expires_at`; plus `user_blocks` (account-level, because the
      old Redis block is per browser and does not survive a new device)
- [x] Payload encrypted at rest with a server key (`MESSAGE_KEY`, AES-256-GCM):
      a database dump should not be a transcript. Without the key the mailbox
      stays off and says so on boot — same pattern as the rest of the project.
- [x] `realtime/src/mailbox.ts`: `msg:send` → persist → deliver if online;
      `msg:sync` for what piled up; `msg:ack` deletes the envelope and tells
      the sender; block checked at enqueue; rate limit per sender
- [x] TTL of 30 days + `purge_expired_envelopes()` for what nobody ever came
      to fetch

**Tested (2026-09-12, end to end):** with the recipient's tab **closed**, the
message was stored — `anateste_mg -> yuki_tokyo | texto | srv-v1 | 65 bytes
cifrados` (37 bytes of payload plus IV and tag, so the encryption at rest is
really happening). Reopening her browser: `sync: 1 guardada(s)` → `ack: 1
entregue(s)` → **0 envelopes left in the table**. The server keeps it only
until it is delivered, exactly as promised.

#### G2 — The client `[x]`

- [x] `app/hooks/useConversas.ts`: conversations over the socket, addressed by
      nickname. Separate from `useLiveRealtime` on purpose — presence and calls
      die when the connection dies; a conversation must not.
- [x] History lives in `localStorage` on the device. **This is required, not
      polish:** the server deletes on delivery, so without it, reading a
      message and refreshing the page would lose it forever.
- [x] A conversation opens with the other person offline
- [x] ✓ = the server took it, ✓✓ = the other device has it, ✓✓ cyan = read
- [x] `ConversasPanel` + an unread badge on the globe. Without it the feature
      was invisible: the message arrived, was stored, and waited for the person
      to happen to search the sender in the magnifier.
- [x] The "nothing is stored" notice replaced by what is actually true

**Tested:** two accounts in two browsers — sent while online (delivered and
read, cyan ✓✓ verified by computed colour, not by eyeballing a screenshot);
sent while offline (badge showed **2** the moment she came back); history
survived a full page reload; date separator correct.

**Known gap, deliberate:** `localStorage` keeps **text only**. Photo and audio
stay in the tab's memory and vanish on reload — a couple of dozen base64 photos
would blow the ~5 MB quota and take the text history down with them. IndexedDB
is the fix, and it belongs to G3 along with the rest of the media work.

#### G3 — Media offline `[ ]`

Photo and audio still travel only over the live P2P channel: they do **not**
go through the mailbox yet, so they cannot reach someone who is offline.

- [ ] Photo resized client-side (~1280px) and audio capped, so an offline photo
      is a few hundred KB and not eight megabytes
- [ ] Sent through `msg:send` like text (the envelope already carries `kind`)
- [ ] History moved from `localStorage` to **IndexedDB**, which stores Blobs
      natively and is not stuck at 5 MB
- [ ] If volume grows, move the bytes to object storage (R2/S3) — the envelope
      points at an opaque payload, so only the storage layer changes

#### G4 — Waking the phone

- [ ] Web Push (VAPID) + service worker, so a message arrives with the tab
      closed

#### G5 — The upgrade to E2E (later, its own review)

- [ ] Keypair per device in IndexedDB (non-extractable), public key published
      with the account
- [ ] Sender encrypts to each of the recipient's devices; `enc` becomes `e2e-v1`
- [ ] **Key-change warning and a fingerprint to compare.** Without this, E2E
      where the server hands out the public keys is theatre: the server swaps a
      key and nobody notices.

### Phase H — Infrastructure `[~]`

#### The shopping list

Everything this project needs to be online, and what each piece is for. Prices
are orders of magnitude as of this writing — check before signing anything.

| piece | what it does | where | ~cost/month |
|---|---|---|---|
| Next app | the globe, the login, the API routes | **Vercel** (already linked) or **Fly** (Dockerfile + fly.toml already here) | $0 Hobby |
| Postgres | accounts, nicknames, behaviour | **Neon** (already) | $0 free tier |
| Realtime server | presence, the magnifier's directory, the WebRTC handshake | **Railway** (or Fly/Render) — must be always-on | ~$5 |
| Redis | shares presence between server instances + Socket.io adapter | **Railway Redis**, same project (private network) | ~$5-10 |
| STUN | tells each side its public address | Google's public server | $0 |
| **TURN** | **relays the media when NAT won't allow a direct link** | coturn on a small VPS, or managed (Metered/Twilio/Cloudflare) | VPS ~$5, or per GB |
| Domain | | any registrar | ~$1 |

**Nothing above stores a message**, and that is the point: no S3, no R2, no CDN
for media, no message table, no backup of conversations, no moderation
pipeline for content the server cannot read. A chat product normally spends
most of its infrastructure budget on exactly those. This one does not have
them, because the bytes never reach a server.

#### The one that scales with usage: TURN

STUN is free and does not carry media. TURN does, and it is the only line here
that grows with how much people talk:

- Text and photos are negligible (a photo is a few hundred KB, once).
- Video is what costs. One relayed video call at ~1 Mbps burns roughly
  **450 MB per hour**. At managed-TURN prices (~$0.40/GB) that is ~$0.18/hour
  of relayed video; on a $5 VPS with a few TB of traffic included, it is
  effectively flat until you are big.
- Only **part** of the calls need the relay at all — the ones where neither
  side can be reached directly, typically two phones on mobile networks
  (CGNAT). Plan for something like a fifth to a third of pairs.

Start with coturn on the cheapest VPS. Move to managed only if running it
becomes annoying — not before.

#### What would change with Phase G (the offline mailbox)

- Storage for the ciphertext (small, and it deletes itself on delivery)
- **Web Push** (VAPID keys, free) so the phone wakes up
- FCM/APNs only if a native app ever exists

#### What this project does NOT need

Kubernetes, microservices, a message broker, a media server (SFU), a CDN for
user content, an image pipeline. If any of those shows up in a plan, something
went wrong in the reasoning — write down which problem it solves first.

#### Order of operations to go live

**Checked on 2026-09-12, and two doors are locked from the inside** — both need
Bruno, because both are interactive logins the agent cannot perform:

1. **GitHub credentials are expired.** `gh auth status` reports *"The token in
   default is invalid"* for both stored accounts. Reading works (the repo is
   public: `git ls-remote` answers), pushing does not. Fix:

   ```
   gh auth login
   ```

2. **The Vercel GitHub App is not installed on the repository.** Linking the
   project fails with *"To link a GitHub repository, you need to install the
   GitHub integration first"*. Install it at https://github.com/apps/vercel and
   grant access to `johnQuest01/GLOBO-3D`.

   (The Vercel CLI is also not logged in — `npx vercel whoami` answers "Not
   authorized" — so the direct-upload route is closed too.)

After those two, the rest is mechanical: push the branch, link the project,
set the environment variables, deploy.

#### The environment variables, by service

**Vercel (the Next app)** — without the first two, login and registration
answer 503 and the globe still works:

| variable | what breaks without it |
|---|---|
| `DATABASE_URL` | accounts, nickname, search |
| `AUTH_SECRET` | sessions (needs 32+ characters) |
| `REALTIME_TOKEN_SECRET` | the socket badge: everyone connects anonymous, so no search and no mailbox |
| `NEXT_PUBLIC_REALTIME_URL` | all realtime disappears from the interface — deliberately, the globe is unaffected |
| `COOKIE_CACHE_TTL_SEC` | optional (defaults to 60) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the moderation screen |

**Railway (the realtime server)**:

| variable | what breaks without it |
|---|---|
| `REDIS_URL` | **refuses to boot in production** — on purpose, see realtime/README.md |
| `CORS_ORIGIN` | any site could open a socket in your users' name |
| `REALTIME_TOKEN_SECRET` | **must be the same value as Vercel's** — it is the shared secret |
| `DATABASE_URL` | the mailbox stays off |
| `MESSAGE_KEY` | the mailbox stays off (32 bytes in base64: `openssl rand -base64 32`) |
| `STUN_URL`, `TURN_URL`, `TURN_USER`, `TURN_CRED` | video calls between phones |

#### One branch, and which one is production

The repository currently has three branches: `main`,
`globo/lod-luzes-fronteiras` (where all of this work lives, 6 commits ahead of
its remote) and `claude/globo-3d-freeze-features-1s9khz`. Bruno asked to keep
only the working one and create no new ones.

So: **`globo/lod-luzes-fronteiras` must be set as the Production Branch in the
Vercel project** (Settings → Git → Production Branch). Left at the default,
Vercel would treat `main` as production and publish the old code from there
while every push to the real branch became a mere preview.

#### Checklist

- [x] Realtime server documented for Railway (`realtime/README.md`)
- [x] Local loop working end to end: the `realtime` process (in-memory store)
      plus `NEXT_PUBLIC_REALTIME_URL=http://localhost:8080` in `.env.local`
- [x] `db/schema-nickname.sql` applied to the Neon database
- [ ] GitHub credentials renewed and the branch pushed
- [ ] Vercel project re-imported, env vars set
- [ ] Redis service created on Railway
- [ ] Realtime service deployed, `CORS_ORIGIN` locked to the real domain
- [ ] `NEXT_PUBLIC_REALTIME_URL` set on Vercel (and on Fly, if it stays)
- [ ] TURN server — **required**, not optional: without it mobile-to-mobile
      pairs silently fail
- [ ] Load check: 100 simultaneous presences on one instance

#### A note on Fly, which is also configured here

`fly.toml` has `auto_stop_machines = 'stop'` and `min_machines_running = 0`.
For the Next app that is ideal — it sleeps when nobody is around. For the
socket server it would be fatal: sleeping drops every open WebSocket and wipes
presence. If the realtime server ever moves to Fly, it needs its own app with
`min_machines_running = 1`, which is the same always-on bill as Railway, with
the Redis one internet away instead of on the private network.

---

## 4. How to run the whole thing locally

Three terminals:

```bash
# 1. realtime server (no REDIS_URL = in-memory, fine for local)
cd realtime && npm install && npm run dev

# 2. the app — needs NEXT_PUBLIC_REALTIME_URL=http://localhost:8080 in .env.local
npm run dev

# 3. checks
cd realtime && npm run test:store
```

Then open two different browser profiles (or one normal + one anonymous
window) on `http://localhost:3000`, register two accounts with different
nicknames, and search one from the other.

---

## 5. Rules this project does not break

1. **The server never sees message content.** Anything that would require
   reading it (server-side search, moderation of text, history) is refused or
   redesigned.
2. **`realtime/shared/protocol.ts` is the single source of truth** for events.
   Both sides import it, so a renamed event breaks the build instead of
   breaking production.
3. **The realtime feature is optional.** Without `NEXT_PUBLIC_REALTIME_URL`
   the globe works exactly as before. No new hard dependency for the app to
   boot.
4. **Nothing here touches `profiles`, `behavior_events` or `affinity`.** Every
   migration is additive.
5. **Report and block are one click away, always** — including inside the new
   full-screen overlay.
