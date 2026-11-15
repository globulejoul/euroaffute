// =====================================================================
// js/core.js — cœur de calcul partagé entre l'app (index.html, chargé par
// une balise <script>) et les scripts Node (scripts/fit-popularity.js, par
// require). Aucun accès au DOM ni à l'état de l'app : des fonctions pures.
//
// Chargé comme script classique : ses déclarations de premier niveau sont
// visibles du script de l'app. Sous Node, elles sont exportées en fin de
// fichier.
// =====================================================================

// --- ères et tables de rangs -------------------------------------------

// L'étoile 12 a rejoint le tirage le 24 septembre 2016.
// Avant cette date, les étoiles étaient tirées dans 1-11.
const STAR_12_ERA_START = '2016-09-24';

// Tables officielles FDJ : (boules matchées, étoiles/bonus matchés) → rang.
// La signification des rangs a CHANGÉ au fil des ans : chaque table est
// résolue selon l'ère du tirage (par date ou par nombre de rangs).

// EuroMillions — ère 12 étoiles (depuis le 27/09/2016) : 13 rangs
const RANK_TABLE_EM = {
  '5+2': 1, '5+1': 2, '5+0': 3, '4+2': 4, '4+1': 5, '3+2': 6,
  '4+0': 7, '2+2': 8, '3+1': 9, '3+0': 10, '1+2': 11, '2+1': 12, '2+0': 13,
};
// EuroMillions — ère 11 étoiles (10/05/2011 → 23/09/2016) : le 4+0 (rang 6)
// passait devant le 3+2 (rang 7), plus fréquent avec 11 étoiles.
const RANK_TABLE_EM_11 = {
  '5+2': 1, '5+1': 2, '5+0': 3, '4+2': 4, '4+1': 5, '4+0': 6,
  '3+2': 7, '2+2': 8, '3+1': 9, '3+0': 10, '1+2': 11, '2+1': 12, '2+0': 13,
};
// EuroMillions — ère 9 étoiles (13/02/2004 → 06/05/2011) : 12 rangs
// seulement (pas de 2+0), et 3+1 (rang 8) devant 2+2 (rang 9).
const RANK_TABLE_EM_9 = {
  '5+2': 1, '5+1': 2, '5+0': 3, '4+2': 4, '4+1': 5, '4+0': 6,
  '3+2': 7, '3+1': 8, '2+2': 9, '3+0': 10, '1+2': 11, '2+1': 12,
};
// Premier tirage EM à 13 rangs (vérifié dans les données)
const EM_13_RANKS_START = '2011-05-10';

// LOTO moderne (depuis le 06/03/2017) : 9 rangs. Le rang 9 (remboursement
// 2,20 €) est gagné dès que le N° Chance est trouvé — avec 0 OU 1 bon numéro.
const RANK_TABLE_LOTO = {
  '5+1': 1, '5+0': 2, '4+1': 3, '4+0': 4, '3+1': 5, '3+0': 6,
  '2+1': 7, '2+0': 8, '1+1': 9, '0+1': 9,
};

// Ancien LOTO (06/10/2008 → 04/03/2017, tirages à 6 rangs) : le N° Chance ne
// comptait que seul (rang 6, remboursement ~2 €), les rangs 2 à 5 l'ignoraient.
// NB : le remboursement Chance était cumulable avec un rang de boules ; on ne
// retient ici que le rang principal (léger sous-comptage assumé).
function oldLotoRank(mn, ms) {
  if (mn === 5) return ms ? 1 : 2;
  if (mn === 4) return 3;
  if (mn === 3) return 4;
  if (mn === 2) return 5;
  return ms ? 6 : null;
}

// EuroDreams : 6 rangs — le N° Dream ne distingue QUE les rangs 1 et 2 ;
// en dessous, seuls les numéros comptent (rang 3 = 5 numéros … rang 6 = 2).
function edRank(mn, ms) {
  if (mn === 6) return ms ? 1 : 2;
  if (mn >= 2) return 8 - mn;  // 5→3, 4→4, 3→5, 2→6
  return null;
}

// Rang atteint par (mn, ms) sur ce tirage, selon le jeu ET l'ère du tirage
function resolveRank(game, draw, mn, ms) {
  if (game === 'euromillions') {
    const table = draw.date >= STAR_12_ERA_START ? RANK_TABLE_EM
                : draw.date >= EM_13_RANKS_START ? RANK_TABLE_EM_11
                : RANK_TABLE_EM_9;
    return table[mn + '+' + ms] || null;
  }
  if (game === 'loto') {
    if (draw.prizes && draw.prizes.length <= 6) return oldLotoRank(mn, ms);
    return RANK_TABLE_LOTO[mn + '+' + ms] || null;
  }
  return edRank(mn, ms);
}

// --- structures combinatoires d'une grille -----------------------------
// Les joueurs ne choisissent pas des numéros indépendants : ils cochent des
// dates (jour + mois), évitent les numéros qui se suivent, « étalent » sur la
// grille… Chaque trait est compté sur la grille triée et pèse dans le modèle
// de popularité avec un coefficient MESURÉ (moindres carrés, cf. learnPopularity).
const STRUCT_FEATURES = [
  { key: 'pairLow31', label: 'Paires de dates (deux numéros ≤ 31)', one: 'paire de dates', many: 'paires de dates', unit: 'par paire' },
  { key: 'pairLow12', label: 'Paires de mois (deux numéros ≤ 12)', one: 'paire de mois', many: 'paires de mois', unit: 'par paire' },
  { key: 'adjacent', label: 'Paires consécutives (n, n+1)', one: 'paire consécutive', many: 'paires consécutives', unit: 'par paire' },
  { key: 'sameRow', label: 'Paires sur la même ligne de la grille', one: 'paire sur une même ligne', many: 'paires sur une même ligne', unit: 'par paire' },
  { key: 'sameCol', label: 'Paires dans la même colonne de la grille', one: 'paire dans une même colonne', many: 'paires dans une même colonne', unit: 'par paire' },
  { key: 'gridAlign', label: 'Alignement de 3+ sur une ligne ou une colonne', one: 'alignement de 3+', many: 'alignements de 3+', unit: 'si présent' },
  { key: 'mult7', label: 'Paires de multiples de 7', one: 'paire de multiples de 7', many: 'paires de multiples de 7', unit: 'par paire' },
];
// Largeur de la grille FDJ : 10 colonnes (EM, LOTO), 8 (EuroDreams)
function gridWidthFor(game) { return game === 'eurodreams' ? 8 : 10; }

