# Smart Checklist

A voice-driven interactive cockpit checklist. The app calls out an item, waits for you,
and only advances when **you** confirm — by voice or by tapping. It never advances on its own.

Built as an installable PWA: one codebase runs on the Galaxy Tab Active 2 (Android 9) and
the iPhone. No app store, no APK, no build toolchain.

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

Voice commands available at any point: `say again`, `skip`, `back`, `hold`.

**If voice isn't getting through, tap the item.** Tapping always works and always wins —
it's the escape hatch, and it's why the app is still usable when the recognizer isn't.
Tapping an already-checked item unchecks it and parks the cursor there.

## Editing checklists

**Edit** opens the editor: rename phases, reorder them, add/remove phases, add/remove/edit
items. Changes save as you type.

**Export** writes a JSON file; **Import** reads one back. The format:

```json
{
  "name": "Boeing 737 — Generic",
  "phases": [
    {
      "id": "preflight",
      "name": "Preflight",
      "items": [
        { "id": "pf1", "challenge": "Parking brake", "response": "Set" }
      ]
    }
  ]
}
```

`challenge` is called out; `response` is what you answer. `___` marks a per-flight value —
it's stripped before speaking and ignored when matching, so `"Heading ___"` reads as
"Heading" and doesn't demand you say a number.

The bundled 737 checklist is a generic condensed NG flow — a starting point. Replace it
with your real one via Import, or edit it in place.

## How the voice side works

**It is not open dictation.** At any moment the app expects one of a small known set of
phrases: the current item's response, a generic acknowledgement, or a navigation command.
Everything is matched against that closed set. This is what makes it usable next to a
running sim — steady-state engine rumble doesn't transcribe to "check". Anything it can't
place confidently becomes "say again", never a guess. Ask twice and it re-reads the full
challenge and tells you to tap.

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
index.html          app shell, all four views
css/style.css       dark cockpit theme, touch-sized targets
js/data.js          the default 737 checklist
js/store.js         localStorage persistence
js/match.js         closed-set voice matching — the noise-rejection logic
js/speech.js        TTS/STT wrapper; enforces "never both at once"
js/app.js           run state machine, editor, settings
sw.js               offline app shell
scripts/make-icons.js   regenerates icons/ (node scripts/make-icons.js)
```
