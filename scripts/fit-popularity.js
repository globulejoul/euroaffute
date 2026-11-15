#!/usr/bin/env node
// =====================================================================
// fit-popularity.js — Ajuste le modèle de popularité « Flash + joueurs
// manuels » et écrit ses paramètres dans data/popularity.json, que l'app
// se contente d'évaluer (l'ajustement prend une à trois minutes par jeu :
// trop pour un navigateur).
//
// Le modèle : une part π des grilles est tirée uniformément (les Flash),
// le reste suit q(c) ∝ exp(Σ θ_i + structures). Il est ajusté sur ce que
// les compteurs de gagnants disent des grilles jouées, tirage par tirage :
// le nombre de grilles ayant exactement 2, 3, 4 et 5 bons numéros, rapporté
// au volume exact (js/core.js : drawLevels, exactVolumes).
//
// Usage :  node scripts/fit-popularity.js [options]
//   --validate      refait aussi la validation hors échantillon (70 % / 30 %)
//   --force         réajuste même sans nouveau tirage
//   --cold          repart de zéro au lieu des paramètres déjà publiés
//   --game <nom>    un seul jeu (euromillions | loto)
// Sortie : data/popularity.json
// =====================================================================

const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'popularity.json');
const FORMAT_VERSION = 1;
// EuroDreams (6 numéros, ~300 tirages) n'est pas ajusté : l'app y garde son
// modèle local. Le moteur ci-dessous énumère des grilles de 5 numéros.
const GAMES = ['euromillions', 'loto'];
const NF = core.STRUCT_FEATURES.length;
const LEVELS = [2, 3, 4];   // niveaux ajustés en log (gros effectifs) ; le niveau 5 l'est en Poisson
const PHI5 = 2;             // surdispersion du niveau 5 (motifs de grille entière non modélisés)
const RIDGE = 1e-2;         // fixe la jauge (θ + constante = même modèle) et tempère les rares
const QUANTILES = 1000;

const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const optGame = args.includes('--game') ? args[args.indexOf('--game') + 1] : null;

// --- énumération des grilles et marginales ---------------------------
// Une passe sur les C(N, 5) grilles donne la constante de normalisation Z et
// les « marginales » M_j(S) = Σ des poids des grilles contenant S, pour toute
// paire, tout triplet et tout quadruplet S. La part de grilles manuelles
// ayant exactement m bons numéros d'un tirage s'en déduit par
// inclusion-exclusion — sans énumérer les grilles tirage par tirage.