function structFeatures(sorted, width) {
  const K = sorted.length;
  let adjacent = 0, sameCol = 0, sameRow = 0, pairLow31 = 0, pairLow12 = 0, mult7 = 0;
  const cols = new Array(width).fill(0);
  const rows = new Array(8).fill(0);
  for (let i = 0; i < K; i++) {
    const a = sorted[i];
    cols[(a - 1) % width]++;
    rows[Math.floor((a - 1) / width)]++;
    if (i > 0 && a - sorted[i - 1] === 1) adjacent++;
    for (let j = i + 1; j < K; j++) {
      const b = sorted[j];
      if ((a - 1) % width === (b - 1) % width) sameCol++;
      if (Math.floor((a - 1) / width) === Math.floor((b - 1) / width)) sameRow++;
      if (b <= 31) pairLow31++;
      if (b <= 12) pairLow12++;
      if (a % 7 === 0 && b % 7 === 0) mult7++;
    }
  }
  const gridAlign = (cols.some(c => c >= 3) || rows.some(r => r >= 3)) ? 1 : 0;
  return [pairLow31, pairLow12, adjacent, sameRow, sameCol, gridAlign, mult7];
}

// --- volume exact par les dotations ------------------------------------
// Dans un jeu en répartition, la dotation d'un rang (lot × gagnants) est une
// part FIXE des mises : dotation = c × V, où c — les euros de dotation du
// rang par grille jouée — ne dépend que du règlement, pas des numéros
// sortis. Des numéros populaires font plus de gagnants, mais le lot baisse
// d'autant : le produit ne bouge pas. « gagnants ÷ probabilité », lui, gonfle
// avec la popularité (écart-type mesuré contre le volume exact : 13 % en EM,
// 17 % au LOTO, 8 % en EuroDreams ; jusqu'à +70 % les soirs de dates).
//
// Régimes de répartition — deux tirages du même règlement ont les mêmes
// rapports de dotation entre rangs, à l'arrondi des lots près. On regroupe
// donc les tirages par cette signature, sans coder une seule date ; retrouvés
// seuls : EM août 2004, mai 2011, sept. 2016, fév. 2020 ; LOTO nov. 2019 ;
// EuroDreams oct. 2025.
//
// Constante c — elle s'apprend sans connaître le règlement : sur des tirages
// uniformes, E[gagnants / (V × p)] = 1 exactement, quoi que jouent les
// joueurs. Or gagnants / (p × dotation) = 1 / (p × lot) : c est donc la
// moyenne harmonique de p × lot sur le régime, et V = lot × gagnants / c.
// Précision : ±0,3 % d'un tirage à l'autre (arrondi des lots), plus une
// erreur commune au régime de 0,3 % (700 tirages) à 2 % (20 tirages).
//
// Lots fixes — un rang à lot fixe (remboursement) ne mesure pas les mises.
// Mais quand ses lots sont prélevés sur la MÊME enveloppe que les rangs en
// répartition, ce sont eux qui la creusent : au LOTO depuis nov. 2019, un
// N° Chance très joué coûte plus de remboursements et laisse moins aux autres
// rangs (erreur de volume de −9 % à +16 % selon le N° Chance si on l'ignore) ;
// en EuroDreams, les remboursements « 2 numéros » pèsent 64 % des lots payés.
// On le reconnaît sans le coder : le volume joué ne peut pas dépendre des
// numéros sortis. On cherche donc le poids s qui rend « dotations + s × lots
// fixes » indépendant de la part des lots fixes ; s = 0 quand les enveloppes
// sont séparées (LOTO d'avant 2017).
//
// Non mesurable ainsi : les tirages dont tous les rangs « volume » sont à lot
// fixe (LOTO de mars 2017 à octobre 2019) et les régimes de moins de 20
// tirages → null, et l'appelant se replie sur gagnants ÷ probabilité.
//
// lists : par tirage, en ordre chronologique, ses rangs « volume »
//         [{ key, pr, w, prize }] — key = ère de la table des rangs + rang.
// segOut (facultatif) : reçoit, par tirage mesuré, le numéro de son segment
//         (régime de répartition à constantes communes).
function exactVolumes(lists, segOut) {
  const FIX_RUN = 4;     // ≥ 4 lots identiques d'affilée : lot fixe, pas une répartition
  // Tolérance de la signature : au-dessus de l'arrondi des lots (écart
  // interne mesuré ≤ 1,9 %), en dessous du plus petit changement de règlement
  // connu (EuroDreams 2025 : 5,4 % au plus près ; EM : 16 %)
  const TOL = 0.035;
  const MIN_DRAWS = 20;  // régime plus court : constante trop bruitée
  const SPLIT_T = 6;     // saut de niveau (t de Student) qui coupe un régime
  const MIN_SEG = 30;    // tirages minimum de part et d'autre d'une coupe
  const median = a => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const correlation = (a, b) => {
    let ma = 0, mb = 0;
    for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
    ma /= a.length; mb /= a.length;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) {
      sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2;
    }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  };

  // 1. Lots fixes : une série de lots identiques ne mesure pas les mises
  const fixed = new Set();
  const byKey = new Map();
  for (const list of lists) {
    for (const c of list) {
      if (!(c.prize > 0)) continue;
      if (!byKey.has(c.key)) byKey.set(c.key, []);
      byKey.get(c.key).push(c);
    }
  }
  for (const seq of byKey.values()) {
    for (let s = 0, i = 1; i <= seq.length; i++) {
      if (i < seq.length && seq[i].prize === seq[s].prize) continue;
      if (i - s >= FIX_RUN) for (let j = s; j < i; j++) fixed.add(seq[j]);
      s = i;
    }
  }
  const usable = lists.map(list => list.filter(c => c.prize > 0 && !fixed.has(c)));

  // 2. Régimes : tirages dont les log-dotations coïncident à un décalage
  //    commun près — ce décalage, c'est le volume. Chaque tirage rejoint le
  //    régime dont la signature moyenne lui ressemble le plus, ou en ouvre un.
  const regimes = [];
  usable.forEach((use, t) => {
    if (use.length < 2) return;
    const logPool = use.map(c => Math.log(c.prize * c.w));
    let home = null, off = 0, best = TOL;
    for (const R of regimes) {
      const diffs = [];
      use.forEach((c, i) => {
        if (R.n.has(c.key)) diffs.push(logPool[i] - R.sum.get(c.key) / R.n.get(c.key));
      });
      if (diffs.length < 2) continue;
      const m = median(diffs);
      const dev = Math.max(...diffs.map(x => Math.abs(x - m)));
      if (dev <= best) { home = R; off = m; best = dev; }
    }
    if (!home) {
      home = { sum: new Map(), n: new Map(), pr: new Map(), draws: [] };
      regimes.push(home);
    }
    use.forEach((c, i) => {
      home.sum.set(c.key, (home.sum.get(c.key) || 0) + logPool[i] - off);
      home.n.set(c.key, (home.n.get(c.key) || 0) + 1);
      home.pr.set(c.key, c.pr);
    });
    home.draws.push(t);
  });

  // 3. Une revalorisation uniforme des dotations (prix de la grille…) garde
  //    leurs rapports : la signature ne la voit pas. On la cherche comme un
  //    saut de niveau de log(p × lot) sur le rang le plus probable, le moins
  //    bruité. Aucun dans l'historique (t ≤ 3,6) ; il faut une quarantaine de
  //    tirages pour qu'un saut de 10 % passe le seuil.
  const splitLevel = (draws, key) => {
    const N = draws.length;
    if (N < 2 * MIN_SEG) return [draws];
    const cnt = new Float64Array(N + 1), s1 = new Float64Array(N + 1), s2 = new Float64Array(N + 1);
    draws.forEach((t, i) => {
      const c = usable[t].find(x => x.key === key);
      const y = c ? Math.log(c.pr * c.prize) : 0;
      cnt[i + 1] = cnt[i] + (c ? 1 : 0);
      s1[i + 1] = s1[i] + y;
      s2[i + 1] = s2[i] + y * y;
    });
    let cutAt = 0, tMax = 0;
    for (let cut = MIN_SEG; cut <= N - MIN_SEG; cut++) {
      const n1 = cnt[cut], n2 = cnt[N] - n1;
      if (n1 < MIN_SEG || n2 < MIN_SEG) continue;
      const m1 = s1[cut] / n1, m2 = (s1[N] - s1[cut]) / n2;
      const ss = (s2[cut] - n1 * m1 * m1) + (s2[N] - s2[cut] - n2 * m2 * m2);
      const tv = Math.abs(m2 - m1) / Math.sqrt(ss / (n1 + n2 - 2) * (1 / n1 + 1 / n2));
      if (tv > tMax) { tMax = tv; cutAt = cut; }
    }
    if (tMax < SPLIT_T) return [draws];
    return splitLevel(draws.slice(0, cutAt), key).concat(splitLevel(draws.slice(cutAt), key));
  };

  // 5. (défini ici, appliqué par segment) Lots fixes prélevés sur l'enveloppe
  //    des rangs en répartition. ts : tirages du segment ; a : leur volume
  //    d'après les seules dotations en répartition. Renvoie les volumes
  //    corrigés, ou null si les enveloppes sont séparées (ou sans lot fixe).
  const sharedEnvelope = (ts, a) => {
    const f = ts.map(t => {
      let sum = 0;
      for (const c of lists[t]) if (fixed.has(c)) sum += c.prize * c.w;
      return sum;
    });
    if (ts.length < 2 * MIN_SEG || f.filter(v => v > 0).length < 0.9 * ts.length) return null;
    // Comparer chaque tirage à celui de la semaine d'avant (même jour) retire
    // l'essentiel des variations du volume : le décalage est celui qui rend
    // les volumes les plus proches
    let lag = 1, least = Infinity;
    for (let l = 1; l <= 7; l++) {
      let sum = 0, n = 0;
      for (let i = l; i < a.length; i++) { const d = Math.log(a[i] / a[i - l]); sum += d * d; n++; }
      if (n && sum / n < least) { least = sum / n; lag = l; }
    }
    const idx = [];
    for (let i = lag; i < ts.length; i++) if (f[i] > 0 && f[i - lag] > 0) idx.push(i);
    if (idx.length < MIN_SEG) return null;
    // Part des lots fixes (sans le volume, qui se simplifie) et sa variation
    const dShare = idx.map(i => Math.log(f[i] / a[i]) - Math.log(f[i - lag] / a[i - lag]));
    const corrAt = s => correlation(
      idx.map(i => Math.log(a[i] + s * f[i]) - Math.log(a[i - lag] + s * f[i - lag])), dShare);
    // Enveloppes séparées : les dotations ne réagissent pas aux lots fixes
    if (corrAt(0) > -3 / Math.sqrt(idx.length)) return null;
    let lo = 0, hi = 50 * median(a) / median(f.filter(v => v > 0));
    if (corrAt(hi) <= 0) return null;
    for (let it = 0; it < 50; it++) {
      const mid = (lo + hi) / 2;
      if (corrAt(mid) < 0) lo = mid; else hi = mid;
    }
    const s = (lo + hi) / 2;
    // Échelle : même identité, E[gagnants / (V × p)] = 1, sur le rang en
    // répartition le plus probable de chaque tirage
    let ratio = 0;
    const u = ts.map((t, i) => a[i] + s * f[i]);
    ts.forEach((t, i) => {
      let top = null;
      for (const c of usable[t]) if (top === null || c.pr > top.pr) top = c;
      ratio += (top.w / top.pr) / u[i];
    });
    ratio /= ts.length;
    return u.map(v => v * ratio);
  };

  // 4. Constante de chaque rang (moyenne harmonique de p × lot), puis volume
  //    du tirage = médiane des estimations de ses rangs
  const out = new Array(lists.length).fill(null);
  let segId = 0;
  for (const R of regimes) {
    let ref = null;
    for (const [key, pr] of R.pr) {
      if (R.n.get(key) >= 0.9 * R.draws.length && (ref === null || pr > R.pr.get(ref))) ref = key;
    }
    const segments = ref === null ? [R.draws] : splitLevel(R.draws, ref);
    for (const seg of segments) {
      if (seg.length < MIN_DRAWS) continue;
      const inv = new Map(), n = new Map();
      for (const t of seg) {
        for (const c of usable[t]) {
          inv.set(c.key, (inv.get(c.key) || 0) + 1 / (c.pr * c.prize));
          n.set(c.key, (n.get(c.key) || 0) + 1);
        }
      }
      const ts = [], a = [];
      for (const t of seg) {
        const ests = [];
        for (const c of usable[t]) {
          if (n.get(c.key) >= MIN_DRAWS) ests.push(c.prize * c.w * inv.get(c.key) / n.get(c.key));
        }
        if (ests.length) { ts.push(t); a.push(median(ests)); }
      }
      const corrected = sharedEnvelope(ts, a);
      ts.forEach((t, i) => {
        out[t] = corrected ? corrected[i] : a[i];
        if (segOut) segOut[t] = segId;
      });
      segId++;
    }
  }
  return out;
}

