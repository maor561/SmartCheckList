/**
 * Voice matching.
 *
 * This is deliberately NOT open dictation. At any moment the app is expecting
 * one of a small, known set of phrases: the item's own response, a generic
 * acknowledgement, or a navigation command. Matching against that closed set is
 * what makes engine noise from the sim harmless — steady-state rumble doesn't
 * transcribe to "check". Anything we can't place confidently becomes a
 * "say again", never a guess.
 */

const Match = (() => {
  const COMMANDS = {
    repeat: ['say again', 'again', 'repeat', 'repeat that', 'once more'],
    skip: ['skip', 'skip it', 'next', 'pass', 'continue'],
    back: ['back', 'go back', 'previous', 'last one', 'undo'],
    hold: ['hold', 'stop', 'pause', 'standby', 'stand by', 'wait'],
  };

  const AFFIRM = [
    'check',
    'checked',
    'set',
    'on',
    'off',
    'done',
    'complete',
    'completed',
    'confirmed',
    'confirm',
    'roger',
    'affirm',
    'affirmative',
    'yes',
    'yep',
    'ok',
    'okay',
  ];

  /** Lowercase, strip placeholders/punctuation, collapse whitespace. */
  function norm(s) {
    return String(s)
      .toLowerCase()
      .replace(/_+/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Content words of an expected response, minus filler. */
  const STOP = new Set(['and', 'the', 'a', 'an', 'to', 'of', 'is', 'as', 'at', 'in', 'or', 'for']);

  // Recognizers hand back "one hundred percent" where the card says "100%".
  const NUM_WORDS = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
    eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40',
    fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
  };

  /**
   * Number words to digits. Deliberately does NOT fold "two seven" into 27 —
   * aviation reads digits individually ("runway two seven"), so combining them
   * would invent values nobody said.
   */
  function foldNumbers(list) {
    const out = [];
    for (const w of list) {
      const prev = out[out.length - 1];
      if (w === 'hundred' && prev && /^\d+$/.test(prev)) out[out.length - 1] = String(+prev * 100);
      else if (NUM_WORDS[w] !== undefined) out.push(NUM_WORDS[w]);
      else out.push(w);
    }
    return out;
  }

  function keywords(s) {
    return foldNumbers(norm(s).split(' ').filter(Boolean)).filter(
      (w) => (w.length > 1 || /\d/.test(w)) && !STOP.has(w)
    );
  }

  /**
   * Checklists are written in abbreviations but spoken in full: the card says
   * "AS REQ", "CONT", "ARM" and you say "as required", "continuous", "armed".
   * Treat one word as the other when the shorter is a prefix of the longer.
   * The 3-character floor keeps "on" from matching "one".
   */
  function wordMatches(heard, want) {
    if (heard === want) return true;
    const [short, long] = want.length <= heard.length ? [want, heard] : [heard, want];
    return short.length >= 3 && long.startsWith(short);
  }

  /**
   * Balances two questions, and needs both to be yes:
   *   recall    — did you say the expected response?
   *   precision — was that mostly all you said?
   *
   * Recall alone is not enough. Half these responses are a single word ("RUN",
   * "CLEAR", "ENGINE"), so ambient speech that happens to contain it — ATC on
   * the speakers, someone saying "the engine is running loud" — scores a perfect
   * recall and checks the item off. Requiring precision too means a stray
   * keyword buried in a sentence no longer counts as an answer.
   */
  function overlapOne(transcript, expected) {
    const want = keywords(expected);
    const heard = keywords(transcript);
    if (!want.length || !heard.length) return 0;

    const recall = want.filter((w) => heard.some((h) => wordMatches(h, w))).length / want.length;
    const precision = heard.filter((h) => want.some((w) => wordMatches(h, w))).length / heard.length;
    if (!recall || !precision) return 0;

    return (2 * recall * precision) / (recall + precision);
  }

  /**
   * Fraction of the expected response's keywords present in the transcript.
   *
   * A response like "15 OR 30 OR 40" lists alternatives, not a phrase to recite
   * — requiring half of all of them would reject the one you actually said. So
   * split on "or" and take the best branch.
   */
  function overlap(transcript, expected) {
    const alternatives = String(expected).split(/\s+or\s+/i).filter((s) => s.trim());
    if (alternatives.length > 1) {
      return Math.max(...alternatives.map((a) => overlapOne(transcript, a)));
    }
    return overlapOne(transcript, expected);
  }

  function hasPhrase(transcript, phrases) {
    const t = ` ${norm(transcript)} `;
    return phrases.some((p) => t.includes(` ${norm(p)} `));
  }

  /**
   * Classify one transcript against the currently expected item.
   *
   * Returns { type, score } where type is one of:
   *   'repeat' | 'skip' | 'back' | 'hold'  — navigation commands
   *   'confirm'                            — item is done, advance
   *   null                                 — not understood
   *
   * Commands are checked before confirmation: if an item's response happens to
   * be "Continuous" and you say "continue", you meant to skip, not to answer.
   */
  function classify(transcript, expectedResponse, opts = {}) {
    const threshold = opts.threshold ?? 0.5;

    for (const [type, phrases] of Object.entries(COMMANDS)) {
      if (hasPhrase(transcript, phrases)) return { type, score: 1 };
    }

    if (expectedResponse) {
      const o = overlap(transcript, expectedResponse);
      if (o >= threshold) return { type: 'confirm', score: o };
    }

    if (hasPhrase(transcript, AFFIRM)) return { type: 'confirm', score: 0.8 };

    return { type: null, score: 0 };
  }

  /**
   * Classify a list of recognizer alternatives, best result wins.
   * The top alternative isn't always the right one in noise, so we consider all.
   */
  function classifyAll(alternatives, expectedResponse, opts = {}) {
    let best = { type: null, score: 0, transcript: '' };
    for (const alt of alternatives) {
      const r = classify(alt.transcript, expectedResponse, opts);
      if (r.type && r.score > best.score) {
        best = { ...r, transcript: alt.transcript };
      }
    }
    if (!best.type && alternatives.length) best.transcript = alternatives[0].transcript;
    return best;
  }

  return { classify, classifyAll, norm, keywords, overlap, AFFIRM, COMMANDS };
})();
