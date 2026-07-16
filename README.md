# Smart Checklist

**Live: https://smart-checklist-ten.vercel.app**

A voice-driven interactive cockpit checklist. The app calls out an item, waits for you,
and only advances when **you** confirm — by voice or by tapping. It never advances on its own.

Built as an installable PWA: one codebase runs on the Galaxy Tab Active 2 (Android 9) and
the iPhone. No app store, no APK, no build toolchain.

## Deploying

Pushes to `main` deploy to production automatically — the repo is connected to the Vercel
project `smart-checklist`. To deploy without pushing: `vercel --prod --yes`.

## Running it

Serve the folder over **HTTPS** (or `localhost`) — the microphone will not work over plain
`http://` on a real device.

```sh
npx serve -l 5177 .      # local dev on this machine
```

To use it on the tablet, deploy the folder to any static host — GitHub Pages, Vercel,
Netlify, Cloudflare Pages. It's plain static files; there is no server and no build step.

Then on the tablet: open the URL in **Chrome** → menu → **Add to Home screen**.

> This step matters more than it looks. An installed PWA on Android runs on Chrome's engine,
> where speech recognition works. A Capacitor/WebView APK does **not** — `SpeechRecognition`
> is deliberately not exposed to WebView, so the same code in an APK would get `undefined`.
> The home-screen install is what makes this work, and it's also why an APK buys nothing here.

On iPhone: open in **Safari** → Share → **Add to Home Screen**.

## Using it

1. Pick a phase.
2. Press **Start**. The app reads the first challenge and opens the mic.
3. Answer — the item's own response (`"Set"`, `"Closed and locked"`) or a generic
   `"check"` / `"roger"` / `"done"`.
4. It reads the response back and moves on.

When a checklist finishes it calls out "Checklist complete. Next, BEFORE START", moves
there, and carries on — so a hands-free run stays hands-free. It still stops at every single
item and waits for you; it never ticks anything off by itself. If you were tapping rather
than running, it opens the next checklist and parks there ready instead. Say `hold` or turn
off **Continue to the next checklist** in Settings to stop after each one.

Voice commands available at any point: `say again`, `skip`, `back`, `hold`.

**If voice isn't getting through, tap the item.** Tapping always works and always wins —
it's the escape hatch, and it's why the app is still usable when the recognizer isn't.
Tapping an already-checked item unchecks it and parks the cursor there.

## Profiles

The app holds several checklists and you switch between them from the picker at the top of
the home screen. Each profile keeps its own checkmarks, so ticking an item in one never
touches another. It ships with two:

- **Boeing 737 — Generic** (55 items) — a condensed NG flow.
- **Boeing 737 PROC +CHECKLIST+GSX** (234 items) — the real procedure, generated from
  `data/pmdg-737-maor-v2.csv`.

In the editor you can add, rename, duplicate, or delete profiles. Duplicating re-issues
every item id, so the copy starts with a clean set of checkmarks rather than sharing the
original's.

### Regenerating the PMDG profile from CSV

The CSV is the source of truth; `js/profile-pmdg737.js` is generated and should not be
hand-edited:

```sh
node scripts/import-csv.js data/pmdg-737-maor-v2.csv pmdg737 js/profile-pmdg737.js
```

The CSV nests `section`s inside `procedure`s; both become flat phases, since a procedure's
loose flow items and its formal CHECKLIST are run at different moments. Rows reading
"... CHECKLIST COMPLETED" are end markers — items after one belong to the procedure's flow
resuming, and land in a "(continued)" phase. The `item_note` column becomes a note.

## Editing checklists

**Edit** opens the editor: rename phases, reorder them, add/remove phases, add/remove/edit
items. Changes save as you type. The editor works on the profile currently selected.

**Export** writes the active profile to a JSON file; **Import** adds a file as a *new*
profile rather than overwriting the active one, so picking the wrong file can't destroy
work. The format:

```json
{
  "name": "Boeing 737 — Generic",
  "phases": [
    {
      "id": "preflight",
      "name": "Preflight",
      "items": [
        { "id": "pf1", "challenge": "Parking brake", "response": "Set", "note": "GSX" }
      ]
    }
  ]
}
```

