#!/usr/bin/env node
// =====================================================================
// update-data.js — Télécharge les CSV FDJ (EuroMillions, LOTO, EuroDreams)
// et les convertit en JSON normalisé. Tout est sourcé depuis la FDJ,
// sans dépendance à une API tierce.
//
// Usage :  node scripts/update-data.js
// Sortie : data/euromillions.json, data/loto.json, data/eurodreams.json
// =====================================================================

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');

// --- URLs des sources (toutes FDJ) -----------------------------------

const EUROMILLIONS_ZIPS = [
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afe6', period: '2020-02 → présent' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afd6', period: '2019-03 → 2020-02' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afc6', period: '2016-09 → 2019-03' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afb6', period: '2014-02 → 2016-09' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afa9', period: '2011-05 → 2014-02' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afa8', period: '2004-02 → 2011-05' },
];

const LOTO_ZIPS = [
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afp6', period: '2019-11 → présent' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afo6', period: '2019-02 → 2019-11' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afn6', period: '2017-03 → 2019-02' },
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afm6', period: '2008-10 → 2017-03' },
];

const EURODREAMS_ZIPS = [
  { url: 'https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afa5', period: '2023-11 → présent' },
];

// --- Utilitaires réseau ----------------------------------------------

const FETCH_TIMEOUT_MS = 60000;        // inactivité socket
const FETCH_TOTAL_TIMEOUT_MS = 300000; // durée totale par requête
const MAX_REDIRECTS = 5;

function fetchBuffer(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    let settled = false;
    let deadline = null;
    const finish = fn => v => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn(v);
    };
    const ok = finish(resolve);
    const ko = finish(reject);

    const req = client.get(url, {
      headers: { 'User-Agent': 'EuroAffute-Updater/1.0' },
      timeout: FETCH_TIMEOUT_MS,
    }, res => {
      // Gère les redirections (bornées, et résout les Location relatives)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // libère le socket
        if (redirectsLeft <= 0) {
          return ko(new Error(`Trop de redirections pour ${url}`));
        }
        clearTimeout(deadline); // la requête suivante a son propre délai
        const next = new URL(res.headers.location, url).toString();
        return fetchBuffer(next, redirectsLeft - 1).then(ok).catch(ko);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return ko(new Error(`HTTP ${res.statusCode} pour ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // Corps tronqué avec statut 200 : détectable quand content-length est présent
        const expected = parseInt(res.headers['content-length'], 10);
        if (!isNaN(expected) && buf.length !== expected) {
          return ko(new Error(`Réponse tronquée pour ${url} : ${buf.length}/${expected} octets`));
        }
        ok(buf);
      });
      res.on('error', ko);
    });
    // L'option `timeout` de http.get ne borne que l'INACTIVITÉ du socket : un
    // serveur qui goutte un octet par minute retiendrait la requête sans fin.
    // Délai total dur en complément :
    deadline = setTimeout(() => {
      req.destroy(new Error(`Délai total dépassé (${FETCH_TOTAL_TIMEOUT_MS / 1000}s) pour ${url}`));
    }, FETCH_TOTAL_TIMEOUT_MS);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout d'inactivité (${FETCH_TIMEOUT_MS / 1000}s) pour ${url}`));
    });
    req.on('error', ko);
  });
}



// --- Extraction ZIP (sans dépendance externe) ------------------------
// On utilise `unzip` en CLI s'il est dispo, sinon on tente via PowerShell sur Windows

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  try {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
  } catch {
    // Fallback Windows PowerShell
    try {
      execSync(
        `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'pipe' }
      );
    } catch (e) {
      throw new Error(`Impossible d'extraire ${zipPath} : ${e.message}`);
    }
  }
}