function makeEngine(N, width) {
  const B = N + 1;
  const M2 = new Float64Array(B * B);
  const M3 = new Float64Array(B * B * B);
  const M4 = new Float64Array(B * B * B * B);
  const row = new Int32Array(B), col = new Int32Array(B);
  for (let x = 1; x <= N; x++) { row[x] = Math.floor((x - 1) / width); col[x] = (x - 1) % width; }
  let Z = 0;

  // Même poids que core.manualLogWeight, calculé de proche en proche
  function pass(m) {
    const theta = m.theta, PW = m.PW, gAlign = m.gAlign;
    const eAlign = Math.exp(gAlign);
    M2.fill(0); M3.fill(0); M4.fill(0);
    Z = 0;
    for (let a = 1; a <= N - 4; a++) {
      const sa = theta[a], aB = a * B;
      for (let b = a + 1; b <= N - 3; b++) {
        const sb = sa + theta[b] + PW[aB + b], bB = b * B, abB = (aB + b) * B;
        for (let c = b + 1; c <= N - 2; c++) {
          const sc = sb + theta[c] + PW[aB + c] + PW[bB + c], cB = c * B;
          const abcB = (abB + c) * B, acB = (aB + c) * B, bcB = (bB + c) * B;
          const f3 = (row[a] === row[c]) || (col[a] === col[b] && col[b] === col[c]);
          for (let d = c + 1; d <= N - 1; d++) {
            const sd = sc + theta[d] + PW[aB + d] + PW[bB + d] + PW[cB + d], dB = d * B;
            const cd = (col[a] === col[d] ? 1 : 0) + (col[b] === col[d] ? 1 : 0) + (col[c] === col[d] ? 1 : 0);
            const f4 = f3 || (row[b] === row[d]) || cd >= 2;
            const abdB = (abB + d) * B, acdB = (acB + d) * B, bcdB = (bcB + d) * B;
            const adB = (aB + d) * B, bdB = (bB + d) * B, cdB = (cB + d) * B;
            let S = 0;
            for (let e = d + 1; e <= N; e++) {
              let q = Math.exp(sd + theta[e] + PW[aB + e] + PW[bB + e] + PW[cB + e] + PW[dB + e]);
              if (gAlign !== 0) {
                const ce = (col[a] === col[e] ? 1 : 0) + (col[b] === col[e] ? 1 : 0) + (col[c] === col[e] ? 1 : 0) + (col[d] === col[e] ? 1 : 0);
                if (f4 || row[c] === row[e] || ce >= 2) q *= eAlign;
              }
              S += q;
              // sous-ensembles contenant e
              M2[aB + e] += q; M2[bB + e] += q; M2[cB + e] += q; M2[dB + e] += q;
              M3[abB + e] += q; M3[acB + e] += q; M3[adB + e] += q; M3[bcB + e] += q; M3[bdB + e] += q; M3[cdB + e] += q;
              M4[abcB + e] += q; M4[abdB + e] += q; M4[acdB + e] += q; M4[bcdB + e] += q;
            }
            Z += S;
            // sous-ensembles de {a, b, c, d} : communs à tous les e
            M4[abcB + d] += S;
            M3[abB + c] += S; M3[abB + d] += S; M3[acB + d] += S; M3[bcB + d] += S;
            M2[aB + b] += S; M2[aB + c] += S; M2[aB + d] += S; M2[bB + c] += S; M2[bB + d] += S; M2[cB + d] += S;
          }
        }
      }
    }
    return Z;
  }

  // G_m(D), m = 2..5 : part des grilles manuelles ayant exactement m numéros
  // du tirage D, rapportée à la part p_m d'un joueur au hasard
  function levels(balls, m, pm, out, o) {
    let T2 = 0, T3 = 0, T4 = 0;
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const ij = balls[i] * B + balls[j];
      T2 += M2[ij];
      for (let k = j + 1; k < 5; k++) {
        const ijk = ij * B + balls[k];
        T3 += M3[ijk];
        for (let l = k + 1; l < 5; l++) T4 += M4[ijk * B + balls[l]];
      }
    }
    const T5 = Math.exp(core.manualLogWeight(balls, m));
    out[o] = (T2 - 3 * T3 + 6 * T4 - 10 * T5) / Z / pm[2];
    out[o + 1] = (T3 - 4 * T4 + 10 * T5) / Z / pm[3];
    out[o + 2] = (T4 - 5 * T5) / Z / pm[4];
    out[o + 3] = T5 / Z / pm[5];
  }

  // Part des grilles manuelles contenant chaque numéro, rapportée à k/N
  function singles() {
    const out = new Array(N + 1).fill(0);
    for (let i = 1; i <= N; i++) {
      let s = 0;
      for (let j = 1; j <= N; j++) if (j !== i) s += M2[Math.min(i, j) * B + Math.max(i, j)];
      out[i] = (s / 4) / Z / (5 / N);
    }
    return out;
  }

  return { pass, levels, singles, get Z() { return Z; } };
}

// --- modèle à partir du vecteur de paramètres --------------------------
// u = [θ_1..θ_N, γ (structures, ordre de STRUCT_FEATURES), logit π, une
// constante par segment de volume]. Les constantes absorbent l'erreur commune
// de la calibration du volume dans chaque régime (0,3 à 2 %).

function modelFrom(u, N, width) {
  const theta = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) theta[i] = u[i - 1];
  const gamma = Array.from(u.slice(N, N + NF));
  return { N, K: 5, width, theta, gamma, PW: core.pairWeights(N, width, gamma), gAlign: gamma[5] };
}

// --- ajustement (Levenberg-Marquardt, jacobien numérique) --------------

