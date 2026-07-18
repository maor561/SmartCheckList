/**
 * Smart Checklist — app shell and the run state machine.
 */

(() => {
  const PROGRESS_KEY = 'sc.progress.v1';

  let profiles = Store.loadProfiles();
  let activeId = Store.loadActiveId(profiles);
  let settings = Store.loadSettings();
  let progress = loadProgress();

  /** The profile currently being run and edited. */
  function checklistOf() {
    return profiles.find((p) => p.id === activeId) || profiles[0];
  }

  const run = {
    phaseId: null,
    index: 0,
    active: false, // the loop is running (speaking/listening)
    misses: 0, // consecutive unrecognized responses on this item
  };

  // True while a recognition result is being acted on (speaking + advancing).
  // Blocks re-entrant results — see Speech.onResult.
  let handlingResult = false;

  // ------------------------------------------------------------ helpers

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function saveProgress() {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }

  function phaseById(id) {
    return checklistOf().phases.find((p) => p.id === id);
  }

  function currentPhase() {
    return phaseById(run.phaseId);
  }

  function currentItem() {
    const p = currentPhase();
    return p ? p.items[run.index] : null;
  }

  function phaseProgress(p) {
    const done = p.items.filter((i) => progress[i.id]).length;
    return { done, total: p.items.length };
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2200);
  }

  function showView(name) {
    $$('.view').forEach((v) => (v.hidden = true));
    $(`#view-${name}`).hidden = false;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------ home

  /** Fill a <select> with the profile list. Used on home and in the editor. */
  function renderProfileOptions(sel) {
    sel.innerHTML = '';
    profiles.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      const n = p.phases.reduce((a, ph) => a + ph.items.length, 0);
      o.textContent = `${p.name || 'Untitled'} (${n})`;
      sel.appendChild(o);
    });
    sel.value = activeId;
  }

  function switchProfile(id) {
    if (!profiles.some((p) => p.id === id)) return;
    stopLoop();
    activeId = id;
    Store.saveActiveId(id);
    renderHome();
    showView('home');
  }

  function renderHome() {
    renderProfileOptions($('#profile-select'));
    const list = $('#phase-list');
    list.innerHTML = '';

    checklistOf().phases.forEach((p) => {
      const { done, total } = phaseProgress(p);
      const complete = total > 0 && done === total;

      const li = document.createElement('li');
      li.className = 'phase-card' + (complete ? ' complete' : '');
      li.innerHTML = `
        <div class="phase-main">
          <span class="phase-name"></span>
          <span class="phase-meta">${done} / ${total}</span>
        </div>
        <div class="phase-bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
      `;
      li.querySelector('.phase-name').textContent = p.name;
      li.addEventListener('click', () => openPhase(p.id));
      list.appendChild(li);
    });

    const totals = checklistOf().phases.reduce(
      (a, p) => {
        const { done, total } = phaseProgress(p);
        return { done: a.done + done, total: a.total + total };
      },
      { done: 0, total: 0 }
    );
    $('#home-sub').textContent = `${totals.done} of ${totals.total} items checked`;
  }

  // ------------------------------------------------------------ run view

  function openPhase(id) {
    run.phaseId = id;
    run.index = firstUnchecked(id);
    run.active = false;
    run.misses = 0;
    renderRun();
    showView('run');
    setStatus('ready', 'Ready');
  }

  function firstUnchecked(id) {
    const p = phaseById(id);
    if (!p) return 0;
    const i = p.items.findIndex((it) => !progress[it.id]);
    return i === -1 ? p.items.length : i;
  }

  function renderRun() {
    const p = currentPhase();
    if (!p) return;

    $('#run-phase').textContent = p.name;
    const { done, total } = phaseProgress(p);
    $('#run-count').textContent = `${done} / ${total}`;

    const list = $('#item-list');
    list.innerHTML = '';

    p.items.forEach((item, i) => {
      const li = document.createElement('li');
      const isCurrent = i === run.index && run.index < p.items.length;
      li.className =
        'item' +
        (progress[item.id] ? ' checked' : '') +
        (isCurrent ? ' current' : '') +
        (i > run.index && !progress[item.id] ? ' pending' : '');
      li.dataset.index = String(i);
      li.innerHTML = `
        <span class="tick">${progress[item.id] ? '✓' : ''}</span>
        <span class="challenge"></span>
        <span class="dots"></span>
        <span class="response"></span>
        ${item.note ? '<span class="note"></span>' : ''}
      `;
      li.querySelector('.challenge').textContent = item.challenge;
      li.querySelector('.response').textContent = item.response;
      // Notes are shown, never spoken — "GSX" read aloud mid-callout is noise.
      if (item.note) li.querySelector('.note').textContent = item.note;
      li.addEventListener('click', () => onItemTap(i));
      list.appendChild(li);
    });

    const complete = total > 0 && done === total;
    $('#phase-done').hidden = !complete;
    if (complete) {
      const next = nextPhase();
      $('#done-title').textContent = `${p.name} — complete`;
      $('#btn-next-phase').hidden = !next;
      if (next) $('#btn-next-phase').textContent = `Next: ${next.name}`;
    }

    scrollCurrentIntoView();
  }

  function scrollCurrentIntoView() {
    const el = $('.item.current');
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function nextPhase() {
    const i = checklistOf().phases.findIndex((p) => p.id === run.phaseId);
    return i >= 0 ? checklistOf().phases[i + 1] : null;
  }

  function setStatus(kind, text) {
    $('#mic-dot').className = 'dot ' + kind;
    $('#status-text').textContent = text;
  }

  function setHeard(text) {
    $('#heard').textContent = text ? `“${text}”` : '';
  }

  /**
   * Tapping a row is always allowed and always wins. It's the escape hatch for
   * when voice isn't being picked up — the reason it exists is that negotiating
   * with a tablet is worse than touching it.
   */
  function onItemTap(i) {
    const p = currentPhase();
    if (!p) return;

    if (progress[p.items[i].id]) {
      // Tapping a checked item unchecks it and parks the cursor there.
      delete progress[p.items[i].id];
      saveProgress();
      run.index = i;
      stopLoop();
      renderRun();
      setStatus('ready', 'Unchecked — tap Start to resume');
      return;
    }

    run.index = i;
    confirmCurrent({ spoken: false });
  }

  // ------------------------------------------------------------ the loop

  async function startLoop() {
    const p = currentPhase();
    if (!p) return;

    if (run.index >= p.items.length) {
      run.index = firstUnchecked(run.phaseId);
      if (run.index >= p.items.length) {
        toast('Phase already complete');
        return;
      }
    }

    run.active = true;
    handlingResult = false;
    $('#btn-start').textContent = 'Stop';
    $('#btn-start').classList.remove('primary');
    await callOutCurrent();
  }

  function stopLoop() {
    run.active = false;
    handlingResult = false;
    Speech.stopListening();
    Speech.cancelSpeech();
    $('#btn-start').textContent = 'Start';
    $('#btn-start').classList.add('primary');
    setStatus('ready', 'Stopped');
    setHeard('');
  }

  /**
   * Voice one field of an item: play its recording if one exists, otherwise
   * speak the text. Same gate either way — the mic is shut while it sounds.
   */
  async function voice(item, field) {
    const blob = await AudioStore.get(AudioStore.key(item.id, field));
    if (blob) return Speech.playClip(blob, { rate: settings.rate });
    return Speech.speak(field === 'challenge' ? item.challenge : item.response, {
      voiceURI: settings.voiceURI,
      rate: settings.rate,
      pitch: settings.pitch,
    });
  }

  /** Speak the challenge, then open the mic. Never both at once. */
  async function callOutCurrent() {
    const item = currentItem();
    if (!item) {
      finishPhase();
      return;
    }

    run.misses = 0;
    renderRun();
    setHeard('');

    Speech.stopListening(); // hard gate: mic closed before we make any sound
    setStatus('speaking', item.challenge);

    await voice(item, 'challenge');

    if (!run.active) return;

    if (settings.runMode === 'auto') {
      // The pause is the point: it's your window to actually do the item before
      // the readback lands. The mic stays shut — in auto mode the app talks
      // almost continuously, and a recognizer opening between callouts would
      // mostly hear the app itself. Stop and the item rows still work by touch.
      setStatus('waiting', 'Auto — do it now');
      await sleep(settings.autoHoldMs);
      if (!run.active) return;
      await confirmCurrent({ spoken: false });
      return;
    }

    listen();
  }

  function listen() {
    if (!run.active) return;

    if (!settings.voiceInput || !Speech.supported()) {
      setStatus('waiting', 'Tap the item, or press Check');
      return;
    }
    const ok = Speech.startListening();
    setStatus(ok ? 'listening' : 'waiting', ok ? 'Listening…' : 'Tap Check to confirm');
  }

  async function confirmCurrent({ spoken = true } = {}) {
    const p = currentPhase();
    const item = currentItem();
    if (!p || !item) return;

    Speech.stopListening();

    progress[item.id] = true;
    saveProgress();
    setStatus('ok', 'Checked');
    renderRun();

    // Auto mode always reads the response — reading the checklist to you *is*
    // the mode, and without it the run is a list of questions with no answers.
    if (settings.speakResponse || settings.runMode === 'auto') {
      await voice(item, 'response');
    }

    run.index += 1;

    if (!run.active) {
      // Confirmed by tap while the loop was stopped: park on the next item.
      renderRun();
      if (run.index >= p.items.length) finishPhase();
      return;
    }

    if (run.index >= p.items.length) {
      finishPhase();
      return;
    }

    await sleep(settings.gapMs);
    if (!run.active) return;
    await callOutCurrent();
  }

  async function sayAgain(heardText) {
    run.misses += 1;
    setHeard(heardText || '');
    setStatus('miss', run.misses >= 2 ? 'Not getting that — tap the item' : 'Say again');

    Speech.stopListening();
    // On the second miss re-play the item's own challenge (recording or TTS);
    // the bare "Say again" prompt stays synthesized.
    if (run.misses >= 2) {
      await voice(currentItem(), 'challenge');
    } else {
      await Speech.speak('Say again', {
        voiceURI: settings.voiceURI,
        rate: settings.rate,
        pitch: settings.pitch,
      });
    }
    if (!run.active) return;
    listen();
  }

  async function skipCurrent() {
    const p = currentPhase();
    if (!p) return;
    Speech.stopListening();
    run.index = Math.min(run.index + 1, p.items.length);
    if (run.index >= p.items.length) {
      finishPhase();
      return;
    }
    if (run.active) await callOutCurrent();
    else renderRun();
  }

  async function goBack() {
    const p = currentPhase();
    if (!p) return;
    Speech.stopListening();
    run.index = Math.max(0, run.index - 1);
    const item = p.items[run.index];
    if (item) {
      delete progress[item.id];
      saveProgress();
    }
    if (run.active) await callOutCurrent();
    else renderRun();
  }

  async function finishPhase() {
    // Whether the crew was running hands-free decides whether we carry the
    // momentum into the next checklist or just park there ready.
    const wasRunning = run.active;
    const finished = currentPhase();

    run.active = false;
    Speech.stopListening();
    $('#btn-start').textContent = 'Start';
    $('#btn-start').classList.add('primary');
    renderHome();
    renderRun();
    setStatus('ok', 'Checklist complete');

    const next = nextPhase();
    const voice = { voiceURI: settings.voiceURI, rate: settings.rate, pitch: settings.pitch };

    if (!next || !settings.autoNextPhase) {
      await Speech.speak('Checklist complete', voice);
      return;
    }

    await Speech.speak(`Checklist complete. Next, ${next.name}`, voice);

    // The announcement takes a second or two, and it is a hands-free moment —
    // the user may well have hit back or tapped another phase during it. Only
    // move if they are still sitting where we left them.
    if ($('#view-run').hidden) return;
    if (!finished || run.phaseId !== finished.id) return;
    if (run.active) return;

    openPhase(next.id);
    if (wasRunning) startLoop();
  }

  // ------------------------------------------------------------ recognition wiring

  Speech.onResult = (alternatives) => {
    if (!run.active || handlingResult) return;
    const item = currentItem();
    if (!item) return;

    const r = Match.classifyAll(alternatives, item.response, { threshold: settings.threshold });
    setHeard(r.transcript);

    const action =
      {
        confirm: () => confirmCurrent({ spoken: true }),
        skip: () => skipCurrent(),
        back: () => goBack(),
        repeat: () => callOutCurrent(),
        hold: () => stopLoop(),
      }[r.type] || (() => sayAgain(r.transcript));

    // The action plays audio and advances asynchronously — there is a real gap
    // (awaiting the clip out of IndexedDB) before the speaking gate closes the
    // mic. A second result landing in that gap, whether the recognizer bursting
    // duplicates or the tablet speaker echoing our own callout, would fire a
    // second confirm: two clips overlapping and the cursor skipping an item.
    // Hold all further input until this action settles and the mic is open on
    // the next item.
    handlingResult = true;
    Promise.resolve()
      .then(action)
      .catch(() => {})
      .finally(() => {
        handlingResult = false;
      });
  };

  Speech.onStateChange = (s) => {
    if (s.error === 'mic-denied') {
      settings.voiceInput = false;
      Store.saveSettings(settings);
      $('#set-voice-input').checked = false;
      setStatus('miss', 'Microphone blocked — using tap only');
      toast('Microphone permission denied. Tap items to check them.');
    }
  };

  // ------------------------------------------------------------ editor

  // Only one clip records at a time; starting a new one stops whoever's live.
  let stopActiveRec = null;

  /** Codec the MediaRecorder can produce here — differs Android vs iOS. */
  function recorderMime() {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
    return (window.MediaRecorder && cands.find((m) => MediaRecorder.isTypeSupported(m))) || '';
  }

  /**
   * A self-contained record/play/clear control for one clip key. Cycles through
   * three states — empty (record), recording (stop + timer), recorded (play +
   * clear) — repainting itself as it goes. Audio lives in IndexedDB, so none of
   * this touches the profile JSON or calls persist().
   */
  function makeRecorder(key) {
    const ctl = document.createElement('div');
    ctl.className = 'rec-ctl';
    let recorder = null;
    let chunks = [];
    let secs = 0;
    let ticker = null;

    async function paint() {
      if (recorder) {
        ctl.innerHTML = `<button type="button" class="rec on" title="Stop">■ ${secs}s</button>`;
        ctl.firstChild.onclick = stop;
        return;
      }
      const has = await AudioStore.has(key);
      ctl.innerHTML = has
        ? '<button type="button" class="rec has" title="Play recording">▶</button>' +
          '<button type="button" class="rec clr" title="Delete recording">✕</button>'
        : '<button type="button" class="rec" title="Record">●</button>';
      if (has) {
        ctl.querySelector('.has').onclick = play;
        ctl.querySelector('.clr').onclick = clear;
      } else {
        ctl.firstChild.onclick = start;
      }
    }

    async function start() {
      if (stopActiveRec) stopActiveRec(); // save whatever else was recording
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        toast('Microphone unavailable' + (e && e.name ? ` (${e.name})` : ''));
        return;
      }
      const mime = recorderMime();
      try {
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch (_) {
        recorder = new MediaRecorder(stream);
      }
      chunks = [];
      recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(ticker);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        recorder = null;
        stopActiveRec = null;
        if (blob.size) await AudioStore.put(key, blob);
        paint();
      };
      recorder.start();
      stopActiveRec = stop;
      secs = 0;
      ticker = setInterval(() => {
        secs += 1;
        paint();
        if (secs >= 20) stop(); // a callout is a few seconds; cap runaways
      }, 1000);
      paint();
    }

    function stop() {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }

    async function play() {
      const blob = await AudioStore.get(key);
      if (blob) Speech.playClip(blob, { rate: settings.rate });
    }

    async function clear() {
      if (!confirm('Delete this recording?')) return;
      await AudioStore.del(key);
      paint();
    }

    paint();
    return ctl;
  }

  function renderEditor() {
    renderProfileOptions($('#edit-profile-select'));
    $('#edit-name').value = checklistOf().name || '';
    $('#btn-delete-profile').disabled = profiles.length <= 1;
    const wrap = $('#editor-phases');
    wrap.innerHTML = '';

    checklistOf().phases.forEach((phase, pi) => {
      const box = document.createElement('div');
      box.className = 'ed-phase';
      box.innerHTML = `
        <div class="ed-phase-head">
          <input class="ed-phase-name" type="text" value="">
          <div class="ed-phase-btns">
            <button class="btn ghost icon" data-act="up" title="Move up">↑</button>
            <button class="btn ghost icon" data-act="down" title="Move down">↓</button>
            <button class="btn ghost icon danger" data-act="del-phase" title="Delete phase">✕</button>
          </div>
        </div>
        <div class="ed-items"></div>
        <button class="btn ghost sm" data-act="add-item">+ Add item</button>
      `;

      const nameInput = box.querySelector('.ed-phase-name');
      nameInput.value = phase.name;
      nameInput.addEventListener('input', () => {
        phase.name = nameInput.value;
        persist();
      });

      const itemsWrap = box.querySelector('.ed-items');
      phase.items.forEach((item, ii) => {
        const row = document.createElement('div');
        row.className = 'ed-item';
        row.innerHTML = `
          <div class="ed-field ed-field-ch"><input class="ed-ch" type="text" placeholder="Challenge"></div>
          <div class="ed-field ed-field-rp"><input class="ed-rp" type="text" placeholder="Response"></div>
          <button class="btn ghost icon danger" data-act="del-item">✕</button>
        `;
        const ch = row.querySelector('.ed-ch');
        const rp = row.querySelector('.ed-rp');
        ch.value = item.challenge;
        rp.value = item.response;
        ch.addEventListener('input', () => {
          item.challenge = ch.value;
          persist();
        });
        rp.addEventListener('input', () => {
          item.response = rp.value;
          persist();
        });
        row.querySelector('.ed-field-ch').appendChild(makeRecorder(AudioStore.key(item.id, 'challenge')));
        row.querySelector('.ed-field-rp').appendChild(makeRecorder(AudioStore.key(item.id, 'response')));
        row.querySelector('[data-act="del-item"]').addEventListener('click', () => {
          AudioStore.delItem(item.id);
          phase.items.splice(ii, 1);
          persist();
          renderEditor();
        });
        itemsWrap.appendChild(row);
      });

      box.querySelector('[data-act="add-item"]').addEventListener('click', () => {
        phase.items.push({ id: Store.uid(), challenge: '', response: '' });
        persist();
        renderEditor();
      });

      box.querySelector('[data-act="del-phase"]').addEventListener('click', () => {
        if (!confirm(`Delete the "${phase.name}" phase and all its items?`)) return;
        phase.items.forEach((it) => AudioStore.delItem(it.id));
        checklistOf().phases.splice(pi, 1);
        persist();
        renderEditor();
      });

      box.querySelector('[data-act="up"]').addEventListener('click', () => {
        if (pi === 0) return;
        [checklistOf().phases[pi - 1], checklistOf().phases[pi]] = [checklistOf().phases[pi], checklistOf().phases[pi - 1]];
        persist();
        renderEditor();
      });

      box.querySelector('[data-act="down"]').addEventListener('click', () => {
        if (pi === checklistOf().phases.length - 1) return;
        [checklistOf().phases[pi + 1], checklistOf().phases[pi]] = [checklistOf().phases[pi], checklistOf().phases[pi + 1]];
        persist();
        renderEditor();
      });

      wrap.appendChild(box);
    });
  }

  function persist() {
    Store.saveProfiles(profiles);
    $('#edit-sub').textContent = 'Saved';
    clearTimeout(persist._t);
    persist._t = setTimeout(() => ($('#edit-sub').textContent = 'Changes save automatically'), 1200);
  }

  // ------------------------------------------------------------ settings

  /** "2500 ms" is arithmetic; "2.5 s" is a number you can feel. */
  function secs(ms) {
    if (ms < 1000) return ms + ' ms';
    return (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + ' s';
  }

  /**
   * Auto mode ticks items off without you, which is the opposite of how the
   * rest of the app behaves. Say so plainly rather than let it surprise anyone.
   */
  function renderRunModeNote() {
    const auto = settings.runMode === 'auto';
    $('#run-mode-note').textContent = auto
      ? 'Reads the item, waits, reads the response, and checks it off on its own — it does not wait for you. Press Stop to break out.'
      : 'Reads the item and waits for your voice or tap. Nothing is checked off without you.';
    $('#field-auto-hold').classList.toggle('muted', !auto);
  }

  function renderSettings() {
    const sel = $('#set-voice');
    const voices = Speech.listVoices();
    sel.innerHTML = '<option value="">System default</option>';
    voices.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(o);
    });
    sel.value = settings.voiceURI || '';

    $('#set-rate').value = settings.rate;
    $('#rate-val').textContent = Number(settings.rate).toFixed(2);
    $('#set-pitch').value = settings.pitch;
    $('#pitch-val').textContent = Number(settings.pitch).toFixed(2);
    $('#set-voice-input').checked = settings.voiceInput;
    $('#set-speak-response').checked = settings.speakResponse;
    $('#set-auto-next').checked = settings.autoNextPhase;
    $('#set-threshold').value = settings.threshold;
    $('#thr-val').textContent = Math.round(settings.threshold * 100) + '%';
    $('#set-gap').value = settings.gapMs;
    $('#gap-val').textContent = secs(settings.gapMs);
    $('#set-run-mode').value = settings.runMode;
    $('#set-auto-hold').value = settings.autoHoldMs;
    $('#hold-val').textContent = secs(settings.autoHoldMs);
    renderRunModeNote();

    const sttOk = Speech.supported();
    $('#diag').innerHTML = `
      <p><b>Speech recognition:</b> ${sttOk ? 'available' : 'NOT available in this browser'}</p>
      <p><b>Voices found:</b> ${voices.length}</p>
      <p class="hint">${
        sttOk
          ? 'Voice recognition needs an internet connection on Android and iOS.'
          : 'Open this page in Chrome (Android) or Safari (iOS) — other browsers do not support voice input.'
      }</p>
    `;
    $('#settings-sub').textContent = sttOk ? 'Voice ready' : 'Tap-only mode';
  }

  function bindSettings() {
    $('#set-voice').addEventListener('change', (e) => {
      settings.voiceURI = e.target.value;
      Store.saveSettings(settings);
    });
    $('#set-rate').addEventListener('input', (e) => {
      settings.rate = parseFloat(e.target.value);
      $('#rate-val').textContent = settings.rate.toFixed(2);
      Store.saveSettings(settings);
    });
    $('#set-pitch').addEventListener('input', (e) => {
      settings.pitch = parseFloat(e.target.value);
      $('#pitch-val').textContent = settings.pitch.toFixed(2);
      Store.saveSettings(settings);
    });
    $('#set-voice-input').addEventListener('change', (e) => {
      settings.voiceInput = e.target.checked;
      Store.saveSettings(settings);
      if (!settings.voiceInput) Speech.stopListening();
    });
    $('#set-speak-response').addEventListener('change', (e) => {
      settings.speakResponse = e.target.checked;
      Store.saveSettings(settings);
    });
    $('#set-auto-next').addEventListener('change', (e) => {
      settings.autoNextPhase = e.target.checked;
      Store.saveSettings(settings);
    });
    $('#set-threshold').addEventListener('input', (e) => {
      settings.threshold = parseFloat(e.target.value);
      $('#thr-val').textContent = Math.round(settings.threshold * 100) + '%';
      Store.saveSettings(settings);
    });
    $('#set-gap').addEventListener('input', (e) => {
      settings.gapMs = parseInt(e.target.value, 10);
      $('#gap-val').textContent = secs(settings.gapMs);
      Store.saveSettings(settings);
    });
    $('#set-run-mode').addEventListener('change', (e) => {
      settings.runMode = e.target.value;
      Store.saveSettings(settings);
      renderRunModeNote();
      // Switching mode mid-run would change the rules under the user's feet.
      if (run.active) stopLoop();
    });
    $('#set-auto-hold').addEventListener('input', (e) => {
      settings.autoHoldMs = parseInt(e.target.value, 10);
      $('#hold-val').textContent = secs(settings.autoHoldMs);
      Store.saveSettings(settings);
    });
    $('#btn-test-voice').addEventListener('click', () => {
      Speech.speak('Landing gear. Down and locked.', {
        voiceURI: settings.voiceURI,
        rate: settings.rate,
        pitch: settings.pitch,
      });
    });
  }

  // ------------------------------------------------------------ import / export

  function exportChecklist() {
    const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(checklistOf().name || 'checklist').replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importChecklist(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.phases)) throw new Error('Not a checklist file');
        // Import adds a profile rather than replacing the active one, so a
        // mis-picked file can never wipe work you already have.
        parsed.id = 'p' + Store.uid();
        parsed.name = parsed.name || 'Imported checklist';
        // Guarantee ids — a hand-written or exported file may be missing them,
        // and progress is keyed on item id. Re-id everything so an import of a
        // profile you already have cannot share its checkmarks.
        parsed.phases.forEach((p) => {
          p.id = Store.uid();
          (p.items || []).forEach((i) => (i.id = Store.uid()));
        });
        profiles.push(parsed);
        activeId = parsed.id;
        Store.saveActiveId(activeId);
        persist();
        renderEditor();
        renderHome();
        toast(`Imported "${parsed.name}"`);
      } catch (err) {
        toast('Could not read that file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------ wiring

  function bind() {
    $('#btn-edit').addEventListener('click', () => {
      renderEditor();
      showView('edit');
    });
    $('#btn-settings').addEventListener('click', () => {
      renderSettings();
      showView('settings');
    });
    $('#btn-edit-back').addEventListener('click', () => {
      renderHome();
      showView('home');
    });
    $('#btn-settings-back').addEventListener('click', () => {
      renderHome();
      showView('home');
    });
    $('#btn-back-home').addEventListener('click', () => {
      stopLoop();
      renderHome();
      showView('home');
    });

    $('#btn-start').addEventListener('click', () => {
      if (run.active) stopLoop();
      else startLoop();
    });
    $('#btn-confirm').addEventListener('click', () => {
      if (currentItem()) confirmCurrent({ spoken: false });
    });
    $('#btn-repeat').addEventListener('click', () => {
      if (run.active) callOutCurrent();
      else if (currentItem()) {
        Speech.speak(currentItem().challenge, {
          voiceURI: settings.voiceURI,
          rate: settings.rate,
          pitch: settings.pitch,
        });
      }
    });

    $('#btn-restart-phase').addEventListener('click', () => {
      const p = currentPhase();
      if (!p) return;
      p.items.forEach((i) => delete progress[i.id]);
      saveProgress();
      run.index = 0;
      stopLoop();
      renderRun();
      renderHome();
    });

    $('#btn-next-phase').addEventListener('click', () => {
      const n = nextPhase();
      if (n) openPhase(n.id);
    });

    $('#btn-reset-progress').addEventListener('click', () => {
      if (!confirm('Clear every checkmark in the whole checklist?')) return;
      progress = {};
      saveProgress();
      renderHome();
      toast('All checkmarks cleared');
    });

    $('#edit-name').addEventListener('input', (e) => {
      checklistOf().name = e.target.value;
      persist();
    });
    $('#btn-add-phase').addEventListener('click', () => {
      checklistOf().phases.push({ id: Store.uid(), name: 'New phase', items: [] });
      persist();
      renderEditor();
    });
    $('#btn-restore-default').addEventListener('click', () => {
      if (!confirm('Discard every profile and your edits, and restore the defaults?')) return;
      profiles = Store.resetProfiles();
      activeId = profiles[0].id;
      Store.saveActiveId(activeId);
      renderEditor();
      renderHome();
      toast('Default profiles restored');
    });

    $('#profile-select').addEventListener('change', (e) => switchProfile(e.target.value));

    $('#edit-profile-select').addEventListener('change', (e) => {
      activeId = e.target.value;
      Store.saveActiveId(activeId);
      renderEditor();
      renderHome();
    });

    $('#btn-new-profile').addEventListener('click', () => {
      const p = { id: 'p' + Store.uid(), name: 'New profile', phases: [] };
      profiles.push(p);
      activeId = p.id;
      Store.saveActiveId(activeId);
      persist();
      renderEditor();
      renderHome();
      $('#edit-name').focus();
      $('#edit-name').select();
    });

    $('#btn-duplicate-profile').addEventListener('click', () => {
      const src = checklistOf();
      const copy = structuredClone(src);
      copy.id = 'p' + Store.uid();
      copy.name = `${src.name} copy`;
      // Fresh item ids, or the copy would share checkmarks with the original.
      copy.phases.forEach((ph) => {
        ph.id = Store.uid();
        ph.items.forEach((it) => (it.id = Store.uid()));
      });
      profiles.push(copy);
      activeId = copy.id;
      Store.saveActiveId(activeId);
      persist();
      renderEditor();
      renderHome();
      toast('Profile duplicated');
    });

    $('#btn-delete-profile').addEventListener('click', () => {
      if (profiles.length <= 1) return;
      const p = checklistOf();
      if (!confirm(`Delete the profile "${p.name}" and all its phases?`)) return;
      p.phases.forEach((ph) =>
        ph.items.forEach((it) => {
          delete progress[it.id];
          AudioStore.delItem(it.id);
        })
      );
      saveProgress();
      profiles = profiles.filter((x) => x.id !== p.id);
      activeId = profiles[0].id;
      Store.saveActiveId(activeId);
      persist();
      renderEditor();
      renderHome();
      toast('Profile deleted');
    });

    $('#btn-export').addEventListener('click', exportChecklist);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importChecklist(e.target.files[0]);
      e.target.value = '';
    });

    bindSettings();

    // Voices arrive asynchronously on Android; refresh the picker when they do.
    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        if (!$('#view-settings').hidden) renderSettings();
      });
    }

    // Stop the mic if the app goes to the background — an open recognizer that
    // survives a screen lock is both a battery drain and a privacy surprise.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && run.active) stopLoop();
    });
  }

  // ------------------------------------------------------------ boot

  function boot() {
    Speech.setLang('en-US');
    bind();
    renderHome();
    showView('home');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})();
