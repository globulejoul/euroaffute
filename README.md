# EuroAffûté

**Filtres appris depuis 20 ans de tirages — et popularité des numéros mesurée dans les compteurs de gagnants.**

Un outil d'analyse statistique qui télécharge l'intégralité des tirages EuroMillions, LOTO et EuroDreams depuis les archives officielles de la FDJ, en déduit des règles de distribution, mesure ce que jouent réellement les autres joueurs, et génère des grilles filtrées.

> [!NOTE]
> Cet outil n'augmente pas vos chances de gagner — l'espérance d'une grille EuroMillions est négative à chaque tirage, sans exception (c'est calculé et affiché). Il élimine les combinaisons statistiquement improbables et privilégie les grilles délaissées par les autres joueurs pour réduire le partage en cas de gain.

## Fonctionnalités

### Trois jeux supportés

| Jeu | Boules | Complémentaire | Tirages | Depuis |
|-----|--------|----------------|---------|--------|
| EuroMillions | 5 sur 50 | 2 étoiles (1–12) | ~1 970 | fév. 2004 |
| LOTO | 5 sur 49 | 1 N° Chance (1–10) | ~2 800 | oct. 2008 |
| EuroDreams | 6 sur 40 | 1 N° Dream (1–5) | ~290 | nov. 2023 |

