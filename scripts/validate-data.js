#!/usr/bin/env node
// =====================================================================
// validate-data.js — Garde-fou d'intégrité des fichiers data/*.json.
// Exécuté par le workflow GitHub Actions après update-data.js : un échec
// (exit 1) bloque le commit et marque le run en rouge.
//
// Usage :  node scripts/validate-data.js
// =====================================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Dates de tirage attendues mais légitimement absentes (annulations FDJ
// avérées). Format : 'YYYY-MM-DD'. Vide à ce jour.
const ALLOWED_GAPS = {
  euromillions: [],
  loto: [],
  eurodreams: [],
};

// Règles calendaires par ère : [dateDebut, joursUTC (0=dim … 6=sam)]
// EuroMillions : vendredi seul jusqu'au 06/05/2011, mardi+vendredi ensuite.
const DRAW_CALENDAR = {
  euromillions: [
    { from: '2004-02-13', to: '2011-05-09', days: [5] },
    { from: '2011-05-10', to: null, days: [2, 5] },
  ],
  loto: [
    { from: '2008-10-06', to: null, days: [1, 3, 6] },
  ],
  eurodreams: [
    { from: '2023-11-06', to: null, days: [1, 4] },
  ],
};

// Nombre de rangs de gains attendu par ère
const RANK_COUNTS = {
  euromillions: d => (d < '2011-05-10' ? 12 : 13),
  loto: d => (d < '2017-03-06' ? 6 : 9),
  eurodreams: () => 6,
};

const GAME_SPECS = {
  euromillions: { ballCount: 5, ballMax: 50, stars: { count: 2, max: 12 } },
  loto: { ballCount: 5, ballMax: 49, bonusMax: 10 },
  eurodreams: { ballCount: 6, ballMax: 40, bonusMax: 5 },
};

const DAY_PREFIX = ['DI', 'LU', 'MA', 'ME', 'JE', 'VE', 'SA'];