function fit(rows, nSeg, N, width, pm, init, opts = {}) {
  const eng = opts.eng;
  const iPi = N + NF, iC = iPi + 1, P = iC + nSeg;
  const u = new Float64Array(P);
  if (init) u.set(init.subarray(0, Math.min(P, init.length)));
  let sig = opts.sig || [0.03, 0.045, 0.08];
  const n = rows.length;
  const NR = LEVELS.length + 1;

  const evalG = uu => {
    const m = modelFrom(uu, N, width);
    eng.pass(m);
    const G = new Float64Array(n * 4);
    for (let t = 0; t < n; t++) eng.levels(rows[t].balls, m, pm, G, 4 * t);
    return G;
  };
  const resid = (uu, G) => {
    const pi = 1 / (1 + Math.exp(-uu[iPi]));
    const r = new Float64Array(n * NR);
    for (let t = 0; t < n; t++) {
      const c = uu[iC + rows[t].seg];
      for (let k = 0; k < LEVELS.length; k++) {
        const F = pi + (1 - pi) * G[4 * t + LEVELS[k] - 2];
        r[NR * t + k] = (rows[t].a[LEVELS[k]] - c - Math.log(F)) / sig[k];
      }
      const mu = rows[t].off5 * Math.exp(c) * (pi + (1 - pi) * G[4 * t + 3]);
      const y = rows[t].w5;
      const dev = 2 * ((y > 0 ? y * Math.log(y / mu) : 0) - (y - mu));
      r[NR * t + LEVELS.length] = Math.sign(y - mu) * Math.sqrt(Math.max(0, dev) / PHI5);
    }
    return r;
  };
  const sumSq = r => { let s = 0; for (let i = 0; i < r.length; i++) s += r[i] * r[i]; return s; };
  const penalty = uu => { let s = 0; for (let i = 0; i < iPi; i++) s += RIDGE * uu[i] * uu[i]; return s; };

  let G, r, f, iters = 0, stats = null;
  const rounds = opts.rounds || 2;
  for (let round = 0; round < rounds; round++) {
    G = evalG(u); r = resid(u, G); f = sumSq(r) + penalty(u);
    let lambda = 1e-2;
    const h = 1e-4;
    for (let it = 0; it < (opts.maxIter || 16); it++) {
      iters++;
      const J = new Array(P);
      for (let j = 0; j < P; j++) {
        const up = Float64Array.from(u);
        up[j] += h;
        const rp = resid(up, j < iPi ? evalG(up) : G);
        const colJ = new Float64Array(rp.length);
        for (let i = 0; i < rp.length; i++) colJ[i] = (rp[i] - r[i]) / h;
        J[j] = colJ;
      }
      const A0 = [], g0 = new Float64Array(P);
      for (let a = 0; a < P; a++) {
        A0.push(new Float64Array(P));
        for (let b = 0; b <= a; b++) {
          let s = 0;
          for (let i = 0; i < J[a].length; i++) s += J[a][i] * J[b][i];
          A0[a][b] = s;
        }
        let s = 0;
        for (let i = 0; i < J[a].length; i++) s += J[a][i] * r[i];
        g0[a] = s;
        if (a < iPi) { A0[a][a] += RIDGE; g0[a] += RIDGE * u[a]; }
      }
      for (let a = 0; a < P; a++) for (let b = a + 1; b < P; b++) A0[a][b] = A0[b][a];
      let improved = false, rel = 0;
      for (let tries = 0; tries < 8 && !improved; tries++) {
        const A = A0.map((rw, a) => { const x = new Float64Array(P + 1); x.set(rw); x[a] += lambda * (rw[a] + 1e-9); x[P] = -g0[a]; return x; });
        for (let i = 0; i < P; i++) {
          let piv = i;
          for (let k = i + 1; k < P; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
          [A[i], A[piv]] = [A[piv], A[i]];
          for (let k = 0; k < P; k++) {
            if (k === i) continue;
            const mm = A[k][i] / A[i][i];
            if (mm) for (let c = i; c <= P; c++) A[k][c] -= mm * A[i][c];
          }
        }
        const un = Float64Array.from(u);
        for (let a = 0; a < P; a++) un[a] += A[a][P] / A[a][a];
        const Gn = evalG(un), rn = resid(un, Gn), fn = sumSq(rn) + penalty(un);
        if (isFinite(fn) && fn < f) {
          rel = (f - fn) / f;
          u.set(un); G = Gn; r = rn; f = fn;
          lambda = Math.max(lambda / 3, 1e-7);
          improved = true;
        } else lambda *= 4;
      }
      if (!improved || rel < 1e-6) break;
    }
    // écarts-types résiduels par niveau : poids de la manche suivante
    const rs = new Array(NR).fill(0);
    for (let t = 0; t < n; t++) for (let k = 0; k < NR; k++) rs[k] += r[NR * t + k] ** 2;
    const resSd = LEVELS.map((_, k) => Math.max(0.005, Math.sqrt(rs[k] / n) * sig[k]));
    stats = { resSd, disp5: rs[LEVELS.length] / n * PHI5, iters };
    sig = resSd;
  }
  return { u, pi: 1 / (1 + Math.exp(-u[iPi])), stats, G, idx: { iPi, iC, P } };
}

// Prédictions du modèle sur des tirages (éventuellement hors échantillon)
function predict(fitted, rows, N, width, pm, eng) {
  const { u, pi, idx } = fitted;
  const m = modelFrom(u, N, width);
  eng.pass(m);
  const G = new Float64Array(4);
  return rows.map(row => {
    eng.levels(row.balls, m, pm, G, 0);
    const c = row.seg < idx.P - idx.iC ? u[idx.iC + row.seg] : 0;
    const F = Array.from(G, g => pi + (1 - pi) * g);
    return { a: { 2: c + Math.log(F[0]), 3: c + Math.log(F[1]), 4: c + Math.log(F[2]) }, mu5: row.off5 * Math.exp(c) * F[3], F5: F[3] };
  });
}

// --- données d'un jeu --------------------------------------------------

function loadGame(game) {
  const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, game + '.json'), 'utf-8'));
  const cfg = j.config;
  if (cfg.ballCount !== 5) throw new Error(game + ' : le moteur énumère des grilles de 5 numéros');
  const N = cfg.ballMax;
  const pm = {};
  for (let m = 0; m <= 5; m++) pm[m] = core.binom(5, m) * core.binom(N - 5, 5 - m) / core.binom(N, 5);
  const seg = [];
  const levels = core.drawLevels(game, cfg, j.draws, seg);
  // Tirages ajustables : volume exact et niveaux 2 à 5 tous payés
  const segIds = new Map();
  const rows = [];
  levels.forEach((r, i) => {
    if (r.v === null || seg[i] === undefined || seg[i] < 0) return;
    if (!(r.W[2] > 0 && r.W[3] > 0 && r.W[4] > 0) || r.W[5] === undefined) return;
    if (!segIds.has(seg[i])) segIds.set(seg[i], segIds.size);
    const a = {};
    for (const m of LEVELS) a[m] = Math.log(r.W[m] / (r.v * pm[m]));
    rows.push({ date: r.draw.date, balls: r.draw.balls.slice().sort((x, y) => x - y), draw: r.draw, a, w5: r.W[5], off5: r.v * pm[5], seg: segIds.get(seg[i]) });
  });
  return { game, cfg, N, width: core.gridWidthFor(game), pm, rows, nSeg: segIds.size, draws: j.draws, levels };
}

