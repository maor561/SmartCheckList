/**
 * Persistence. Everything lives in localStorage — no server, no account.
 */

const Store = (() => {
  const KEY_CHECKLIST = 'sc.checklist.v1';
  const KEY_SETTINGS = 'sc.settings.v1';

  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 1,
    pitch: 1,
    voiceInput: true,
    speakResponse: true, // read the expected response back after you confirm
    threshold: 0.5,
    gapMs: 400, // silence between confirming an item and calling the next
  };

  function loadChecklist() {
    try {
      const raw = localStorage.getItem(KEY_CHECKLIST);
      if (!raw) return structuredClone(DEFAULT_CHECKLIST);
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.phases)) throw new Error('bad shape');
      return parsed;
    } catch (_) {
      return structuredClone(DEFAULT_CHECKLIST);
    }
  }

  function saveChecklist(cl) {
    localStorage.setItem(KEY_CHECKLIST, JSON.stringify(cl));
  }

  function resetChecklist() {
    localStorage.removeItem(KEY_CHECKLIST);
    return structuredClone(DEFAULT_CHECKLIST);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  }

  function uid() {
    return 'x' + Math.random().toString(36).slice(2, 9);
  }

  return {
    loadChecklist,
    saveChecklist,
    resetChecklist,
    loadSettings,
    saveSettings,
    uid,
    DEFAULT_SETTINGS,
  };
})();