function weekdayUTC(iso) {
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

let errors = 0;
let warnings = 0;
function err(game, msg) { errors++; console.error(`  [ERREUR] ${game}: ${msg}`); }
function warn(game, msg) { warnings++; console.warn(`  [attention] ${game}: ${msg}`); }

function validateGame(game) {
  console.log(`\n[${game}]`);
  const file = path.join(DATA_DIR, `${game}.json`);
  if (!fs.existsSync(file)) return err(game, `${game}.json absent`);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return err(game, `JSON illisible : ${e.message}`);
  }

  const spec = GAME_SPECS[game];
  const draws = data.draws || [];
  if (data.totalDraws !== draws.length) {
    err(game, `totalDraws (${data.totalDraws}) ≠ draws.length (${draws.length})`);
  }
  if (draws.length === 0) return err(game, 'aucun tirage');

  const seenDates = new Set();
  let prevDate = null;

  for (const d of draws) {
    const where = `tirage ${d.date}`;

    // Dates : format, unicité, tri anti-chronologique
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) { err(game, `date invalide "${d.date}"`); continue; }
    if (seenDates.has(d.date)) err(game, `date dupliquée ${d.date}`);
    seenDates.add(d.date);
    if (prevDate !== null && d.date >= prevDate) err(game, `tri anti-chronologique cassé autour de ${d.date}`);
    prevDate = d.date;

    // Cohérence jour affiché / date (les vieux CSV EM abrègent : "VE")
    if (d.day) {
      const expected = DAY_PREFIX[weekdayUTC(d.date)];
      if (d.day.trim().toUpperCase().slice(0, 2) !== expected) {
        err(game, `${where} : jour "${d.day}" incohérent avec la date (${expected}…)`);
      }
    }

    // Boules : effectif, bornes, doublons, tri
    if (!Array.isArray(d.balls) || d.balls.length !== spec.ballCount) {
      err(game, `${where} : ${(d.balls || []).length} boules au lieu de ${spec.ballCount}`);
    } else {
      if (d.balls.some(b => !Number.isInteger(b) || b < 1 || b > spec.ballMax)) {
        err(game, `${where} : boule hors bornes [1..${spec.ballMax}] (${d.balls})`);
      }
      if (new Set(d.balls).size !== d.balls.length) err(game, `${where} : boules dupliquées (${d.balls})`);
    }

    // Étoiles / bonus
    if (spec.stars) {
      if (!Array.isArray(d.stars) || d.stars.length !== spec.stars.count) {
        err(game, `${where} : étoiles manquantes`);
      } else if (d.stars.some(s => !Number.isInteger(s) || s < 1 || s > spec.stars.max)) {
        err(game, `${where} : étoile invalide ou hors bornes (${d.stars})`);
      }
    } else if (!Number.isInteger(d.bonus) || d.bonus < 1 || d.bonus > spec.bonusMax) {
      err(game, `${where} : bonus hors bornes [1..${spec.bonusMax}] (${d.bonus})`);
    }

    // Prizes : effectif par ère, rangs uniques, valeurs plausibles
    const prizes = d.prizes || [];
    const expectedRanks = RANK_COUNTS[game](d.date);
    if (prizes.length !== expectedRanks) {
      err(game, `${where} : ${prizes.length} rangs de gains au lieu de ${expectedRanks} pour cette ère`);
    }
    const ranks = new Set();
    for (const p of prizes) {
      if (ranks.has(p.rank)) err(game, `${where} : rang ${p.rank} dupliqué`);
      ranks.add(p.rank);
      // Typage strict : les coercitions JS ("12.5" >= 0 est vrai) laisseraient
      // passer des fichiers corrompus que le validateur est censé attraper.
      if (typeof p.prize !== 'number' || !isFinite(p.prize) || p.prize < 0) {
        err(game, `${where} rang ${p.rank} : prize négatif ou invalide (${JSON.stringify(p.prize)})`);
      }
      const w = p.winners !== undefined ? p.winners : p.winnersEu;
      if (!Number.isInteger(w) || w < 0) err(game, `${where} rang ${p.rank} : winners invalide (${JSON.stringify(w)})`);
      if (p.winnersFr !== undefined && (!Number.isInteger(p.winnersFr) || p.winnersFr < 0)) {
        err(game, `${where} rang ${p.rank} : winnersFr invalide (${JSON.stringify(p.winnersFr)})`);
      }
      if (p.winnersEu !== undefined && p.winnersFr !== undefined && p.winnersEu < p.winnersFr) {
        err(game, `${where} rang ${p.rank} : winnersEu (${p.winnersEu}) < winnersFr (${p.winnersFr})`);
      }
    }

    // Cohérence hasWinner ↔ rang 1 (le champ est calculé au parsing puis
    // potentiellement modifié par corrections.json : il doit rester synchrone)
    if (d.hasWinner !== undefined) {
      const r1 = prizes.find(p => p.rank === 1);
      const expectedHW = r1 ? (r1.winnersEu || r1.winners || 0) > 0 : false;
      if (d.hasWinner !== expectedHW) {
        err(game, `${where} : hasWinner=${d.hasWinner} incohérent avec les gagnants du rang 1`);
      }
    }
  }

  // Continuité calendaire : chaque jour de tirage attendu entre la première
  // et la dernière date présente doit exister (détecte les coutures d'archives,
  // comme le LOTO du 2019-11-04 tombé entre deux ZIP FDJ).
  const newest = draws[0].date;
  const missing = [];
  for (const era of DRAW_CALENDAR[game]) {
    const start = era.from;
    const end = era.to && era.to < newest ? era.to : newest;
    for (let t = new Date(start + 'T12:00:00Z'); ; t.setUTCDate(t.getUTCDate() + 1)) {
      const iso = t.toISOString().slice(0, 10);
      if (iso > end) break;
      if (!era.days.includes(t.getUTCDay())) continue;
      if (!seenDates.has(iso) && !ALLOWED_GAPS[game].includes(iso)) missing.push(iso);
    }
  }
  if (missing.length > 0) {
    err(game, `${missing.length} date(s) de tirage attendue(s) manquante(s) : ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
  }

  console.log(`  ${draws.length} tirages (${draws[draws.length - 1].date} → ${newest}) — continuité calendaire OK sauf erreurs listées`);
}

console.log('=== EuroAffûté — Validation des données ===');
for (const game of ['euromillions', 'loto', 'eurodreams']) validateGame(game);

console.log(`\n=== ${errors} erreur(s), ${warnings} avertissement(s) ===`);
if (errors > 0) process.exitCode = 1;