// --- probabilités des rangs --------------------------------------------

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return Math.round(r);
}

// Nombre d'étoiles en jeu à la date du tirage (EuroMillions)
function emStarMax(draw) {
  return draw.date >= STAR_12_ERA_START ? 12 : draw.date >= EM_13_RANKS_START ? 11 : 9;
}

// p(rang) par ère, en inversant les MÊMES tables et fonctions que
// resolveRank — cohérence garantie avec le reste de l'app. Mémoïsé par ère.
// La fonction renvoyée donne, pour un tirage :
//   p      : { rang → probabilité }
//   label  : { rang → étiquette lisible, valable pour l'ère du tirage }
//   era    : clé de l'ère de la table des rangs
//   combos : { rang → [[numéros, étoiles ou bonus], …] } (null : remboursement cumulable)
//   levels : { m → rangs dont la somme des gagnants compte les grilles ayant
//              EXACTEMENT m bons numéros, étoiles / N° Chance confondus } —
//            seulement quand tous les cas sont des rangs payés (en EM : 2 à 5
//            numéros depuis mai 2011 ; avant, le « 2+0 » ne gagnait rien)
function makeRankProbs(game, cfg) {
  const ballCount = cfg.ballCount || 5;
  const ballMax = cfg.ballMax || 50;
  const pB = mn => binom(ballCount, mn) * binom(ballMax - ballCount, ballCount - mn) / binom(ballMax, ballCount);
  const cache = {};
  return draw => {
    let eraKey;
    if (game === 'euromillions') eraKey = 'em' + emStarMax(draw);
    else if (game === 'loto') eraKey = (draw.prizes && draw.prizes.length <= 6) ? 'lotoOld' : 'lotoNew';
    else eraKey = 'ed';
    if (cache[eraKey]) return cache[eraKey];

    const out = {};
    const combosByRank = {};
    const starMax = game === 'euromillions' ? emStarMax(draw) : 0;
    const bonusLevels = game === 'euromillions' ? 3 : 2; // 0-1-2 étoiles, ou N° Chance/Dream raté-trouvé
    const addCombo = (rank, mn, ms) => {
      if (!rank) return;
      let p = pB(mn);
      if (game === 'euromillions') p *= binom(2, ms) * binom(starMax - 2, 2 - ms) / binom(starMax, 2);
      else if (game === 'loto') p *= (ms === 1 ? 1 : 9) / (cfg.bonusMax || 10);
      else p *= (ms === 1 ? 1 : 4) / (cfg.bonusMax || 5);
      out[rank] = (out[rank] || 0) + p;
      (combosByRank[rank] = combosByRank[rank] || []).push([mn, ms]);
    };
    if (game === 'euromillions') {
      const table = starMax === 12 ? RANK_TABLE_EM : starMax === 11 ? RANK_TABLE_EM_11 : RANK_TABLE_EM_9;
      for (const key of Object.keys(table)) {
        const parts = key.split('+');
        addCombo(table[key], parseInt(parts[0], 10), parseInt(parts[1], 10));
      }
    } else if (eraKey === 'lotoNew') {
      for (const key of Object.keys(RANK_TABLE_LOTO)) {
        const parts = key.split('+');
        addCombo(RANK_TABLE_LOTO[key], parseInt(parts[0], 10), parseInt(parts[1], 10));
      }
    } else if (eraKey === 'lotoOld') {
      for (let mn = 0; mn <= 5; mn++) for (let ms = 0; ms <= 1; ms++) addCombo(oldLotoRank(mn, ms), mn, ms);
      // Rang 6 = remboursement du N° Chance, CUMULABLE avec un rang de boules
      // (prouvé sur les données) : ses gagnants = tous les détenteurs → p = 1/10.
      out[6] = 0.1;
      combosByRank[6] = null;
    }
    else {
      for (let mn = 0; mn <= 6; mn++) for (let ms = 0; ms <= 1; ms++) addCombo(edRank(mn, ms), mn, ms);
    }
    // Étiquette lisible par rang, valable pour L'ÈRE du tirage (les rangs ont
    // changé de sens : « rang 4 » = 4+2 en EM mais « 3 numéros » au vieux LOTO)
    const labels = {};
    for (const rank of Object.keys(out)) {
      const cs = combosByRank[rank];
      if (!cs) { labels[rank] = 'N° Chance'; continue; }
      if (cs.length === 1) labels[rank] = cs[0][0] + '+' + cs[0][1];
      else labels[rank] = cs[0][0] + ' num.';
    }
    // Niveaux complets : tous les (m, étoiles/bonus) sont payés, par des rangs
    // qui ne mélangent pas plusieurs nombres de bons numéros
    const levels = {};
    for (let m = 0; m <= ballCount; m++) {
      const ranks = [];
      let covered = 0, clean = true;
      for (const rank of Object.keys(combosByRank)) {
        const cs = combosByRank[rank];
        if (!cs || !cs.some(c => c[0] === m)) continue;
        if (cs.some(c => c[0] !== m)) { clean = false; break; }
        ranks.push(parseInt(rank, 10));
        covered += cs.length;
      }
      if (clean && covered === bonusLevels) levels[m] = ranks;
    }
    cache[eraKey] = { p: out, label: labels, era: eraKey, levels, combos: combosByRank };
    return cache[eraKey];
  };
}