Les tables de rangs de gains sont **résolues par ère** : EuroMillions 9/11/12 étoiles (rangs 6↔7 et 8↔9 inversés selon l'époque), LOTO 6 rangs (2008-2017) puis 9 rangs, EuroDreams où le N° Dream ne distingue que les rangs 1-2 — chaque mapping validé contre les ratios hypergéométriques des compteurs de gagnants.

### Analyse statistique

- **Règles dures** — Patterns jamais observés en 20 ans (progressions arithmétiques, même dizaine, etc.)
- **Distribution cœur** — Bornes p10–p90 apprises pour la somme, le range, la parité, la couverture des dizaines
- **Seuils adaptatifs par jeu** — Gap max, paires consécutives, concentration par dizaine calibrés sur les données réelles de chaque jeu
- **Badge « Équité vérifiée »** — χ² global avec correction de tirage sans remise (Joe 1993) + runs test d'indépendance temporelle ; la heatmap de fréquences est graduée en **écarts-types théoriques** (saturation ±3σ) pour ne pas transformer le bruit en signal visuel

### Indice de popularité mesuré

Les compteurs de gagnants par rang (winnersFr/winnersEu) révèlent ce que jouent les autres : à volume donné, un tirage plein de numéros populaires produit plus de gagnants « 3 numéros » par gagnant « 2 numéros ». Ce signal — insensible au volume de ventes — donne un **delta de popularité par numéro, étoile et N° Chance** (effet « dates ≤ 31 » à ~20 écarts-types ; N° Chance 7 sur-joué de ~+47 %). Le bénéfice est chiffré en euros : les soirs pauvres en dates, l'espérance hors rang 1 a payé +21 % (EM), et le lot du rang « 3 numéros » +26 à +56 %.

### Économie du tirage

- **Volume de joueurs par tirage** — la série que la FDJ ne publie pas, reconstruite par `gagnants ÷ probabilité` (graphique, effet jour, élasticité à la cagnotte)
- **Espérance réelle d'une grille** — rangs fixes + My Million + seuil de jackpot rendant l'espérance positive (EM : ≈ 280 M€, au-dessus du plafond de 250 M€ → jamais)
- **Modèle de Poisson du jackpot** — validé sur l'historique (23,0 % prédit vs 22,7 % observé sur 1 973 tirages EM) ; panneau « prochain tirage » : volume attendu (± erreur mesurée en walk-forward), P(le jackpot tombe), P(devoir partager), espérance jackpot compris
- **Hall of shame du partage** — surdispersion des gagnants (sd(z) jusqu'à 4,6 pour 1,0 attendu sous hasard) et les pires soirées où un pattern « humain » a pulvérisé les lots (ex. LOTO 11/03/2026, 10-12-14-16-18 : 41 gagnants à 5 numéros pour 2,2 attendus)

### Génération de grilles

- **Grille filtrée** — Combinaison aléatoire passant l'ensemble des règles apprises
- **Portefeuille cœur en partition disjointe** — 10 grilles couvrant 100 % des numéros (recouvrement minimal) : P(au moins une grille avec ≥ 2 bons numéros) gagne jusqu'à ~10 points à budget identique
- **Portefeuille contre-tendance calibré** — les 10 grilles les moins jouées d'un pool de candidates, triées par l'indice de popularité **mesuré** (plus deux règles structurelles : suites arithmétiques, alignements grille) ; chaque grille affiche son % de co-joueurs estimé (jusqu'à −56 %)

### Visualisations

- **Dynamique récente** — Graphique SVG des 15 derniers jackpots + estimation du prochain tirage
- **Volume de joueurs** — Graphique SVG des 80 derniers tirages, points verts quand le rang 1 tombe
- **Heatmap de fréquences** — Écart à l'attendu en σ pour chaque numéro et étoile/bonus (attendu des étoiles ventilé sur les 3 ères : 9, 11 puis 12 étoiles)
- **Dernier tirage** — Résultat, verdict filtres, répartition des gains par rang, indice de popularité du tirage

### Audit de grille

Saisissez vos numéros fétiches pour vérifier :
- Passage ou rejet par chaque filtre (avec détail et pourcentage historique)
- Plus proche voisin dans l'historique
- Simulation « si j'avais joué cette grille à chaque tirage » avec bilan net, calculée avec les règles de gains de chaque époque

## Stack technique

- **Frontend** — HTML, CSS, JavaScript vanilla (aucun framework, aucun bundler)
- **Polices** — auto-hébergées (4 woff2 latin, 108 KB, dont 2 fontes variables — aucune requête tierce)
- **Données** — Archives CSV officielles FDJ, converties en JSON minifié par un script Node.js
- **Hébergement** — GitHub Pages (site statique)
- **Mises à jour** — GitHub Actions après chaque tirage (mardi/vendredi pour EM, lundi/mercredi/samedi pour LOTO, lundi/jeudi pour ED) + rattrapage quotidien le matin

## Démarrage rapide

```bash
# Cloner le dépôt
git clone https://github.com/GlobuLeJoul/euroaffute.git
cd euroaffute

# Lancer un serveur local
npx serve
# → http://localhost:3000
```

### Mettre à jour les données

```bash
# Nécessite Node.js 20+
node scripts/update-data.js
node scripts/validate-data.js   # garde-fou d'intégrité (exécuté aussi en CI)
```

Le script télécharge les archives ZIP depuis l'API FDJ, extrait les CSV, parse les tirages, applique `scripts/corrections.json` (tirages absents des archives, champs erronés — ex. le LOTO du 04/11/2019 tombé à la couture entre deux ZIP), et génère les fichiers `data/*.json`. Une garde anti-régression refuse d'écraser un historique par moins de données (`EUROAFFUTE_FORCE=1` pour outrepasser).

## Sources de données

Toutes les données proviennent des archives publiques de la **Française des Jeux** :

```
https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/
```

| Jeu | Archives | Période |
|-----|----------|---------|
| EuroMillions | 6 fichiers ZIP | fév. 2004 → présent |
| LOTO | 4 fichiers ZIP | oct. 2008 → présent |
| EuroDreams | 1 fichier ZIP | nov. 2023 → présent |

Les jackpots en temps réel sont scrapés depuis [fdj.fr](https://www.fdj.fr), [secretsdujeu.com](https://www.secretsdujeu.com) et [euro-millions.com](https://www.euro-millions.com) via proxies CORS (timeout 8 s par stratégie).

## Architecture

```
euroaffute/
├── index.html              # Application complète (HTML + JS inline)
├── css/
│   ├── common.css          # Styles partagés, design system, spacing tokens
│   ├── fonts/              # Polices auto-hébergées (woff2, sous-ensemble latin)
│   ├── euromillions.css    # Thème EuroMillions (bleu/or)
│   ├── loto.css            # Thème LOTO (bleu/rouge)
│   └── eurodreams.css      # Thème EuroDreams (violet/rose)
├── data/
│   ├── euromillions.json   # ~1 970 tirages (JSON minifié)
│   ├── loto.json           # ~2 800 tirages
│   └── eurodreams.json     # ~290 tirages
├── scripts/
│   ├── update-data.js      # Pipeline de téléchargement et parsing FDJ
│   ├── corrections.json    # Correctifs manuels des archives FDJ (sources documentées)
│   └── validate-data.js    # Garde-fou d'intégrité (CI + local)
└── .github/
    └── workflows/
        └── update-data.yml # Scheduler GitHub Actions (avec validation bloquante)
```

## Comment ça marche

1. **Chargement** — Le JSON du jeu sélectionné est chargé, parsé et mis en cache de session (changement d'onglet ≈ 15 ms)
2. **Apprentissage** — `learnFilters()` extrait les seuils statistiques ; `learnPopularity()` mesure la popularité de chaque numéro dans les compteurs de gagnants ; `learnEconomics()` reconstruit le volume de joueurs, l'espérance et le modèle de Poisson ; `learnFairness()` calcule les tests d'équité
3. **Filtrage** — `passesAll()` applique les règles apprises pour accepter ou rejeter une combinaison
4. **Estimation Monte Carlo** — 50 000 combinaisons testées par tranches (thread principal jamais bloqué), résultat mémoïsé par jeu
5. **Rendu** — Toutes les sections sont recalculées au changement de jeu

> [!IMPORTANT]
> Les seuils sont **adaptatifs par jeu**. EuroDreams (6 boules sur 40, densité 15%) utilise des seuils différents d'EuroMillions (5 boules sur 50, densité 10%) — par exemple, 3 numéros consécutifs sont acceptés en EuroDreams (3.9% des tirages) mais rejetés en EuroMillions (2.4%).
