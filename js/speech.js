/**
 * Speech layer: text-to-speech out, speech-to-text in.
 *
 * The single rule this module exists to enforce: TTS and STT never run at the
 * same time. The tablet speaker feeds straight into the tablet mic, so if the
 * recognizer is live while we speak, it transcribes our own callout and the
 * checklist advances on its own voice. Every start of recognition is gated on
 * the utterance's `onend` firing — not a timer, which drifts with utterance
 * length.
 */

const Speech = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const state = {
    recognition: null,
    recognizing: false,
    wantListening: false,
    speaking: false,
    clip: null, // the currently-playing recorded clip, if any
    onResult: null,
    onStateChange: null,
    lang: 'en-US',
  };

  // The <audio> element unlock() blesses on a real tap, then every playClip()
  // reuses for the rest of the run — see unlock()'s comment for why.
  let unlockedAudio = null;

  // Some mics (observed on a Samsung tablet) record noticeably quieter than
  // others (an iPhone recording the exact same way sounded fine). A clip's
  // volume is baked into the file at record time — .volume on the element
  // can only go up to "as loud as it was recorded", not past it — so boosting
  // played-back level needs a real gain stage. Built once in unlock(), reused
  // for every clip since createMediaElementSource can only wrap an element once.
  let gainCtx = null;
  let gainNode = null;
  let gainWired = null;

  // WebKit has a long-standing bug where speechSynthesis silently stalls a
  // queued utterance after ~15s idle. Nudging it is a harmless no-op when
  // nothing is speaking, so just run it unconditionally.
  setInterval(() => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 5000);

  function silentWavUrl() {
    const rate = 8000;
    const n = Math.floor(rate * 0.05); // 50ms — enough to count as playback, inaudible
    const buf = new ArrayBuffer(44 + n * 2);
    const dv = new DataView(buf);
    const wr = (o, s) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    wr(0, 'RIFF');
    dv.setUint32(4, 36 + n * 2, true);
    wr(8, 'WAVE');
    wr(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    wr(36, 'data');
    dv.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  /**
   * iOS Safari only allows audio/speech to start inside the call stack of a
   * real user gesture. A checklist run fires every callout after the first
   * from inside async chains — sleeps, IndexedDB reads — several ticks
   * removed from any tap, so iOS silently drops them while Chrome (Android)
   * does not enforce this as strictly. Call this synchronously from the tap
   * handler that starts a run, before any `await`: it plays a silent clip on
   * a real element and speaks a silent utterance, both inside the gesture.
   * playClip() then reuses that same element all the way through the run —
   * iOS ties the unlock to the element instance, not the page.
   */
  function unlock() {
    if (!unlockedAudio) unlockedAudio = new Audio();
    try {
      unlockedAudio.src = silentWavUrl();
      const p = unlockedAudio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {
      /* best effort */
    }
    if (window.speechSynthesis) {
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch (_) {
        /* best effort */
      }
    }
    // Wire the gain stage once, on the same element: an AudioContext also
    // needs a gesture to start on iOS, and createMediaElementSource can only
    // wrap a given <audio> element a single time.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && gainWired !== unlockedAudio) {
        gainCtx = gainCtx || new Ctx();
        const source = gainCtx.createMediaElementSource(unlockedAudio);
        gainNode = gainCtx.createGain();
        source.connect(gainNode);
        gainNode.connect(gainCtx.destination);
        gainWired = unlockedAudio;
      }
      if (gainCtx && gainCtx.state === 'suspended') gainCtx.resume();
    } catch (_) {
      /* Web Audio unavailable — clips still play at their recorded volume */
    }
  }

  /** Playback volume multiplier for recorded clips — 1 leaves them untouched. */
  function setClipGain(v) {
    if (gainNode) gainNode.gain.value = v;
  }

  /**
   * Turn checklist shorthand into something a synthesizer says sensibly.
   * Real cards are written for the eye — "TA/RA", "OFF > NAV", "TESTED 100%",
   * "CLIMB-OUT — Passing TA" — and engines read those as "slash", "greater
   * than", "percent sign" or a stumble. Speech only; matching never sees this.
   */
  function speakable(text) {
    return String(text)
      .replace(/_+/g, ' ') // ___ marks a per-flight value; don't read it
      .replace(/%/g, ' percent ')
      .replace(/&/g, ' and ')
      .replace(/[—–]/g, ', ') // em/en dash: a pause, not the word "dash"
      .replace(/\s*>\s*/g, ', ') // "OFF > NAV" is a sequence
      .replace(/\s*\/\s*/g, ', ') // "TA/RA", "AUTO / HIGH"
      .replace(/\s*,\s*(?=,)/g, '') // collapse the commas that produces
      .replace(/\s+,/g, ',') // no floating space before a comma
      .replace(/\s+/g, ' ')
      .replace(/^[\s,]+|[\s,]+$/g, '')
      .trim();
  }

  // ---------------------------------------------------------------- TTS

  let voices = [];

  function loadVoices() {
    voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return voices;
  }

  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function listVoices() {
    if (!voices.length) loadVoices();
    return voices.filter((v) => /^en/i.test(v.lang));
  }

  function findVoice(uri) {
    if (!uri) return null;
    if (!voices.length) loadVoices();
    return voices.find((v) => v.voiceURI === uri) || null;
  }

  /**
   * Speak text. Resolves when the utterance has actually finished playing.
   * Resolves (never rejects) on error so a dead voice can't stall the run.
   */
  function speak(text, opts = {}) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();

      const clean = speakable(text);
      if (!clean) return resolve();

      // Anything currently queued is stale by definition.
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(clean);
      u.lang = opts.lang || state.lang;
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      const v = findVoice(opts.voiceURI);
      if (v) u.voice = v;

      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        state.speaking = false;
        emit();
        resolve();
      };

      u.onend = done;
      u.onerror = done;

      // Some Android builds silently drop utterances; don't hang the run on it.
      const guard = setTimeout(done, Math.max(4000, clean.length * 120));
      const clearGuard = () => clearTimeout(guard);
      u.addEventListener('end', clearGuard);
      u.addEventListener('error', clearGuard);

      state.speaking = true;
      emit();
      window.speechSynthesis.speak(u);
    });
  }

  function cancelSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (state.clip) {
      try {
        state.clip.pause();
      } catch (_) {
        /* nothing playing */
      }
      state.clip = null;
    }
    state.speaking = false;
    emit();
  }

  /**
   * Play a recorded clip in place of TTS. Flips the same `speaking` gate `speak`
   * uses, so the mic stays shut while a recording plays — the tablet speaker
   * feeds its own mic, and a recording of "gear up" is just as capable of
   * checking the item off in its own voice as a synthesized callout. Resolves
   * (never rejects) when playback ends, errors, or a guard fires.
   */
  function playClip(blob, opts = {}) {
    return new Promise((resolve) => {
      if (!blob) return resolve();

      // Anything queued in the synth is stale the moment a clip takes over.
      // Safari iOS has issues with cancel(), so try-catch it.
      try {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      } catch (e) {
        // Ignore Safari quirks
      }

      const url = URL.createObjectURL(blob);
      // Reuse the element unlock() blessed on the Start tap. iOS Safari ties
      // its gesture-linked play() permission to the element instance, not the
      // page — a fresh `new Audio()` built later, deep in an async chain with
      // no tap behind it, gets silently blocked. This is why only the very
      // first item was ever audible: it was the only clip close enough to a
      // real tap.
      const audio = unlockedAudio || new Audio();
      unlockedAudio = audio;
      audio.src = url;
      audio.playbackRate = opts.rate || 1;
      state.clip = audio;

      let settled = false;
      const done = (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        URL.revokeObjectURL(url);
        if (state.clip === audio) state.clip = null;
        state.speaking = false;
        emit();
        // Report audio errors to the UI so the user knows what's happening.
        if (reason === 'error' && state.onPlayClipError) {
          state.onPlayClipError(audio.error);
        }
        resolve();
      };

      audio.onended = () => done('ended');
      audio.onerror = () => done('error');
      // A clip that never fires 'ended' (decode failure on an odd codec) must
      // not hang the run. 90s covers any realistic callout.
      const guard = setTimeout(() => done('timeout'), 90000);

      state.speaking = true;
      emit();
      const p = audio.play();
      if (p && p.catch) {
        // Safari iOS can return a Promise that never settles. Race it with a
        // timeout so state.speaking doesn't hang forever.
        Promise.race([
          p,
          new Promise((_, rej) => setTimeout(() => rej(new Error('play-timeout')), 5000))
        ]).catch(() => done('play-error'));
      }
    });
  }

  // ---------------------------------------------------------------- STT

  function supported() {
    return Boolean(SR);
  }

  function build() {
    if (!SR) return null;
    const r = new SR();
    // One-shot + manual restart. `continuous` is unreliable on Android Chrome
    // and unsupported in Safari; the restart loop below behaves the same
    // everywhere and gives us a clean seam to gate on.
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.lang = state.lang;

    r.onstart = () => {
      state.recognizing = true;
      emit();
    };

    r.onresult = (e) => {
      const alts = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        for (let j = 0; j < res.length; j++) {
          alts.push({
            transcript: res[j].transcript.trim(),
            confidence: res[j].confidence,
          });
        }
      }
      if (alts.length && state.onResult) state.onResult(alts);
    };

    r.onerror = (e) => {
      // `no-speech` and `aborted` are the normal heartbeat of a restart loop,
      // not failures. `not-allowed` means the mic permission is gone — that one
      // is terminal and must stop the loop, or we spin forever.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        state.wantListening = false;
        if (state.onStateChange) state.onStateChange({ ...snapshot(), error: 'mic-denied' });
      }
    };

    r.onend = () => {
      state.recognizing = false;
      emit();
      // Restart only if we still want to listen AND we are not talking.
      if (state.wantListening && !state.speaking) {
        setTimeout(() => {
          if (state.wantListening && !state.recognizing && !state.speaking) {
            try {
              r.start();
            } catch (_) {
              /* start() throws if a previous session hasn't torn down yet */
            }
          }
        }, 180); // debounce: too fast and Android throws ERROR_RECOGNIZER_BUSY
      }
    };

    return r;
  }

  function startListening() {
    if (!SR) return false;
    if (state.speaking) return false;
    state.wantListening = true;
    if (!state.recognition) state.recognition = build();
    if (state.recognizing) return true;
    try {
      state.recognition.lang = state.lang;
      state.recognition.start();
      return true;
    } catch (_) {
      return false;
    }
  }

  function stopListening() {
    state.wantListening = false;
    if (state.recognition && state.recognizing) {
      try {
        state.recognition.abort();
      } catch (_) {
        /* already down */
      }
    }
    state.recognizing = false;
    emit();
  }

  // ---------------------------------------------------------------- misc

  function snapshot() {
    return {
      speaking: state.speaking,
      listening: state.recognizing,
      wantListening: state.wantListening,
    };
  }

  function emit() {
    if (state.onStateChange) state.onStateChange(snapshot());
  }

  return {
    supported,
    speak,
    playClip,
    unlock,
    setClipGain,
    cancelSpeech,
    startListening,
    stopListening,
    listVoices,
    loadVoices,
    speakable,
    setLang: (l) => {
      state.lang = l;
    },
    set onResult(fn) {
      state.onResult = fn;
    },
    get onResult() {
      return state.onResult;
    },
    set onStateChange(fn) {
      state.onStateChange = fn;
    },
    set onPlayClipError(fn) {
      state.onPlayClipError = fn;
    },
    get isSpeaking() {
      return state.speaking;
    },
    set isSpeaking(v) {
      state.speaking = v;
    },
    get isListening() {
      return state.recognizing;
    },
  };
})();
