/**
 * Converts an exported checklist CSV into a profile the app can load.
 *
 *   node scripts/import-csv.js data/pmdg-737-maor-v2.csv pmdg737 js/profile-pmdg737.js
 *
 * The CSV carries two levels of nesting the app does not have: a `procedure`
 * (PREFLIGHT, BEFORE START, ...) containing `section`s (PREFLIGHT CHECKLIST,
 * Passing TA, ...). Both become flat phases here, which is the right shape for
 * running them: a procedure's loose "flow" items and its formal CHECKLIST are
 * genuinely separate things you run at different moments.
 */

const fs = require('fs');
const path = require('path');

// Column order is fixed by the export format.
const COL = { procedure: 4, section: 5, content: 6, check: 7, note: 8 };

/** RFC4180-ish parser — fields like "NORMAL, AUTO" carry commas inside quotes. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * A section already naming its procedure stands alone ("PREFLIGHT CHECKLIST");
 * otherwise it gets the procedure prefixed, because bare "Passing TA" appears
 * under two different procedures and would be ambiguous in the phase list.
 */
/**
 * "... CHECKLIST COMPLETED" rows close a checklist rather than open a phase.
 * The source spells it both COMPLETED and COMLETED, hence the loose middle.
 */
const isCompletionMarker = (s) => /\bCOM\w*LETED\b/i.test(s);

function phaseName(procedure, section) {
  if (!procedure) return section;
  if (!section) return procedure;
  const words = procedure.toUpperCase().split(/[^A-Z0-9']+/).filter((w) => w.length > 2);
  const inSection = section.toUpperCase();
  return words.some((w) => inSection.includes(w)) ? section : `${procedure} — ${section}`;
}

function convert(csvPath, profileId, profileName) {
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const phases = [];
  let procedure = '';
  let phase = null;

  const openPhase = (name) => {
    phase = { id: `${profileId}.${phases.length}`, name, items: [] };
    phases.push(phase);
    return phase;
  };

  rows.slice(1).forEach((row) => {
    const proc = clean(row[COL.procedure]);
    const section = clean(row[COL.section]);
    const content = clean(row[COL.content]);
    const check = clean(row[COL.check]);
    const note = clean(row[COL.note]);

    if (proc) {
      procedure = proc;
      openPhase(proc);
    }
    // A section row can also carry its own first item (e.g. BELOW 10'000FT /
    // MAX SPEED / 250 KIAS), so this is not an else-if.
    if (section) {
      // Closing the phase, not opening one: items appearing after the marker are
      // the procedure's flow resuming (lights and clearance after the before-
      // takeoff checklist), not part of a phase called "... COMPLETED".
      if (isCompletionMarker(section)) phase = null;
      else openPhase(phaseName(procedure, section));
    }

    const isInstruction = note && !content && !check;
    if (!content && !isInstruction) return;
    if (!phase) openPhase(`${procedure} (continued)`);

    phase.items.push(
      isInstruction
        ? // A note with no challenge is a standalone instruction ("Taxi to
          // Assigned Gate, max 20 knots"). Keep it as a step you acknowledge.
          { id: `${phase.id}.${phase.items.length}`, challenge: note, response: '' }
        : {
            id: `${phase.id}.${phase.items.length}`,
            challenge: content,
            response: check,
            ...(note ? { note } : {}),
          }
    );
  });

  const kept = phases.filter((p) => p.items.length);
  kept.forEach((p, i) => {
    const old = p.id;
    p.id = `${profileId}.${i}`;
    p.items.forEach((it, j) => (it.id = `${p.id}.${j}`));
    void old;
  });

  return { id: profileId, name: profileName, phases: kept };
}

function main() {
  const [csvPath, profileId, outPath] = process.argv.slice(2);
  if (!csvPath || !profileId || !outPath) {
    console.error('usage: node scripts/import-csv.js <csv> <profileId> <outFile> [name]');
    process.exit(1);
  }
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const name = process.argv[5] || clean(rows[1] && rows[1][2]) || profileId;

  const profile = convert(csvPath, profileId, name);
  const varName = 'PROFILE_' + profileId.toUpperCase().replace(/[^A-Z0-9]/g, '_');

  const banner =
    `/**\n` +
    ` * Generated by scripts/import-csv.js from ${path.basename(csvPath)} — do not edit by hand.\n` +
    ` * Regenerate: node scripts/import-csv.js ${csvPath} ${profileId} ${outPath}\n` +
    ` */\n\n`;

  fs.writeFileSync(outPath, `${banner}const ${varName} = ${JSON.stringify(profile, null, 2)};\n`, 'utf8');

  const items = profile.phases.reduce((a, p) => a + p.items.length, 0);
  console.log(`${outPath}: "${profile.name}" — ${profile.phases.length} phases, ${items} items`);
  profile.phases.forEach((p) => console.log(`  ${String(p.items.length).padStart(3)}  ${p.name}`));
}

main();