// --- étoiles et N° Chance : parts mesurées directement ------------------
// Parmi les grilles ayant 2 bons numéros, la part de celles qui ont AUSSI
// les deux étoiles tirées est la part des grilles jouées portant cette paire
// (les étoiles se choisissent à part des numéros). Les 66 paires sont toutes
// sorties plusieurs fois depuis 2016 : une table, pas un modèle. Même
// lecture pour le N° Chance. Valeurs rapportées à la moyenne (1 = paire ou
// numéro joué comme la moyenne).

function bonusTable(data) {
  const { game, draws } = data;
  const sums = {}, counts = {};
  const add = (key, v) => { sums[key] = (sums[key] || 0) + v; counts[key] = (counts[key] || 0) + 1; };
  for (const d of draws) {
    if (!d.prizes) continue;
    const w = rank => { const p = d.prizes.find(x => x.rank === rank); return p ? (p.winners !== undefined ? p.winners : p.winnersEu) : 0; };
    if (game === 'euromillions') {
      if (d.date < core.STAR_12_ERA_START || !d.stars) continue;
      const t = core.RANK_TABLE_EM;
      const w0 = w(t['2+0']), w1 = w(t['2+1']), w2 = w(t['2+2']);
      if (!(w0 > 0 && w1 > 0 && w2 > 0)) continue;
      const s = d.stars.slice().sort((x, y) => x - y);
      add(s[0] + '-' + s[1], 66 * w2 / (w0 + w1 + w2));
    } else if (game === 'loto') {
      if (d.prizes.length <= 6) continue; // ère 9 rangs : 2+1 et 2+0 payés séparément
      const t = core.RANK_TABLE_LOTO;
      const w0 = w(t['2+0']), w1 = w(t['2+1']);
      if (!(w0 > 0 && w1 > 0)) continue;
      add(String(d.bonus), 10 * w1 / (w0 + w1));
    }
  }
  const keys = [];
  if (game === 'euromillions') { for (let a = 1; a <= 12; a++) for (let b = a + 1; b <= 12; b++) keys.push(a + '-' + b); }
  else for (let c = 1; c <= 10; c++) keys.push(String(c));
  // Une valeur jamais sortie reste à la moyenne (1) ; puis moyenne ramenée à 1
  const raw = keys.map(k => (counts[k] >= 3 ? sums[k] / counts[k] : 1));
  const mean = raw.reduce((x, y) => x + y, 0) / raw.length;
  const table = {};
  keys.forEach((k, i) => { table[k] = +(raw[i] / mean).toFixed(4); });
  return {
    kind: game === 'euromillions' ? 'starPairs' : 'chance',
    table,
    minDraws: Math.min(...keys.map(k => counts[k] || 0)),
  };
}