// Rangs « volume » d'un tirage : forte probabilité, gros effectifs. Ce sont
// eux qui mesurent le volume joué (cf. exactVolumes).
const VOLUME_MIN_P = 4e-4;
function volumeRanks(draw, probs) {
  const vol = [];
  for (const p of draw.prizes) {
    const pr = probs.p[p.rank];
    const w = p.winners !== undefined ? p.winners : p.winnersEu;
    if (pr >= VOLUME_MIN_P && w > 30) {
      vol.push({ key: probs.era + ':' + p.rank, pr, w, prize: p.prize || 0, wFr: p.winnersFr || 0 });
    }
  }
  return vol;
}

// --- niveaux de popularité d'un tirage ---------------------------------
// Avec le volume exact V, les compteurs de gagnants donnent, pour chaque
// tirage, le nombre W_m de grilles jouées ayant exactement m bons numéros.
// W_m / (V × p_m) vaut 1 si les joueurs choisissaient au hasard : c'est le
// facteur de popularité des numéros sortis, lu à 2, 3, 4 et 5 numéros — la
// matière première du modèle de popularité (scripts/fit-popularity.js).
// Renvoie, par tirage et en ordre chronologique :
//   { draw, probs, vol, v (volume, exact ou null), W: { m → gagnants } }
// segOut (facultatif) : cf. exactVolumes.
function drawLevels(game, cfg, draws, segOut) {
  const probsFor = makeRankProbs(game, cfg);
  const rows = draws
    .filter(d => d.prizes && d.prizes.length)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => {
      const probs = probsFor(d);
      const W = {};
      for (const m of Object.keys(probs.levels)) {
        let s = 0, ok = true;
        for (const rank of probs.levels[m]) {
          const p = d.prizes.find(x => x.rank === rank);
          if (!p) { ok = false; break; }
          s += p.winners !== undefined ? p.winners : p.winnersEu;
        }
        if (ok) W[m] = s;
      }
      return { draw: d, probs, vol: volumeRanks(d, probs), W };
    });
  const v = exactVolumes(rows.map(r => r.vol), segOut);
  rows.forEach((r, i) => { r.v = v[i]; });
  return rows;
}

