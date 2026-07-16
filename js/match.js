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
  const STOP = new Set(['and', 'the', 'a', 'an', 'to', 'of', 'is', 'as', 'at', 'in', 'or']);

  function keywords(s) {
    return norm(s)
      .split(' ')
      .filter((w) => w && w.length > 1 && !STOP.has(w));
  }

  /** Fraction of the expected response's keywords present in the transcript. */
  function overlap(transcript, expected) {
    const want = keywords(expected);
    if (!want.length) return 0;
    const heard = new Set(norm(transcript).split(' '));
    const hit = want.filter((w) => heard.has(w)).length;
    return hit / want.length;
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
