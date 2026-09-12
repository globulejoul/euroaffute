#!/usr/bin/env node
// =====================================================================
// update-jackpots.js — Récupère les cagnottes côté SERVEUR et les écrit
// dans data/jackpots.json.
//
// Pourquoi : le navigateur ne peut pas lire fdj.fr ni euro-millions.com
// (pas d'en-tête CORS). L'app passait par des proxies CORS publics, qui
// sont tous morts (corsproxy.io exige une clé API, allorigins time-out).
// Ici, pas de CORS : GitHub Actions télécharge directement et committe le
// résultat, que l'app lit en same-origin.
//
// Usage :  node scripts/update-jackpots.js
// Sortie : data/jackpots.json
// =====================================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'jackpots.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIMEOUT_MS = 30000;
// Pages de tirage récupérées une par une en rattrapage (bornées pour ne pas
// marteler la source : en régime permanent il en manque 0 ou 1 par run).
const MAX_GAP_FILL = 6;

const NEXT_DRAW_URLS = {
  euromillions: 'https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/',
  loto: 'https://www.fdj.fr/jeux-de-tirage/loto?board=0',
};
const RESULTS_PAGE_URL = 'https://www.euro-millions.com/results';

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text || text.length < 500) throw new Error('réponse trop courte (' + text.length + ')');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// --- parsing de la page FDJ -------------------------------------------

const MONTHS = {
  janv: 1, jan: 1, 'févr': 2, fev: 2, mars: 3, avr: 4, mai: 5, juin: 6,
  juil: 7, 'août': 8, aout: 8, sept: 9, oct: 10, nov: 11, 'déc': 12, dec: 12,
};

function parseNextDraw(html) {
  const out = { amountEur: null, nextDay: null, nextDate: null, drawDate: null };

  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const titleText = titleMatch ? titleMatch[1] : '';

  // "17 M€" / "17,5 M€" (la FDJ insère des espaces insécables) ou "17 millions €"
  const compactRe = /([0-9]+(?:[.,][0-9]+)?)[\s  ]*M€/i;
  const longRe = /([0-9]+(?:[.,][0-9]+)?)[\s  ]*millions?[\s  ]*(?:€|d’euros?|d'euros?)/i;

  const m = compactRe.exec(titleText) || longRe.exec(titleText)
         || compactRe.exec(html) || longRe.exec(html);
  if (m) {
    const num = parseFloat(m[1].replace(',', '.'));
    if (!isNaN(num)) out.amountEur = Math.round(num * 1e6);
  }

  // "ce mardi 15 sept." / "ce samedi 12 septembre 2026"
  const dateRe = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[\s ]+([0-9]{1,2})[\s ]+(janv|jan|févr|fev|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)[a-zé.]*(?:[\s ]+(\d{4}))?/i;
  const mDate = dateRe.exec(titleText) || dateRe.exec(html);
  if (mDate) {
    out.nextDay = mDate[1].toLowerCase();
    out.nextDate = mDate[2] + ' ' + mDate[3] + '.';
    const month = MONTHS[mDate[3].toLowerCase()];
    if (month) {
      const now = new Date();
      let year = mDate[4] ? parseInt(mDate[4], 10) : now.getUTCFullYear();
      // Sans année explicite : si le mois est loin derrière, c'est l'an prochain
      if (!mDate[4] && month < now.getUTCMonth() + 1 - 6) year++;
      out.drawDate = year + '-' + String(month).padStart(2, '0') + '-' +
                     String(parseInt(mDate[2], 10)).padStart(2, '0');
    }
  }
  return out;
}

// --- parsing des jackpots récents (euro-millions.com/results) ---------

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&euro;/g, '€').replace(/&#8364;/g, '€')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function parseRecentJackpots(html) {
  const out = {};
  const linkRe = /results\/(\d{2})-(\d{2})-(\d{4})/g;
  const positions = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    positions.push({ iso: m[3] + '-' + m[2] + '-' + m[1], start: m.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const date = positions[i].iso;
    if (out[date]) continue;
    const from = positions[i].start;
    const to = (i + 1 < positions.length) ? positions[i + 1].start : from + 5000;
    const block = htmlToText(html.substring(from, to));
    const amtRe = /€\s*([\d,\s.]{5,25})/g;
    let mA;
    while ((mA = amtRe.exec(block)) !== null) {
      const num = parseInt(mA[1].replace(/[,\s.]/g, ''), 10);
      if (!isNaN(num) && num >= 1e6 && num <= 300e6) {
        out[date] = { jackpot: num, won: /Jackpot\s+(Won|gagné)/i.test(block) };
        break;
      }
    }
  }
  return out;
}

// Dates de tirage référencées par la page de résultats (les plus récentes
// d'abord), qu'un montant ait été extrait ou non.
function listedDates(html) {
  const re = /results\/(\d{2})-(\d{2})-(\d{4})/g;
  const seen = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const iso = m[3] + '-' + m[2] + '-' + m[1];
    if (!seen.includes(iso)) seen.push(iso);
  }
  return seen.sort().reverse();
}