// --- modèle « Flash + joueurs manuels » --------------------------------
// Les grilles jouées sont un mélange : une part π tirée uniformément (les
// Flash) et une part 1−π de joueurs « manuels » dont la grille de numéros c
// suit q(c) ∝ exp(Σ θ_i + structures). Une grille de numéros a donc
//     π + (1−π) × G(c)      fois les co-joueurs d'une grille moyenne,
// avec G(c) = q(c) × C(N, k). Les paramètres (π, θ, structures, constante de
// normalisation) sont ajustés hors ligne par scripts/fit-popularity.js sur
// les niveaux de popularité à 2, 3, 4 et 5 numéros, et lus dans
// data/popularity.json : l'app ne fait qu'évaluer.

// Poids de paire du modèle manuel : la somme, pour chaque paire (i < j), des
// structures par paire de STRUCT_FEATURES (tout sauf gridAlign). gamma suit
// l'ordre de STRUCT_FEATURES. Tableau (N+1)×(N+1) symétrique, indice
// i × (N+1) + j : l'ordre des numéros d'une grille n'a pas d'importance.
function pairWeights(N, width, gamma) {
  const B = N + 1;
  const PW = new Float64Array(B * B);
  for (let i = 1; i <= N; i++) {
    for (let j = i + 1; j <= N; j++) {
      let v = 0;
      if (j <= 31) v += gamma[0];
      if (j <= 12) v += gamma[1];
      if (j - i === 1) v += gamma[2];
      if (Math.floor((i - 1) / width) === Math.floor((j - 1) / width)) v += gamma[3];
      if ((i - 1) % width === (j - 1) % width) v += gamma[4];
      if (i % 7 === 0 && j % 7 === 0) v += gamma[6];
      PW[i * B + j] = v;
      PW[j * B + i] = v;
    }
  }
  return PW;
}

// Met en forme les paramètres d'un jeu (data/popularity.json) pour
// l'évaluation : theta indexé de 1 à N, poids de paire précalculés.
function preparePopModel(g) {
  const N = g.ballMax;
  const theta = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) theta[i] = g.theta[i - 1];
  const gamma = STRUCT_FEATURES.map(ft => g.gamma[ft.key] || 0);
  return {
    N, K: g.ballCount, width: g.width, pi: g.pi,
    theta, gamma, PW: pairWeights(N, g.width, gamma), gAlign: gamma[5],
    // log G(c) = poids(c) − logZ + log C(N, k)
    logNorm: Math.log(binom(N, g.ballCount)) - g.logZ,
  };
}