// --- Parse CSV FDJ ---------------------------------------------------

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(';');
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (vals[j] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseFrenchDate(dateStr) {
  // "22/04/2026" → "2026-04-22" ; gère aussi "23/09/16" → "2016-09-23"
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  let year = parts[2];
  if (year.length === 2) year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
  return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function parseFrenchNumber(str) {
  // "3000000,00" → 3000000 ; "2,20" → 2.2 ; "48175066,00" → 48175066
  // On garde la précision exacte, sans arrondi
  if (!str || str === '') return 0;
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// --- LOTO : CSV → JSON -----------------------------------------------

function parseLotoCSV(rows) {
  const draws = [];
  for (const r of rows) {
    const date = parseFrenchDate(r.date_de_tirage);
    if (!date) continue;

    const balls = [];
    for (let i = 1; i <= 5; i++) {
      const n = parseInt(r[`boule_${i}`], 10);
      if (!isNaN(n) && n >= 1 && n <= 49) balls.push(n);
    }
    if (balls.length !== 5) continue;

    const chance = parseInt(r.numero_chance, 10);
    if (isNaN(chance) || chance < 1 || chance > 10) continue;

    // Prizes — le nombre de rangs varie selon la période
    const prizes = [];
    for (let rank = 1; rank <= 9; rank++) {
      const winnersKey = `nombre_de_gagnant_au_rang${rank}`;
      const prizeKey = `rapport_du_rang${rank}`;
      if (r[winnersKey] !== undefined && r[prizeKey] !== undefined) {
        const winners = parseInt(r[winnersKey], 10) || 0;
        const prize = parseFrenchNumber(r[prizeKey]);
        prizes.push({ rank, winners, prize });
      }
    }

    draws.push({
      date,
      day: (r.jour_de_tirage || '').trim(),
      balls: balls.sort((a, b) => a - b),
      bonus: chance,
      prizes,
    });
  }
  return draws;
}

// --- EURODREAMS : CSV → JSON ------------------------------------------

function parseEuroDreamsCSV(rows) {
  const draws = [];
  for (const r of rows) {
    const date = parseFrenchDate(r.date_de_tirage);
    if (!date) continue;

    const balls = [];
    for (let i = 1; i <= 6; i++) {
      const n = parseInt(r[`boule_${i}`], 10);
      if (!isNaN(n) && n >= 1 && n <= 40) balls.push(n);
    }
    if (balls.length !== 6) continue;

    const dream = parseInt(r.numero_dream, 10);
    if (isNaN(dream) || dream < 1 || dream > 5) continue;

    const prizes = [];
    for (let rank = 1; rank <= 6; rank++) {
      const winnersKeyFr = `nombre_de_gagnant_au_rang${rank}_euro_dreams_en_france`;
      const winnersKeyEu = `nombre_de_gagnant_au_rang${rank}_euro_dreams_en_europe`;
      const prizeKey = `rapport_du_rang${rank}_euro_dreams`;
      // Même garde que EM/LOTO : des colonnes renommées ne doivent pas
      // fabriquer des rangs à zéro (validate-data.js exige ensuite 6 rangs)
      if (r[winnersKeyEu] === undefined || r[prizeKey] === undefined) continue;
      const winnersFr = parseInt(r[winnersKeyFr], 10) || 0;
      let winnersEu = parseInt(r[winnersKeyEu], 10) || 0;
      // Plausibilité : la France est incluse dans l'Europe (cf. parseEuroMillionsCSV)
      if (winnersEu < winnersFr) {
        console.warn(`    ⚠ ${date} rang ${rank} : winnersEu (${winnersEu}) < winnersFr (${winnersFr}) — borné à winnersFr`);
        winnersEu = winnersFr;
      }
      const prize = parseFrenchNumber(r[prizeKey]);
      prizes.push({ rank, winnersFr, winnersEu, prize });
    }

    draws.push({
      date,
      day: (r.jour_de_tirage || '').trim(),
      balls: balls.sort((a, b) => a - b),
      bonus: dream,
      prizes,
    });
  }
  return draws;
}

// --- EUROMILLIONS : CSV FDJ → JSON ------------------------------------

function parseEuroMillionsCSV(rows) {
  const draws = [];
  for (const r of rows) {
    // Deux formats de date : "DD/MM/YYYY" (récent) ou "YYYYMMDD" (ancien)
    let date;
    const rawDate = r.date_de_tirage;
    if (rawDate && rawDate.includes('/')) {
      date = parseFrenchDate(rawDate);
    } else if (rawDate && rawDate.length === 8 && !rawDate.includes('-')) {
      date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    } else if (rawDate && /^\d{2}-\d{2}-\d{2}$/.test(rawDate)) {
      // Format YY-MM-DD → 20YY-MM-DD
      date = `20${rawDate.slice(0, 2)}-${rawDate.slice(3, 5)}-${rawDate.slice(6, 8)}`;
    }
    if (!date) continue;

    const balls = [];
    for (let i = 1; i <= 5; i++) {
      const n = parseInt(r[`boule_${i}`], 10);
      if (!isNaN(n) && n >= 1 && n <= 50) balls.push(n);
    }
    if (balls.length !== 5) continue;

    const stars = [];
    for (let i = 1; i <= 2; i++) {
      const n = parseInt(r[`etoile_${i}`], 10);
      if (!isNaN(n) && n >= 1 && n <= 12) stars.push(n);
    }
    if (stars.length !== 2) continue;

    // Prizes — les noms de colonnes changent selon la période :
    //   Récent : "nombre_de_gagnant_au_rang1_euro_millions_en_france"
    //   Ancien : "nombre_de_gagnant_au_rang1_en_france"
    const prizes = [];
    for (let rank = 1; rank <= 13; rank++) {
      let winnersFrKey = `nombre_de_gagnant_au_rang${rank}_euro_millions_en_france`;
      let winnersEuKey = `nombre_de_gagnant_au_rang${rank}_euro_millions_en_europe`;
      let prizeKey = `rapport_du_rang${rank}_euro_millions`;
      // Fallback vers le format ancien
      if (r[winnersEuKey] === undefined) {
        winnersFrKey = `nombre_de_gagnant_au_rang${rank}_en_france`;
        winnersEuKey = `nombre_de_gagnant_au_rang${rank}_en_europe`;
        prizeKey = `rapport_du_rang${rank}`;
      }
      if (r[winnersEuKey] !== undefined && r[prizeKey] !== undefined) {
        const winnersFr = parseInt(r[winnersFrKey], 10) || 0;
        let winnersEu = parseInt(r[winnersEuKey], 10) || 0;
        // Plausibilité : la France est incluse dans l'Europe. Certains CSV FDJ
        // ont des colonnes Europe vides (ex. tirage du 2020-01-31) → on borne
        // par winnersFr (corrigible plus finement via corrections.json).
        if (winnersEu < winnersFr) {
          console.warn(`    ⚠ ${date} rang ${rank} : winnersEu (${winnersEu}) < winnersFr (${winnersFr}) — borné à winnersFr`);
          winnersEu = winnersFr;
        }
        const prize = parseFrenchNumber(r[prizeKey]);
        prizes.push({ rank, winnersFr, winnersEu, prize });
      }
    }

    // Déterminer si le jackpot a été gagné (rang 1 avec gagnants > 0)
    const rank1 = prizes.find(p => p.rank === 1);
    const hasWinner = rank1 ? rank1.winnersEu > 0 : false;

    draws.push({
      date,
      day: (r.jour_de_tirage || '').trim(),
      balls: balls.sort((a, b) => a - b),
      stars: stars.sort((a, b) => a - b),
      hasWinner,
      prizes,
      myMillion: r.numero_my_million || null,
    });
  }
  return draws;
}

// --- Corrections manuelles --------------------------------------------
// scripts/corrections.json répare les défauts connus des archives FDJ :
//   "add"   : tirages absents des ZIP (ex. LOTO du 2019-11-04, à la couture
//             entre deux archives) — injectés s'ils ne sont pas déjà présents.
//   "patch" : champs erronés (ex. EM du 2020-01-31, colonnes Europe vides) —
//             fusionnés par date ; les prizes sont fusionnés rang par rang.

function loadCorrections() {
  const p = path.join(__dirname, 'corrections.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function applyCorrections(gameName, draws) {
  const corr = loadCorrections()[gameName];
  if (!corr) return draws;
  const byDate = new Map(draws.map(d => [d.date, d]));

  // hasWinner (EM uniquement) est calculé au parsing : toute correction qui
  // touche les prizes doit le resynchroniser, sinon la donnée devient
  // silencieusement incohérente (winnersEu rang 1 > 0 avec hasWinner=false).
  const syncHasWinner = draw => {
    if (gameName !== 'euromillions') return;
    const r1 = (draw.prizes || []).find(p => p.rank === 1);
    draw.hasWinner = r1 ? (r1.winnersEu || r1.winners || 0) > 0 : false;
  };

  for (const add of corr.add || []) {
    if (byDate.has(add.date)) continue; // déjà dans les archives
    // Les clés préfixées "_" (documentation, sources) restent dans corrections.json
    const draw = Object.fromEntries(Object.entries(add).filter(([k]) => !k.startsWith('_')));
    if (gameName === 'euromillions' && draw.hasWinner === undefined) syncHasWinner(draw);
    draws.push(draw);
    byDate.set(draw.date, draw);
    console.log(`  + Correction : tirage ${draw.date} injecté (absent des archives FDJ)`);
  }

  for (const patch of corr.patch || []) {
    const target = byDate.get(patch.date);
    if (!target) {
      console.warn(`  ⚠ Correction ignorée : tirage ${patch.date} introuvable`);
      continue;
    }
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'date' || key.startsWith('_')) continue;
      if (key === 'prizes') {
        for (const pp of value) {
          const entry = (target.prizes || []).find(e => e.rank === pp.rank);
          if (entry) Object.assign(entry, pp);
        }
        syncHasWinner(target);
      } else {
        target[key] = value;
      }
    }
    console.log(`  ± Correction : tirage ${patch.date} patché (${Object.keys(patch).filter(k => k !== 'date' && !k.startsWith('_')).join(', ')})`);
  }
  return draws;
}

// --- Téléchargement et parsing des ZIP FDJ ----------------------------

async function fetchFDJGame(zips, parser, gameName) {
  const tmpDir = path.join(require('os').tmpdir(), `euroaffute_${gameName}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const allDraws = [];
  const seenDates = new Set();

  for (const { url, period } of zips) {
    console.log(`  Downloading ${gameName} ${period}...`);
    const zipBuf = await fetchBuffer(url);
    const zipPath = path.join(tmpDir, `${gameName}_${Date.now()}.zip`);
    fs.writeFileSync(zipPath, zipBuf);

    const extractDir = path.join(tmpDir, `extract_${Date.now()}`);
    extractZip(zipPath, extractDir);

    // Trouve le CSV dans le dossier extrait
    const files = fs.readdirSync(extractDir).filter(f => f.endsWith('.csv'));
    if (files.length === 0) {
      throw new Error(`Archive ${gameName} ${period} : aucun CSV dans le ZIP`);
    }
    let zipDraws = 0;
    for (const file of files) {
      const csvText = fs.readFileSync(path.join(extractDir, file), 'utf-8');
      const rows = parseCSV(csvText);
      const draws = parser(rows);
      zipDraws += draws.length;
      for (const d of draws) {
        if (!seenDates.has(d.date)) {
          seenDates.add(d.date);
          allDraws.push(d);
        }
      }
      console.log(`    ${file}: ${draws.length} tirages parsés`);
    }
    // Un ZIP dont plus AUCUNE ligne ne parse signale un changement de format
    // FDJ : mieux vaut échouer bruyamment qu'écrire un historique amputé.
    if (zipDraws === 0) {
      throw new Error(`Archive ${gameName} ${period} : 0 tirage parsé (format FDJ modifié ?)`);
    }

    // Nettoyage
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  applyCorrections(gameName, allDraws);

  // Tri anti-chronologique
  allDraws.sort((a, b) => b.date.localeCompare(a.date));
  return allDraws;
}

// --- Génération des fichiers JSON ------------------------------------

function writeJSON(filename, game, config, draws) {
  const filePath = path.join(DATA_DIR, filename);

  let old = null;
  if (fs.existsSync(filePath)) {
    try {
      old = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      console.warn(`  ⚠ ${filename} existant illisible — réécriture complète`);
    }
  }

  // Garde anti-régression : ne jamais écraser un historique par moins de
  // données (ZIP partiel, format FDJ modifié, réponse tronquée…).
  // Contournement volontaire : EUROAFFUTE_FORCE=1 node scripts/update-data.js
  if (old && Array.isArray(old.draws) && process.env.EUROAFFUTE_FORCE !== '1') {
    if (draws.length < old.draws.length) {
      throw new Error(
        `Régression refusée pour ${filename} : ${draws.length} tirages < ${old.draws.length} existants ` +
        `(EUROAFFUTE_FORCE=1 pour forcer)`
      );
    }
    const oldNewest = old.draws.length ? old.draws[0].date : '';
    const newNewest = draws.length ? draws[0].date : '';
    if (newNewest < oldNewest) {
      throw new Error(
        `Régression refusée pour ${filename} : date la plus récente ${newNewest} < ${oldNewest} existante ` +
        `(EUROAFFUTE_FORCE=1 pour forcer)`
      );
    }
  }

  // lastUpdated stable : si rien n'a changé (mêmes tirages, même config), on
  // conserve l'horodatage existant pour que le fichier soit octet pour octet
  // identique — sinon chaque run du cron (dont le rattrapage quotidien)
  // produirait un commit de pur bruit.
  let lastUpdated = new Date().toISOString();
  if (old && old.lastUpdated
      && JSON.stringify(old.draws) === JSON.stringify(draws)
      && JSON.stringify(old.config) === JSON.stringify(config)) {
    lastUpdated = old.lastUpdated;
  }

  const output = {
    game,
    config,
    lastUpdated,
    totalDraws: draws.length,
    draws,
  };
  // Minifié : -55 % sur disque, -22 % en gzip, parse ~40 % plus rapide côté
  // client — ces fichiers sont générés, pas destinés à la lecture humaine.
  fs.writeFileSync(filePath, JSON.stringify(output), 'utf-8');
  console.log(`  → ${filePath} (${draws.length} tirages)`);
}

// --- Main ------------------------------------------------------------

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('=== EuroAffûté — Mise à jour des données ===\n');
  const failures = [];

  // 1. EuroMillions (CSV FDJ)
  console.log('[EuroMillions]');
  try {
    const emDraws = await fetchFDJGame(EUROMILLIONS_ZIPS, parseEuroMillionsCSV, 'euromillions');
    writeJSON('euromillions.json', 'euromillions', {
      ballCount: 5,
      ballMax: 50,
      starCount: 2,
      starMax: 12,
      totalCombinations: 139838160,
      gridCost: 2.50,
      drawDays: ['mardi', 'vendredi'],
    }, emDraws);
  } catch (err) {
    console.error('  ERREUR EuroMillions :', err.message);
    failures.push('euromillions');
  }

  // 2. LOTO
  console.log('\n[LOTO]');
  try {
    const lotoDraws = await fetchFDJGame(LOTO_ZIPS, parseLotoCSV, 'loto');
    writeJSON('loto.json', 'loto', {
      ballCount: 5,
      ballMax: 49,
      bonusName: 'N° Chance',
      bonusMax: 10,
      totalCombinations: 19068840, // C(49,5) × 10
      gridCost: 2.20,
      drawDays: ['lundi', 'mercredi', 'samedi'],
    }, lotoDraws);
  } catch (err) {
    console.error('  ERREUR LOTO :', err.message);
    failures.push('loto');
  }

  // 3. EuroDreams
  console.log('\n[EuroDreams]');
  try {
    const edDraws = await fetchFDJGame(EURODREAMS_ZIPS, parseEuroDreamsCSV, 'eurodreams');
    writeJSON('eurodreams.json', 'eurodreams', {
      ballCount: 6,
      ballMax: 40,
      bonusName: 'N° Dream',
      bonusMax: 5,
      totalCombinations: 19191900, // C(40,6) × 5 = 3 838 380 × 5
      gridCost: 2.50,
      drawDays: ['lundi', 'jeudi'],
      topPrize: '20 000 €/mois pendant 30 ans',
    }, edDraws);
  } catch (err) {
    console.error('  ERREUR EuroDreams :', err.message);
    failures.push('eurodreams');
  }

  if (failures.length > 0) {
    // Les jeux réussis ont déjà été écrits ; on signale l'échec au CI pour
    // que le workflow soit marqué rouge au lieu de vieillir en silence.
    console.error(`\n=== Terminé avec ÉCHEC pour : ${failures.join(', ')} ===`);
    process.exitCode = 1;
  } else {
    console.log('\n=== Terminé ===');
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