// --- validation hors échantillon ---------------------------------------
// Appris sur les 70 % premiers tirages, jugé sur les 30 % suivants.

function validate(data, eng, init, maxIter) {
  const { rows, N, width, pm, nSeg } = data;
  const cut = Math.floor(rows.length * 0.7);
  const train = rows.slice(0, cut), test = rows.slice(cut);
  const fitted = fit(train, nSeg, N, width, pm, init, { eng, rounds: 2, maxIter: maxIter || 20 });
  const pred = predict(fitted, test, N, width, pm, eng);
  const rmse = (obs, est) => Math.sqrt(obs.reduce((s, v, i) => s + (v - est[i]) ** 2, 0) / obs.length);
  const pdev = (ys, mus) => ys.reduce((s, y, i) => s + 2 * ((y > 0 ? y * Math.log(y / mus[i]) : 0) - (y - mus[i])), 0);
  const out = { asOf: rows[rows.length - 1].date, nTrain: train.length, nTest: test.length, testFrom: test[0].date, pi: +fitted.pi.toFixed(3), rmse: {}, rmseNoModel: {} };
  // Référence « sans modèle » : la moyenne d'apprentissage du niveau, par segment
  const segMean = m => {
    const acc = {};
    for (const r of train) { (acc[r.seg] = acc[r.seg] || { s: 0, n: 0 }); acc[r.seg].s += r.a[m]; acc[r.seg].n++; }
    return r => (acc[r.seg] ? acc[r.seg].s / acc[r.seg].n : 0);
  };
  for (const m of LEVELS) {
    out.rmse[m] = +rmse(test.map(r => r.a[m]), pred.map(p => p.a[m])).toFixed(4);
    const base = segMean(m);
    out.rmseNoModel[m] = +rmse(test.map(r => r.a[m]), test.map(base)).toFixed(4);
  }
  const ratio = {};
  for (const r of train) { (ratio[r.seg] = ratio[r.seg] || { y: 0, e: 0 }); ratio[r.seg].y += r.w5; ratio[r.seg].e += r.off5; }
  out.dev5 = +pdev(test.map(r => r.w5), pred.map(p => p.mu5)).toFixed(1);
  out.dev5NoModel = +pdev(test.map(r => r.w5), test.map(r => r.off5 * (ratio[r.seg] ? ratio[r.seg].y / ratio[r.seg].e : 1))).toFixed(1);
  // Calibration aux extrêmes : cinquième des tirages que le modèle dit le moins
  // (resp. le plus) joué — facteur prédit et facteur observé à 5 numéros
  const order = test.map((r, i) => i).sort((x, y) => pred[x].F5 - pred[y].F5);
  const fifth = Math.floor(test.length / 5);
  const agg = idx => ({
    predicted: +(idx.reduce((s, i) => s + pred[i].mu5, 0) / idx.reduce((s, i) => s + test[i].off5, 0)).toFixed(3),
    observed: +(idx.reduce((s, i) => s + test[i].w5, 0) / idx.reduce((s, i) => s + test[i].off5, 0)).toFixed(3),
  });
  out.leastPlayed = agg(order.slice(0, fifth));
  out.mostPlayed = agg(order.slice(-fifth));
  return out;
}