// log du poids non normalisé d'une grille de numéros chez les joueurs
// manuels — DOIT rester identique à ce que calcule la passe d'énumération de
// scripts/fit-popularity.js (qui se contrôle contre elle à chaque ajustement).
const _alignCols = new Int8Array(16), _alignRows = new Int8Array(16); // compteurs réutilisés (appelée des millions de fois)
function manualLogWeight(balls, m) {
  const B = m.N + 1;
  const K = balls.length;
  let s = 0;
  for (let i = 0; i < K; i++) {
    s += m.theta[balls[i]];
    for (let j = i + 1; j < K; j++) s += m.PW[balls[i] * B + balls[j]];
  }
  if (m.gAlign !== 0) {
    _alignCols.fill(0);
    _alignRows.fill(0);
    let align = false;
    for (let i = 0; i < K; i++) {
      if (++_alignCols[(balls[i] - 1) % m.width] >= 3) align = true;
      if (++_alignRows[Math.floor((balls[i] - 1) / m.width)] >= 3) align = true;
    }
    if (align) s += m.gAlign;
  }
  return s;
}

// log G(c) : log du facteur de co-joueurs MANUELS d'une grille de numéros
function manualBallLog(balls, m) {
  return manualLogWeight(balls, m) + m.logNorm;
}

// --- marginales du modèle manuel ---------------------------------------
// Une passe sur les C(N, 5) grilles donne la constante de normalisation Z et
// les « marginales » : le poids total des grilles contenant une paire, un
// triplet ou un quadruplet donné. La part des joueurs manuels ayant
// exactement k numéros d'un tirage s'en déduit par inclusion-exclusion, sans
// énumérer les grilles tirage par tirage. Sert à l'ajustement (une passe par
// évaluation du modèle) et, dans l'app, à l'espérance d'une grille.
//
// Tables compactes, indexées dans l'ordre colexicographique : la paire
// (a < b) est au rang C(b−1, 2) + (a−1), etc. — 2 Mo pour 50 numéros.
// La passe est découpable (popTablesRun) pour ne pas figer le navigateur.

function popTablesInit(m) {
  const N = m.N;
  if (m.K !== 5) throw new Error('popTables : grilles de 5 numéros seulement');
  const c1 = new Int32Array(N + 2), c2 = new Int32Array(N + 2), c3 = new Int32Array(N + 2), c4 = new Int32Array(N + 2);
  const row = new Int32Array(N + 2), col = new Int32Array(N + 2);
  for (let x = 1; x <= N; x++) {
    c1[x] = x - 1; c2[x] = binom(x - 1, 2); c3[x] = binom(x - 1, 3); c4[x] = binom(x - 1, 4);
    row[x] = Math.floor((x - 1) / m.width); col[x] = (x - 1) % m.width;
  }
  const pk = [];
  for (let k = 0; k <= 5; k++) pk.push(binom(5, k) * binom(N - 5, 5 - k) / binom(N, 5));
  return {
    m, N, c1, c2, c3, c4, row, col, pk,
    M1: new Float64Array(N + 1),
    M2: new Float64Array(binom(N, 2)), M3: new Float64Array(binom(N, 3)), M4: new Float64Array(binom(N, 4)),
    Z: 0, next: 1, done: false,
  };
}

// Traite les grilles dont le plus petit numéro est ≤ upTo (reprend où la
// passe s'était arrêtée). Le poids de chaque grille est celui de
// manualLogWeight, calculé de proche en proche.
function popTablesRun(t, upTo) {
  const { m, N, c1, c2, c3, c4, row, col, M2, M3, M4 } = t;
  const theta = m.theta, PW = m.PW, gAlign = m.gAlign, B = N + 1;
  const eAlign = Math.exp(gAlign);
  let Z = t.Z;
  const last = Math.min(upTo, N - 4);
  let a = t.next;
  for (; a <= last; a++) {
    const sa = theta[a], aB = a * B;
    for (let b = a + 1; b <= N - 3; b++) {
      const sb = sa + theta[b] + PW[aB + b], bB = b * B;
      const pAB = c2[b] + c1[a];
      for (let c = b + 1; c <= N - 2; c++) {
        const sc = sb + theta[c] + PW[aB + c] + PW[bB + c], cB = c * B;
        const pAC = c2[c] + c1[a], pBC = c2[c] + c1[b], qABC = c3[c] + pAB;
        const f3 = (row[a] === row[c]) || (col[a] === col[b] && col[b] === col[c]);
        for (let d = c + 1; d <= N - 1; d++) {
          const sd = sc + theta[d] + PW[aB + d] + PW[bB + d] + PW[cB + d], dB = d * B;
          const cd = (col[a] === col[d] ? 1 : 0) + (col[b] === col[d] ? 1 : 0) + (col[c] === col[d] ? 1 : 0);
          const f4 = f3 || (row[b] === row[d]) || cd >= 2;
          const pAD = c2[d] + c1[a], pBD = c2[d] + c1[b], pCD = c2[d] + c1[c];
          const qABD = c3[d] + pAB, qACD = c3[d] + pAC, qBCD = c3[d] + pBC;
          let S = 0;
          for (let e = d + 1; e <= N; e++) {
            let q = Math.exp(sd + theta[e] + PW[aB + e] + PW[bB + e] + PW[cB + e] + PW[dB + e]);
            if (gAlign !== 0) {
              const ce = (col[a] === col[e] ? 1 : 0) + (col[b] === col[e] ? 1 : 0) + (col[c] === col[e] ? 1 : 0) + (col[d] === col[e] ? 1 : 0);
              if (f4 || row[c] === row[e] || ce >= 2) q *= eAlign;
            }
            S += q;
            // sous-ensembles contenant e
            const e2 = c2[e], e3 = c3[e], e4 = c4[e];
            M2[e2 + c1[a]] += q; M2[e2 + c1[b]] += q; M2[e2 + c1[c]] += q; M2[e2 + c1[d]] += q;
            M3[e3 + pAB] += q; M3[e3 + pAC] += q; M3[e3 + pAD] += q; M3[e3 + pBC] += q; M3[e3 + pBD] += q; M3[e3 + pCD] += q;
            M4[e4 + qABC] += q; M4[e4 + qABD] += q; M4[e4 + qACD] += q; M4[e4 + qBCD] += q;
          }
          Z += S;
          // sous-ensembles de {a, b, c, d} : communs à tous les e
          M4[c4[d] + qABC] += S;
          M3[qABC] += S; M3[qABD] += S; M3[qACD] += S; M3[qBCD] += S;
          M2[pAB] += S; M2[pAC] += S; M2[pAD] += S; M2[pBC] += S; M2[pBD] += S; M2[pCD] += S;
        }
      }
    }
  }
  t.Z = Z;
  t.next = a;
  if (a > N - 4 && !t.done) {
    // poids des grilles contenant chaque numéro : 4 paires par grille le contiennent
    for (let i = 1; i <= N; i++) {
      let s = 0;
      for (let j = 1; j <= N; j++) if (j !== i) s += i < j ? M2[c2[j] + c1[i]] : M2[c2[i] + c1[j]];
      t.M1[i] = s / 4;
    }
    t.done = true;
  }
  return t.done;
}

