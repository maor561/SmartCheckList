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

### Run modes

**Wait for my confirmation** (default) — as above. Nothing is ever checked off without you.

**Run automatically** — reads the challenge, pauses so you can actually do it, reads the
response, checks it off, and moves on by itself. This is the one mode that ticks items off
unattended, which is why it is not the default. The mic stays shut throughout: the app is
talking almost continuously, so a recognizer opening between callouts would mostly hear the
app itself. **Stop** breaks out at any point, including mid-pause, and the item is left
unchecked. Tapping rows still works.

Two delays, both in Settings:

- **Pause before the response** (0–8s, default 2.5s) — automatic mode only. The window
  between the challenge and the readback. This is your time to move the switch.
- **Pause between items** (0–5s, default 0.4s) — silence after one item is done, before the
  next is called. Applies to both modes.

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

## Recording the callouts in your own voice

Each item in the editor has a record control beside the challenge and beside the response:
**●** record, **■** stop, **▶** play back, **✕** delete. Where a recording exists it is played
during the run **instead of** the synthesized voice; items without one still fall back to
TTS, so you can record only the callouts that matter.

Clips are stored as blobs in **IndexedDB** — localStorage would be exhausted by a handful
of them once base64-encoded. They are keyed by item id, which has two consequences worth
knowing:

- **They are device-local.** The JSON export carries text only, so recordings do not travel
  with a profile. Record on the tablet you actually fly with.
- **They belong to the item, not its text.** Editing an item's wording keeps its recording.
  Duplicating a profile re-issues item ids, so the copy starts with no recordings, and
  deleting an item or profile deletes its clips.

Settings shows **Recordings stored — N in use**, and flags any that are *orphaned*: stored
under an item id that no longer exists, which makes them invisible to the run. That is the
first thing to check if a recording seems to have vanished.

Some mics record noticeably quieter than others — the same recording flow on an iPhone and
on a Samsung tablet came out at very different volumes. **Recording volume boost** in
Settings (default 1×, off) applies a Web Audio gain stage on top of whatever was recorded,
so a quiet device can be turned up without re-recording anything. It's a device setting, not
a profile setting — it doesn't travel with the export and won't affect a device that already
sounds right.

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

### Recording your own voice

Every item in the editor has a **●** record button beside both the challenge and the
response. Tap to record (tap again to stop), and from then on that clip plays **instead of
the synthesized voice** for that field — challenge and response are independent. A recorded
field shows **▶** to play it back and **✕** to delete it and fall back to text-to-speech.
Recordings play at your configured speed and honour the same rule as TTS: the mic is shut
while a clip plays, so a recording of "gear up" can't check its own item off.

Recordings are stored on the device (in IndexedDB, not localStorage — audio is too big for
it), keyed to the item. That means **they do not travel in the JSON export** and are not
copied when you duplicate a profile — record on the tablet you actually fly with. Deleting
an item, phase, or profile deletes its recordings too.

## Reading the run screen

Items you haven't done yet are **bright white**; once checked they go **grey** with a green
tick. The eye lands on what's left, not on what's finished. The current item is boxed in
blue and enlarged.

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
js/audio.js              per-item voice recordings (IndexedDB blob store)
js/match.js              closed-set voice matching — the noise-rejection logic
js/speech.js             TTS/STT + recorded-clip playback; enforces "never both at once"
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
