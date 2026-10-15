# Critical Listening Lab: developer notes

These notes let a fresh Claude session (or anyone else) continue work on this app.

## What it is
- A graffiti-styled ear-training web app for a high school recording class.
- Student app: https://drkeyzzz.github.io/critical-listening-lab/
- Teacher dashboard: https://drkeyzzz.github.io/critical-listening-lab/teacher/
- Hosting: GitHub Pages from the `main` branch of `DrKeyzzz/drkeyzzz.github.io`, served from the repo root.
- Related pages:
  - The hub page `/index.html` (Music Theory Games) has a graffiti banner at the bottom linking to the lab.
  - The lab links back to the hub with a "Music Theory Games" button at the top.

## Files
| Path | What it is |
|---|---|
| `critical-listening-lab/index.html` | The whole student app in one file (inline CSS and JS in an IIFE, no build step needed). |
| `critical-listening-lab/teacher/index.html` | The teacher dashboard, also a single file. Add `?preview` to the URL to see the UI without signing in. |
| `critical-listening-lab/firestore.rules` | The full Firestore rules. They are **not** deployed from here: the teacher pastes them into the Firebase Console (Firestore > Rules) after every change. |
| `critical-listening-lab/audio/` | Bundled music clips used as game sources. |

Edit the HTML files directly. Earlier sessions edited a scratch copy and wrapped it into `index.html`, but the wrapper only adds `<!doctype>`, `<head>` and the meta tags, so editing `index.html` itself is equivalent.

## Firebase
- Project: `rhythm-trainer-fc313`. It is shared with the music theory games repos, so rule changes must keep their blocks intact.
- The web API key is in the page source, as normal for Firebase web apps.
- Firebase is loaded lazily from gstatic, version 10 modular SDK.
- Teacher/admin emails in the rules: `milnesda@eht.k12.nj.us`, `dcmilnes@gmail.com`.
- Collections this app uses:
  - `listening_progress`: daily minutes, rounds and per-game rounds (`rounds_by`).
  - `classes`: class docs; the `listen_assignment` field holds the teacher's assignment.
  - `tests`: tests with `game:'listen'`.
  - `test_results`.
  - `game_feedback`: feedback with `game:'critical-listening-lab'`.
  - `listening_scores`: the leaderboard.
- The REST API can be used to check whether the live rules accept a write:
  `https://firestore.googleapis.com/v1/projects/rhythm-trainer-fc313/databases/(default)/documents/...?key=<api key>`

## Student app features
- **Sign in:** first name, last initial and class code. There is also "I'm not in a class" (solo) and guest mode.
- **Daily minutes goal:** progress syncs to Firestore for the teacher.
- **Games:** EQ/frequency, gain, compression, space/reverb, panning and more. The Analyze views show EQ, gain, compression and space.
- **From your teacher:** cards showing the assignment and tests, a test lobby and test mode (`body.testing` hides extra UI), with results saved.
- **Leaderboard:** a button in the top bar. It can be sorted by game, scoped to class or world, and is fed by `postScore`.
- **Feedback:** a "Send feedback" modal at the bottom of the home view.
- **Beat Maker (free play):**
  - Drum rows: synthesized kit, 3 velocity levels per hit, a ▶ preview button, an L–R pan slider with a readout, mute and remove.
  - Beat length and timing: 1, 2, 4 or 8 bars, "Copy bar 1 to all", swing and tempo.
  - Undo with Ctrl+Z. Snapshots are taken before every change, including deleting a saved beat.
  - Saved beats live in "My beats", stored in the local profile.
  - The 🎸 Bass row on the main timeline opens an expanding piano roll:
    - key, major/minor, Auto fill and 🎲 Random;
    - optional "Follow chords" progression with 🎲 New chords;
    - 9 bass sounds;
    - a velocity lane where click height sets soft, medium or hard;
    - clicking a note name plays that pitch;
    - expanding panels: Chords, Sound and Tips.
  - Data: `P.freeBeat = {bpm, swing, bars, rows:[{sound, steps, mute, pan}], bass:{key, scale, mode, prog, sound, mute, pan, notes:[{s, d, n, v}]}}`.

## Teacher dashboard
- Tabs: Students, Assign, Tests, Leaderboard (with delete), Feedback (admins only), Classes and Admin.
- Classes can use a custom code (4–7 characters, A–Z and 0–9). Deleting a class requires typing its code.
- A "← Back to the Lab" link sits in the header.

## Testing locally
- Serve the repo root with `python3 -m http.server 8766`, then open `http://localhost:8766/critical-listening-lab/`.
- To test with Playwright, stub `https://www.gstatic.com/firebasejs/**` with fake Firebase modules. The modules must export:
  - `initializeApp`, `getFirestore`, `doc`, `collection`;
  - `where`, `orderBy`, `limit`, `query`;
  - `getDoc`, `getDocs`, `setDoc`, `addDoc`, `serverTimestamp`.
- Click `#guest`, then `#freeCard`, to reach Beat Maker.

## Open items
- Confirm the teacher has pasted the current `firestore.rules` into Firebase. The leaderboard (`listening_scores`) and `rounds_by` depend on it.
- (Fixed) The Hard / Vel / Soft labels beside the bass velocity lane now sit one per click band.