function popTables(m) {
  const t = popTablesInit(m);
  popTablesRun(t, m.N);
  return t;
}

// G_k(D) pour k = 1..5 : part des grilles manuelles ayant exactement k numéros
// du tirage D (numéros triés), rapportée à celle d'un joueur au hasard.
// Résultat dans out[k].
function levelFactors(t, balls, out) {
  const { c1, c2, c3, c4, M1, M2, M3, M4 } = t;
  let T1 = 0, T2 = 0, T3 = 0, T4 = 0;
  for (let i = 0; i < 5; i++) {
    T1 += M1[balls[i]];
    for (let j = i + 1; j < 5; j++) {
      const p = c2[balls[j]] + c1[balls[i]];
      T2 += M2[p];
      for (let k = j + 1; k < 5; k++) {
        const q = c3[balls[k]] + p;
        T3 += M3[q];
        for (let l = k + 1; l < 5; l++) T4 += M4[c4[balls[l]] + q];
      }
    }
  }
  const T5 = Math.exp(manualLogWeight(balls, t.m));
  const Z = t.Z, pk = t.pk;
  out[5] = T5 / Z / pk[5];
  out[4] = (T4 - 5 * T5) / Z / pk[4];
  out[3] = (T3 - 4 * T4 + 10 * T5) / Z / pk[3];
  out[2] = (T2 - 3 * T3 + 6 * T4 - 10 * T5) / Z / pk[2];
  out[1] = (T1 - 2 * T2 + 3 * T3 - 4 * T4 + 5 * T5) / Z / pk[1];
  return out;
}

// --- espérance d'une grille --------------------------------------------
// Ce que rapporte une grille ne dépend pas que de ses chances : à chaque rang
// en répartition, le lot est la dotation divisée par le nombre de gagnants —
// et ce nombre dépend de ce que jouent les autres. Si la grille gagne au rang
// « m numéros + s étoiles », le tirage contient m de ses numéros : on moyenne
// donc 1 / (gagnants) sur les tirages compatibles, avec le modèle
//     gagnants = V × p × [π + (1−π) × G_m(tirage) × Q_s(étoiles tirées)].
// La grille elle-même s'ajoute aux gagnants : avec K autres gagnants, K suivant
// une loi de Poisson de moyenne λ, E[1 / (1 + K)] = (1 − e^−λ) / λ — ce qui
// vaut aussi bien pour le jackpot (λ petit) que pour les petits rangs.

// Générateur déterministe : une grille donnée a toujours la même estimation
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Facteurs des étoiles / du N° Chance chez les joueurs manuels, par nombre
// d'étoiles trouvées. manual : { clé → facteur manuel } (table mesurée,
// ramenée à la part des joueurs manuels) ; kind : 'starPairs' ou 'chance'.
// Renvoie levels(mine, s) → les facteurs Q_s de chaque tirage d'étoiles (ou
// de N° Chance) qui donne exactement s bonnes étoiles à `mine`, et all(s) →
// ceux de tous les tirages possibles (grille au hasard).
function bonusLevels(kind, manual) {
  const keys = Object.keys(manual);
  let total = 0;
  for (const k of keys) total += manual[k];
  if (kind === 'chance') {
    const n = keys.length;
    const share = {}; // part des grilles manuelles portant ce N° Chance
    for (const k of keys) share[k] = manual[k] / total;
    const q = (c, s) => (s === 1 ? share[c] * n : (1 - share[c]) * n / (n - 1));
    return {
      top: 1,
      levels: (mine, s) => keys.filter(c => (c === String(mine)) === (s === 1)).map(c => q(c, s)),
      all: s => keys.map(c => q(c, s)),
    };
  }
  // paires d'étoiles « a-b »
  const pair = {}, marg = {};
  let stars = 0;
  for (const k of keys) {
    pair[k] = manual[k] / total;
    const [a, b] = k.split('-').map(Number);
    marg[a] = (marg[a] || 0) + pair[k];
    marg[b] = (marg[b] || 0) + pair[k];
    stars = Math.max(stars, a, b);
  }
  const nPairs = keys.length, p2 = 1 / nPairs, p1 = 2 * (stars - 2) / nPairs, p0 = 1 - p1 - p2;
  const q = (k, s) => {
    const [a, b] = k.split('-').map(Number);
    if (s === 2) return pair[k] / p2;
    if (s === 1) return (marg[a] + marg[b] - 2 * pair[k]) / p1;
    return (1 - marg[a] - marg[b] + pair[k]) / p0;
  };
  const hits = (k, mine) => { const [a, b] = k.split('-').map(Number); return (mine.includes(a) ? 1 : 0) + (mine.includes(b) ? 1 : 0); };
  return {
    top: 2,
    levels: (mine, s) => keys.filter(k => hits(k, mine) === s).map(k => q(k, s)),
    all: s => keys.map(k => q(k, s)),
  };
}

