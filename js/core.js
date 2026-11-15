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
    cache[eraKey] = { p: out, label: labels, era: eraKey, levels };
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
function manualLogWeight(balls, m) {
  const B = m.N + 1;
  const K = balls.length;
  let s = 0;
  for (let i = 0; i < K; i++) {
    s += m.theta[balls[i]];
    for (let j = i + 1; j < K; j++) s += m.PW[balls[i] * B + balls[j]];
  }
  if (m.gAlign !== 0) {
    const cols = new Array(m.width).fill(0);
    const rows = new Array(8).fill(0);
    let align = false;
    for (let i = 0; i < K; i++) {
      if (++cols[(balls[i] - 1) % m.width] >= 3) align = true;
      if (++rows[Math.floor((balls[i] - 1) / m.width)] >= 3) align = true;
    }
    if (align) s += m.gAlign;
  }
  return s;
}

// log G(c) : log du facteur de co-joueurs MANUELS d'une grille de numéros
function manualBallLog(balls, m) {
  return manualLogWeight(balls, m) + m.logNorm;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STAR_12_ERA_START, EM_13_RANKS_START,
    RANK_TABLE_EM, RANK_TABLE_EM_11, RANK_TABLE_EM_9, RANK_TABLE_LOTO,
    oldLotoRank, edRank, resolveRank,
    STRUCT_FEATURES, gridWidthFor, structFeatures,
    exactVolumes, binom, emStarMax, makeRankProbs, VOLUME_MIN_P, volumeRanks, drawLevels,
    pairWeights, preparePopModel, manualLogWeight, manualBallLog,
  };
}