// Page d'un tirage : "Jackpot: €98,714,021" (montant TOTAL du tirage, y
// compris quand il est partagé entre plusieurs gagnants).
function parseSingleDraw(html) {
  const t = htmlToText(html);
  const m = /Jackpot:?\s*€\s*([\d,.]+)/i.exec(t);
  if (!m) return null;
  const num = parseInt(m[1].replace(/[,.\s]/g, ''), 10);
  if (isNaN(num) || num < 1e6 || num > 300e6) return null;
  return { jackpot: num, won: /Jackpot\s+Won/i.test(t) };
}

// --- main -------------------------------------------------------------

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('=== EuroAffûté — Mise à jour des cagnottes ===\n');

  // On repart de l'existant : une source qui échoue ne doit pas effacer une
  // valeur encore valable (le client vérifie lui-même la fraîcheur).
  let previous = { nextDraw: {}, recent: {} };
  if (fs.existsSync(OUT_FILE)) {
    try {
      previous = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
    } catch {
      console.warn('  ⚠ jackpots.json illisible — régénération complète');
    }
  }

  const out = {
    updated: new Date().toISOString(),
    nextDraw: Object.assign({}, previous.nextDraw),
    recent: Object.assign({}, previous.recent),
  };
  const failures = [];
  let listingHtml = '';

  for (const [game, url] of Object.entries(NEXT_DRAW_URLS)) {
    try {
      const parsed = parseNextDraw(await fetchText(url));
      if (!parsed.amountEur) throw new Error('montant introuvable dans la page');
      out.nextDraw[game] = parsed;
      console.log('  ✓ ' + game + ' : ' + (parsed.amountEur / 1e6).toFixed(0) + ' M€' +
                  (parsed.drawDate ? ' (tirage du ' + parsed.drawDate + ')' : ''));
    } catch (err) {
      console.error('  ✗ ' + game + ' : ' + err.message);
      failures.push(game);
    }
  }

  try {
    listingHtml = await fetchText(RESULTS_PAGE_URL);
    const recent = parseRecentJackpots(listingHtml);
    const n = Object.keys(recent).length;
    if (n === 0) throw new Error('aucun jackpot parsé');
    Object.assign(out.recent, recent);
    // Borne la taille : on ne garde que les 60 tirages les plus récents
    const kept = Object.keys(out.recent).sort().reverse().slice(0, 60);
    out.recent = Object.fromEntries(kept.map(d => [d, out.recent[d]]));
    console.log('  ✓ jackpots récents : ' + n + ' tirages parsés (' + kept.length + ' conservés)');

    // Rattrapage : certaines dates du listing n'exposent pas leur montant
    // (le bloc ne contient qu'un encart « prochain tirage estimé »). On va
    // alors chercher la page du tirage, qui l'affiche toujours. Sans ça, le
    // navigateur devrait scraper ces dates lui-même — ce qu'il ne peut plus.
    const wanted = listedDates(listingHtml).slice(0, 16);
    const missing = wanted.filter(d => !out.recent[d]).slice(0, MAX_GAP_FILL);
    for (const date of missing) {
      const parts = date.split('-');
      const url = 'https://www.euro-millions.com/results/' + parts[2] + '-' + parts[1] + '-' + parts[0];
      try {
        const one = parseSingleDraw(await fetchText(url));
        if (!one) throw new Error('montant introuvable');
        out.recent[date] = one;
        console.log('  ✓ rattrapage ' + date + ' : ' + (one.jackpot / 1e6).toFixed(1) + ' M€');
      } catch (err) {
        console.warn('  ⚠ rattrapage ' + date + ' impossible : ' + err.message);
      }
    }
  } catch (err) {
    console.error('  ✗ jackpots récents : ' + err.message);
    failures.push('recent');
  }

  // Horodatage stable : si rien n'a bougé, on conserve celui du fichier
  // existant pour que le workflow ne committe pas un diff de pur bruit.
  const sameContent = previous.nextDraw && previous.recent &&
    JSON.stringify(previous.nextDraw) === JSON.stringify(out.nextDraw) &&
    JSON.stringify(previous.recent) === JSON.stringify(out.recent);
  if (sameContent && previous.updated) out.updated = previous.updated;

  fs.writeFileSync(OUT_FILE, JSON.stringify(out), 'utf-8');
  console.log('\n  → ' + OUT_FILE);

  if (failures.length) {
    console.error('\n=== Terminé avec ÉCHEC pour : ' + failures.join(', ') + ' ===');
    process.exitCode = 1;
  } else {
    console.log('\n=== Terminé ===');
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