// Espérance d'une grille, rang par rang.
//   t      : marginales du modèle manuel (popTables), pi : part de Flash
//   bonus  : bonusLevels(...) ou null (pas de table d'étoiles / N° Chance)
//   ranks  : rangs en répartition [{ rank, m, s, p, pool }] — pool en euros de
//            dotation par grille jouée
//   V      : volume attendu ; jackpot : { p, m, s, amount } ou null
//   balls, mine : la grille (numéros triés, étoiles ou N° Chance) — ou
//            balls = null pour une grille tirée au hasard (la référence)
// Renvoie { ranks: [{ rank, m, s, ev }], evRanks, jackpot: { factor, pShare,
// kept, ev } }.
function gridValue({ t, pi, bonus, ranks, V, jackpot }, balls, mine) {
  const N = t.N, SAMPLE = 1500; // tirages par niveau : moyenne à ±0,2 % près, soit moins d'un dixième de centime
  const rnd = seededRandom(balls ? balls.reduce((h, x) => h * 53 + x, 7) : 12345);
  const g = [0, 0, 0, 0, 0, 0];
  // G_m des tirages compatibles avec « m numéros de la grille » (tous s'ils
  // sont peu nombreux, un échantillon sinon) ; grille au hasard : tirages
  // uniformes, tous niveaux à la fois
  const byLevel = {};
  const levelsFor = m => {
    if (byLevel[m]) return byLevel[m];
    const out = [];
    if (!balls) {
      if (!byLevel.any) {
        byLevel.any = [];
        for (let i = 0; i < SAMPLE; i++) {
          const set = new Set();
          while (set.size < 5) set.add(1 + Math.floor(rnd() * N));
          levelFactors(t, [...set].sort((x, y) => x - y), g);
          byLevel.any.push(g.slice());
        }
      }
      for (const v of byLevel.any) out.push(v[m]);
    } else if (m === 5) {
      levelFactors(t, balls, g);
      out.push(g[5]);
    } else {
      const inGrid = new Uint8Array(N + 1);
      for (const x of balls) inGrid[x] = 1;
      const others = [];
      for (let x = 1; x <= N; x++) if (!inGrid[x]) others.push(x);
      const need = 5 - m;
      const count = binom(5, m) * binom(others.length, need);
      const push = (kept, extra) => { levelFactors(t, kept.concat(extra).sort((x, y) => x - y), g); out.push(g[m]); };
      if (count <= SAMPLE) {
        // énumération : tous les sous-ensembles gardés × tous les compléments
        const subsets = (arr, k) => {
          const res = [];
          const rec = (from, cur) => {
            if (cur.length === k) { res.push(cur.slice()); return; }
            for (let i = from; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
          };
          rec(0, []);
          return res;
        };
        const keeps = subsets(balls, m), extras = subsets(others, need);
        for (const kept of keeps) for (const extra of extras) push(kept, extra);
      } else {
        for (let i = 0; i < SAMPLE; i++) {
          const kept = balls.slice();
          while (kept.length > m) kept.splice(Math.floor(rnd() * kept.length), 1);
          const extra = new Set();
          while (extra.size < need) extra.add(others[Math.floor(rnd() * others.length)]);
          push(kept, [...extra]);
        }
      }
    }
    byLevel[m] = out;
    return out;
  };
  const bonusFor = s => {
    if (!bonus) return [1];
    return balls ? bonus.levels(mine, s) : bonus.all(s);
  };
  // E[(1 − e^−λ) / F] sur les tirages compatibles, λ = V × p × F
  const share = (m, s, p) => {
    const gs = levelsFor(m), qs = bonusFor(s);
    let sum = 0;
    for (const gm of gs) {
      for (const q of qs) {
        const F = pi + (1 - pi) * gm * q;
        const lam = V * p * F;
        sum += (lam > 40 ? 1 : lam > 1e-9 ? 1 - Math.exp(-lam) : lam) / F;
      }
    }
    return sum / (gs.length * qs.length);
  };
  const out = { ranks: [], evRanks: 0, jackpot: null };
  for (const r of ranks) {
    const ev = r.pool * share(r.m, r.s, r.p);
    out.ranks.push({ rank: r.rank, m: r.m, s: r.s, ev });
    out.evRanks += ev;
  }
  if (jackpot) {
    // part du jackpot gardée : E[1 / (1 + K)] = (1 − e^−λ) / λ
    const gs = levelsFor(jackpot.m), qs = bonusFor(jackpot.s);
    let kept = 0, pShare = 0, factor = 0;
    for (const gm of gs) {
      for (const q of qs) {
        const F = pi + (1 - pi) * gm * q;
        const lam = V * jackpot.p * F;
        kept += lam > 1e-9 ? (1 - Math.exp(-lam)) / lam : 1;
        pShare += 1 - Math.exp(-lam);
        factor += F;
      }
    }
    const n = gs.length * qs.length;
    out.jackpot = {
      factor: factor / n, pShare: pShare / n, kept: kept / n,
      ev: jackpot.amount ? jackpot.p * jackpot.amount * kept / n : null,
    };
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STAR_12_ERA_START, EM_13_RANKS_START,
    RANK_TABLE_EM, RANK_TABLE_EM_11, RANK_TABLE_EM_9, RANK_TABLE_LOTO,
    oldLotoRank, edRank, resolveRank,
    STRUCT_FEATURES, gridWidthFor, structFeatures,
    exactVolumes, binom, emStarMax, makeRankProbs, VOLUME_MIN_P, volumeRanks, drawLevels,
    pairWeights, preparePopModel, manualLogWeight, manualBallLog,
    popTablesInit, popTablesRun, popTables, levelFactors, seededRandom, bonusLevels, gridValue,
  };
}