`challenge` is called out; `response` is what you answer. `___` marks a per-flight value —
it's stripped before speaking and ignored when matching, so `"Heading ___"` reads as
"Heading" and doesn't demand you say a number. `note` is optional, shown in amber under the
item and **never spoken** — "GSX" read aloud mid-callout is noise.

The bundled 737 checklist is a generic condensed NG flow — a starting point. Replace it
with your real one via Import, or edit it in place.

## How the voice side works

**It is not open dictation.** At any moment the app expects one of a small known set of
phrases: the current item's response, a generic acknowledgement, or a navigation command.
Everything is matched against that closed set. This is what makes it usable next to a
running sim — steady-state engine rumble doesn't transcribe to "check". Anything it can't
place confidently becomes "say again", never a guess. Ask twice and it re-reads the full
challenge and tells you to tap.

Three things the matcher does that are worth knowing (`js/match.js`):

- **Scores recall *and* precision.** Recall alone is not enough: half the real responses are
  a single word ("RUN", "CLEAR", "ENGINE"), so any sentence containing it — ATC on the
  speakers, "the engine is running loud" — would score perfectly and check the item off.
  Requiring precision too means a stray keyword inside a sentence is not an answer.
- **Expands abbreviations.** The card says "AS REQ", "CONT", "ARM"; you say "as required",
  "continuous", "armed". A word matches when the shorter is a prefix of the longer, with a
  3-character floor so "on" can't match "one".
- **Treats "X OR Y" as alternatives.** "15 OR 30 OR 40" wants any one branch, not half of
  all of them.

Saying **"check"** confirms any item, whatever its response.

Checklists are written for the eye, so `js/speech.js` rewrites the shorthand before it
reaches the synthesizer: `TA/RA` and `OFF > NAV` become pauses rather than "slash" and
"greater than", `100%` becomes "100 percent", `&` becomes "and", and `___` is dropped. This
only affects speech — matching has its own normaliser and never sees it.

**The mic is closed whenever the app is speaking.** The tablet speaker feeds straight into
the tablet mic, so a live recognizer would transcribe the app's own callout and check the
item off in its own voice. Every mic open is gated on the utterance's `onend` event — not a
timer, which drifts with the length of the callout.

Tune **Match strictness** in Settings if you get false checks (raise it) or too many
"say again"s (lower it).

## Things worth knowing

- **Voice input needs an internet connection**, on both Android and iOS — the recognizer
  streams to the platform's servers. Offline recognition on Android needs API 33 (Android 13);
  the Tab Active 2 is API 28, so it isn't available there by any route, native app included.
  Everything else — the UI, text-to-speech, tap-to-check — works fully offline.
- **On iPhone, if voice doesn't respond in the installed PWA**, open the page in Safari
  directly instead. iOS has been inconsistent about `webkitSpeechRecognition` in standalone
  mode across versions. Android is the primary target and doesn't have this problem.
- Progress is saved per item and survives a reload. **Reset all checkmarks** on the home
  screen clears it; **Restart** clears just the current phase.
- The app stops listening when it goes to the background.

## Files

```
index.html               app shell, all four views
css/style.css            dark cockpit theme, touch-sized targets
data/*.csv               source checklists (the truth for generated profiles)
js/profile-pmdg737.js    GENERATED from data/pmdg-737-maor-v2.csv — do not hand-edit
js/data.js               the generic 737 checklist + the shipped profile list
js/store.js              localStorage persistence, profiles, legacy migration
js/match.js              closed-set voice matching — the noise-rejection logic
js/speech.js             TTS/STT wrapper; enforces "never both at once"
js/app.js                run state machine, editor, settings
sw.js                    offline app shell
scripts/make-icons.js    regenerates icons/
scripts/import-csv.js    CSV -> profile
```

### Known quirks in the imported PMDG profile

Imported verbatim from the CSV, typos included, because the CSV is the source of truth.
These are spoken aloud, so they are worth fixing at the source and re-importing:
`SINGS` (→ signs, and TTS reads it as the word "sings"), `AERMD` (→ armed — the one typo
that also stops voice matching; "check" still works), `PERSSURIZATION` ×2, `AIRERON`,
`ANIT COLL LIGHT`, `TRANSER`, `HEADIND`, `WINDOWHEAT`, `FUELPUMPS`.