// --- un jeu ------------------------------------------------------------

// maxIter : plafond d'itérations par manche (tests)
function fitGame(game, previous, doValidate, cold, maxIter) {
  const data = loadGame(game);
  const { rows, N, width, pm, nSeg } = data;
  if (rows.length < 300) throw new Error(game + ' : ' + rows.length + ' tirages ajustables seulement');
  const last = rows[rows.length - 1].date;
  const prev = previous && previous.ballMax === N && Array.isArray(previous.theta) && previous.theta.length === N ? previous : null;
  if (prev && prev.asOf === last && prev.nFit === rows.length && !cold && !flag('force') && !doValidate) {
    console.log('  = ' + game + ' : aucun nouveau tirage depuis le ' + last + ' — paramètres conservés');
    return prev;
  }
  const eng = makeEngine(N, width);

  // Départ : paramètres déjà publiés (quelques itérations suffisent), sinon zéro
  let init = null;
  if (prev && !cold) {
    init = new Float64Array(N + NF + 1 + nSeg);
    prev.theta.forEach((v, i) => { init[i] = v; });
    core.STRUCT_FEATURES.forEach((ft, j) => { init[N + j] = prev.gamma[ft.key] || 0; });
    init[N + NF] = Math.log(prev.pi / (1 - prev.pi));
    (prev.segOffsets || []).forEach((v, i) => { if (i < nSeg) init[N + NF + 1 + i] = v; });
  }
  const t0 = Date.now();
  const fitted = fit(rows, nSeg, N, width, pm, init, { eng, rounds: 2, maxIter, sig: prev && !cold && prev.fit ? prev.fit.resSd : undefined });
  const u = fitted.u;

  // Jauge : θ de moyenne nulle. Puis arrondi — et TOUT ce qui suit (constante
  // de normalisation, quantiles) est calculé sur les paramètres arrondis, ceux
  // que l'app lira.
  let mean = 0;
  for (let i = 0; i < N; i++) mean += u[i];
  mean /= N;
  const theta = Array.from(u.slice(0, N), v => +(v - mean).toFixed(4));
  const gamma = {};
  core.STRUCT_FEATURES.forEach((ft, j) => { gamma[ft.key] = +u[N + j].toFixed(4); });
  const pi = +fitted.pi.toFixed(4);
  const published = { ballMax: N, ballCount: 5, width, pi, theta, gamma, logZ: 0 };
  let model = core.preparePopModel(published);
  const Z = eng.pass(model);
  published.logZ = +Math.log(Z).toFixed(6);
  model = core.preparePopModel(published);

  // Distribution exacte de log G sur toutes les grilles : quantiles, et
  // contrôle que l'évaluation partagée (core.manualLogWeight) retrouve Z
  const total = core.binom(N, 5);
  const all = new Float64Array(total);
  let k = 0, zCheck = 0;
  const grid = [0, 0, 0, 0, 0];
  for (grid[0] = 1; grid[0] <= N - 4; grid[0]++) for (grid[1] = grid[0] + 1; grid[1] <= N - 3; grid[1]++)
    for (grid[2] = grid[1] + 1; grid[2] <= N - 2; grid[2]++) for (grid[3] = grid[2] + 1; grid[3] <= N - 1; grid[3]++)
      for (grid[4] = grid[3] + 1; grid[4] <= N; grid[4]++) {
        const lw = core.manualLogWeight(grid, model);
        zCheck += Math.exp(lw);
        all[k++] = lw + model.logNorm;
      }
  if (Math.abs(zCheck / Z - 1) > 1e-9) throw new Error(game + ' : la passe d\'énumération et core.manualLogWeight divergent (' + zCheck + ' vs ' + Z + ')');
  all.sort();
  const quantiles = [];
  for (let i = 0; i <= QUANTILES; i++) quantiles.push(+all[Math.min(total - 1, Math.round(i * (total - 1) / QUANTILES))].toFixed(4));
  const single = eng.singles().slice(1).map(v => +v.toFixed(4));

  const out = Object.assign(published, {
    asOf: last,
    from: rows[0].date,
    nFit: rows.length,
    segOffsets: Array.from(u.slice(fitted.idx.iC), v => +v.toFixed(5)),
    quantiles,
    single,
    bonus: bonusTable(data),
    fit: { resSd: fitted.stats.resSd.map(v => +v.toFixed(4)), disp5: +fitted.stats.disp5.toFixed(2) },
    validation: prev && prev.validation ? prev.validation : null,
  });
  console.log('  ✓ ' + game + ' : ' + rows.length + ' tirages (' + rows[0].date + ' → ' + last + '), ' + fitted.stats.iters + ' itérations, ' +
    ((Date.now() - t0) / 1000).toFixed(0) + ' s — π = ' + pi.toFixed(3) + ', résidus ' + out.fit.resSd.join(' / ') + ', surdispersion à 5 numéros ' + out.fit.disp5);
  if (doValidate) {
    const tv = Date.now();
    out.validation = validate(data, eng, u, maxIter);
    const v = out.validation;
    console.log('    validation (' + v.nTrain + ' → ' + v.nTest + ' tirages dès le ' + v.testFrom + ', ' + ((Date.now() - tv) / 1000).toFixed(0) + ' s) : erreur à 2/3/4 numéros ' +
      LEVELS.map(m => (100 * v.rmse[m]).toFixed(1) + ' %').join(' / ') + ' (sans modèle : ' + LEVELS.map(m => (100 * v.rmseNoModel[m]).toFixed(1) + ' %').join(' / ') + ')' +
      ', déviance à 5 numéros ' + v.dev5 + ' (sans modèle : ' + v.dev5NoModel + ')');
    console.log('    cinquième le moins joué : prédit ×' + v.leastPlayed.predicted + ', observé ×' + v.leastPlayed.observed +
      ' | le plus joué : prédit ×' + v.mostPlayed.predicted + ', observé ×' + v.mostPlayed.observed);
  }
  return out;
}

