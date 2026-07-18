/**
 * Persistence. Everything lives in localStorage — no server, no account.
 */

const Store = (() => {
  const KEY_PROFILES = 'sc.profiles.v1';
  const KEY_ACTIVE = 'sc.active.v1';
  const KEY_CHECKLIST = 'sc.checklist.v1'; // pre-profiles single checklist
  const KEY_SETTINGS = 'sc.settings.v1';

  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 1,
    pitch: 1,
    voiceInput: true,
    speakResponse: true, // read the expected response back after you confirm
    autoNextPhase: true, // roll straight into the next checklist when one ends
    runMode: 'confirm', // 'confirm' waits for you; 'auto' reads and advances itself
    autoHoldMs: 2500, // auto mode: your window to do the item before the readback
    threshold: 0.5,
    gapMs: 400, // silence between confirming an item and calling the next
    recGain: 1, // playback volume boost for recorded clips — some mics record quiet
  };

  function uid() {
    return 'x' + Math.random().toString(36).slice(2, 9);
  }

  function valid(p) {
    return p && typeof p === 'object' && Array.isArray(p.phases);
  }

  function loadProfiles() {
    try {
      const raw = localStorage.getItem(KEY_PROFILES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length && parsed.every(valid)) return parsed;
      }
    } catch (_) {
      /* fall through to a rebuild */
    }
    return migrate();
  }

  /**
   * First run under the profiles model. Anything the user edited back when there
   * was only one checklist has to survive, so it is carried over as its own
   * profile — unless it is byte-identical to the stock one, in which case it is
   * just the untouched default and would only duplicate it.
   */
  function migrate() {
    const profiles = defaultProfiles();
    try {
      const raw = localStorage.getItem(KEY_CHECKLIST);
      if (raw) {
        const legacy = JSON.parse(raw);
        const stock = structuredClone(DEFAULT_CHECKLIST);
        delete stock.id;
        const cmp = structuredClone(legacy);
        delete cmp.id;
        if (valid(legacy) && JSON.stringify(cmp) !== JSON.stringify(stock)) {
          profiles.unshift({
            id: 'my' + uid(),
            name: legacy.name || 'My checklist',
            phases: legacy.phases,
          });
        }
      }
    } catch (_) {
      /* a corrupt legacy blob is not worth failing the boot over */
    }
    saveProfiles(profiles);
    return profiles;
  }

  function saveProfiles(list) {
    localStorage.setItem(KEY_PROFILES, JSON.stringify(list));
  }

  function loadActiveId(profiles) {
    const id = localStorage.getItem(KEY_ACTIVE);
    if (id && profiles.some((p) => p.id === id)) return id;
    return profiles[0] ? profiles[0].id : null;
  }

  function saveActiveId(id) {
    localStorage.setItem(KEY_ACTIVE, id);
  }

  function resetProfiles() {
    localStorage.removeItem(KEY_PROFILES);
    localStorage.removeItem(KEY_ACTIVE);
    localStorage.removeItem(KEY_CHECKLIST);
    const list = defaultProfiles();
    saveProfiles(list);
    return list;
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

  return {
    loadProfiles,
    saveProfiles,
    resetProfiles,
    loadActiveId,
    saveActiveId,
    loadSettings,
    saveSettings,
    uid,
    DEFAULT_SETTINGS,
  };
})();