// --- main ---------------------------------------------------------------

function main() {
  console.log('=== EuroAffûté — Ajustement du modèle de popularité ===\n');
  let previous = null;
  if (fs.existsSync(OUT_FILE)) {
    try {
      previous = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
      if (previous.version !== FORMAT_VERSION) previous = null;
    } catch {
      console.warn('  ⚠ popularity.json illisible — ajustement complet');
    }
  }
  const out = { version: FORMAT_VERSION, updated: new Date().toISOString(), games: Object.assign({}, previous ? previous.games : {}) };
  const failures = [];
  for (const game of GAMES) {
    if (optGame && optGame !== game) continue;
    try {
      out.games[game] = fitGame(game, previous && previous.games ? previous.games[game] : null, flag('validate'), flag('cold'));
    } catch (err) {
      console.error('  ✗ ' + game + ' : ' + err.message);
      failures.push(game);
    }
  }
  // Horodatage stable : rien de neuf, pas de diff
  if (previous && JSON.stringify(previous.games) === JSON.stringify(out.games)) out.updated = previous.updated;
  if (Object.keys(out.games).length) {
    fs.writeFileSync(OUT_FILE, JSON.stringify(out), 'utf-8');
    console.log('\n  → ' + OUT_FILE);
  }
  if (failures.length) {
    console.error('\n=== Terminé avec ÉCHEC pour : ' + failures.join(', ') + ' ===');
    process.exitCode = 1;
  } else {
    console.log('\n=== Terminé ===');
  }
}

if (require.main === module) main();
module.exports = { makeEngine, modelFrom, fit, predict, loadGame, bonusTable, validate, fitGame };
