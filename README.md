# EuroAffûté

**Filtres appris depuis 20 ans de tirages — et popularité des numéros mesurée dans les compteurs de gagnants.**

Un outil d'analyse statistique qui télécharge l'intégralité des tirages EuroMillions, LOTO et EuroDreams depuis les archives officielles de la FDJ, en déduit des règles de distribution, mesure ce que jouent réellement les autres joueurs, et génère des grilles filtrées.

> [!NOTE]
> Cet outil n'augmente pas vos chances de gagner : chaque grille a exactement la même probabilité de sortir, et l'espérance d'une grille est négative à presque tous les tirages (c'est calculé et affiché — seule exception mesurée : les soirs de plafond EuroMillions). Il exclut ce qui n'est jamais sorti et garde les grilles **délaissées par les autres joueurs**, mesurées dans les compteurs de gagnants : mêmes chances, jackpot et lots moins partagés.

## Fonctionnalités

### Trois jeux supportés

| Jeu | Boules | Complémentaire | Tirages | Depuis |
|-----|--------|----------------|---------|--------|
| EuroMillions | 5 sur 50 | 2 étoiles (1–12) | ~1 980 | fév. 2004 |
| LOTO | 5 sur 49 | 1 N° Chance (1–10) | ~2 810 | oct. 2008 |
| EuroDreams | 6 sur 40 | 1 N° Dream (1–5) | ~300 | nov. 2023 |

Les tables de rangs de gains sont **résolues par ère** : EuroMillions 9/11/12 étoiles (rangs 6↔7 et 8↔9 inversés selon l'époque), LOTO 6 rangs (2008-2017) puis 9 rangs, EuroDreams où le N° Dream ne distingue que les rangs 1-2 — chaque mapping validé contre les ratios hypergéométriques des compteurs de gagnants.

### Analyse statistique

- **Règles dures** — Numéros déjà sortis ensemble (seconds tirages LOTO inclus), patterns jamais observés en 20 ans (progressions arithmétiques, même dizaine), bornes absolues de somme et de range
- **Règle cœur = indice de co-joueurs** — Le cœur retient les 80 % de grilles (réglable : 70 / 80 / 90 %) les moins jouées d'après le modèle de popularité mesuré ; sous tirage uniforme, autant de tirages y tombent (vérifié : 79 % en EM, 81 % au LOTO). Les anciennes bornes p10–p90 sur la somme, le range, les paires consécutives ou les trous ne faisaient que redécouvrir la loi combinatoire (p10/p90 observés = p10/p90 théoriques) et rejetaient autant de grilles délaissées que de grilles sur-jouées : zone acceptée mesurée à −1 % de co-joueurs en EM, contre −11 % (cœur à 80 %) à −15 % (cœur à 70 %) aujourd'hui
- **Badge « Équité vérifiée »** — χ² global avec correction de tirage sans remise (Joe 1993), runs test d'indépendance temporelle, et taux de sortie par tranche de « retard » (9,9 à 10,2 % pour 10 % attendus en EM : attendre un numéro ne sert à rien) ; la heatmap de fréquences est graduée en **écarts-types théoriques** (saturation ±3σ) pour ne pas transformer le bruit en signal visuel

### Indice de popularité mesuré

Les compteurs de gagnants par rang (winnersFr/winnersEu) révèlent ce que jouent les autres : à volume donné, un tirage plein de numéros populaires produit plus de gagnants « 3 numéros » par gagnant « 2 numéros ». Ce signal — insensible au volume de ventes — donne un **delta de popularité par numéro, étoile et N° Chance** (effet « dates ≤ 31 » à ~20 écarts-types ; N° Chance 7 sur-joué de ~+47 %). Le bénéfice est chiffré en euros : les soirs pauvres en dates, l'espérance hors rang 1 a payé +21 % (EM), et le lot du rang « 3 numéros » +26 à +56 %.

Le modèle complet ajoute aux numéros sept **structures combinatoires**, ajustées ensemble par moindres carrés et validées hors échantillon (30 % des tirages : R² 0,55 → 0,78 en EM, 0,61 → 0,81 au LOTO) : l'effet dates est **convexe** (chaque paire de numéros ≤ 31 ajoute +20 % de co-joueurs en EM, +34 % au LOTO — une grille 100 % dates est partagée bien au-delà du produit de ses numéros), les **paires consécutives sont délaissées** (−14 % par paire en EM, −21 % au LOTO : les joueurs « étalent » leurs numéros), la même ligne de la grille aussi (−9 %), tandis que les alignements de 3+ (+12 %) et les paires de multiples de 7 (+7 %) sont sur-joués. Une étoile ou un N° Chance qui répète l'un des numéros de la grille est joué +6,5 à +7 % de plus (« même chiffre fétiche »). Personne, en revanche, ne joue mesurablement les numéros chauds, froids, ceux du tirage précédent ni la date du jour.

### Économie du tirage

- **Volume de joueurs par tirage** — la série que la FDJ ne publie pas, reconstruite par `gagnants ÷ probabilité` (graphique, effet jour, élasticité à la cagnotte)
- **Espérance réelle d'une grille** — rangs fixes + My Million ; le jackpot seul ne suffit jamais (seuil ≈ 280 M€ à volume médian, au-dessus du plafond de 250 M€), **mais au plafond l'excédent est reversé au rang 5+1** : mesuré sur 16 soirs plafonnés 2019–2025, +0,41 € par grille, soit une espérance d'environ 2,5 € pour 2,50 € — le seul cas où une grille vaut sa mise (panneau « soir de plafond » quand la cagnotte annoncée atteint 250 M€)
- **Modèle de Poisson du jackpot** — validé sur l'historique (23,0 % prédit vs 22,7 % observé sur 1 973 tirages EM) ; panneau « prochain tirage » : volume attendu (± erreur mesurée en walk-forward), P(le jackpot tombe), P(devoir partager), espérance jackpot compris
- **Hall of shame du partage** — surdispersion des gagnants (sd(z) jusqu'à 4,6 pour 1,0 attendu sous hasard) et les pires soirées où un pattern « humain » a pulvérisé les lots (ex. LOTO 11/03/2026, 10-12-14-16-18 : 41 gagnants à 5 numéros pour 2,2 attendus)

### Génération de grilles

- **Grille filtrée** — Combinaison aléatoire passant les règles dures et la règle cœur, affichée avec son indice de co-joueurs
- **Portefeuille cœur en partition disjointe** — 10 grilles couvrant 100 % des numéros (recouvrement minimal) : P(au moins une grille avec ≥ 2 bons numéros) gagne jusqu'à ~10 points à budget identique ; les étoiles / N° Chance les moins joués vont aux blocs les plus populaires pour que chaque grille reste sous le seuil du cœur
- **Portefeuille contre-tendance calibré** — les 10 grilles les moins jouées d'un pool de 300 candidates du cœur, triées par l'indice complet (numéros + structures + étoiles ou N° Chance, plus deux règles structurelles : suites arithmétiques, alignements grille) ; chaque grille affiche son % de co-joueurs estimé (typiquement −43 à −58 % en EM, −52 à −66 % au LOTO)

### Visualisations

- **Dynamique récente** — Graphique SVG des 15 derniers jackpots + estimation du prochain tirage
- **Volume de joueurs** — Graphique SVG des 80 derniers tirages, points verts quand le rang 1 tombe
- **Heatmap de fréquences** — Écart à l'attendu en σ pour chaque numéro et étoile/bonus (attendu des étoiles ventilé sur les 3 ères : 9, 11 puis 12 étoiles)
- **Dernier tirage** — Résultat, verdict filtres, répartition des gains par rang, indice de popularité du tirage

### Audit de grille

Saisissez vos numéros fétiches pour vérifier :
- Passage ou rejet par chaque règle, et l'indice de co-joueurs de la grille avec son détail (paires de dates, paires consécutives, étoile qui répète un numéro…)
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
node scripts/update-jackpots.js # cagnottes → data/jackpots.json
node scripts/validate-data.js   # garde-fou d'intégrité (exécuté aussi en CI)
```

Le script télécharge les archives ZIP depuis l'API FDJ, extrait les CSV, parse les tirages (pour le LOTO, le second tirage de 5 numéros, depuis nov. 2019, est conservé dans le champ `second` et exclu lui aussi du générateur), applique `scripts/corrections.json` (tirages absents des archives, champs erronés — ex. le LOTO du 04/11/2019 tombé à la couture entre deux ZIP), et génère les fichiers `data/*.json`. Une garde anti-régression refuse d'écraser un historique par moins de données (`EUROAFFUTE_FORCE=1` pour outrepasser).

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

Les cagnottes (prochain tirage et jackpots récents) proviennent de [fdj.fr](https://www.fdj.fr) et [euro-millions.com](https://www.euro-millions.com). Ces sites n'envoient **aucun en-tête CORS** : un navigateur ne peut pas les lire directement, et les proxies CORS publics utilisés auparavant sont devenus inutilisables (corsproxy.io exige une clé API, allorigins time-out).

Elles sont donc récupérées **côté serveur** par `scripts/update-jackpots.js` dans GitHub Actions — où la contrainte CORS n'existe pas — puis committées dans `data/jackpots.json` (~1 Ko), que l'app lit en same-origin. Côté navigateur, le scraping via proxy ne subsiste qu'en repli pour la fraîcheur intra-journée.

Subtilité : `euro-millions.com` refuse les IP de datacenter, donc son listing échoue depuis un runner GitHub (il répond normalement depuis une machine personnelle), et le relais `r.jina.ai` rate-limite sans clé API. Les jackpots passés de la timeline sont donc remplis par ordre de fiabilité décroissante :

| Source | Exactitude | Disponibilité |
|--------|-----------|---------------|
| Listing `euro-millions.com` (~17 tirages en une requête) | exacte | hors datacenter |
| Page du tirage (complément, relais `r.jina.ai` si refus) | exacte | aléatoire |
| **Données FDJ du dépôt** — tirage gagné : gain par gagnant × gagnants au rang 1 | exacte | toujours |
| **Cagnotte annoncée** avant le tirage, mémorisée à chaque run (`pending`) | estimation (`est: true`) | toujours |

Les deux dernières lignes ne dépendent d'aucun service tiers : même avec `euro-millions.com` totalement injoignable, la timeline reste complète. Validation croisée du calcul depuis les données FDJ : pour le tirage du 11/09/2026 il donne 111 516 282 €, soit exactement la valeur publiée par euro-millions.com.

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
│   ├── euromillions.json   # ~1 980 tirages (JSON minifié)
│   ├── loto.json           # ~2 810 tirages
│   ├── eurodreams.json     # ~300 tirages
│   └── jackpots.json       # Cagnottes (produites par GitHub Actions)
├── scripts/
│   ├── update-data.js      # Pipeline de téléchargement et parsing FDJ
│   ├── update-jackpots.js  # Cagnottes côté serveur (contourne le CORS)
│   ├── corrections.json    # Correctifs manuels des archives FDJ (sources documentées)
│   └── validate-data.js    # Garde-fou d'intégrité (CI + local)
└── .github/
    └── workflows/
        └── update-data.yml # Scheduler GitHub Actions (avec validation bloquante)
```

## Comment ça marche

1. **Chargement** — Le JSON du jeu sélectionné est chargé, parsé et mis en cache de session (changement d'onglet ≈ 15 ms)
2. **Apprentissage** — `learnPopularity()` mesure la popularité des numéros, des structures et des étoiles/bonus dans les compteurs de gagnants (modèle joint par moindres carrés, validé hors échantillon) ; `learnFilters()` en déduit le seuil du cœur par Monte Carlo sur 20 000 grilles aléatoires, plus les règles dures ; `learnEconomics()` reconstruit le volume de joueurs, l'espérance, le modèle de Poisson et l'excédent des soirs de plafond ; `learnFairness()` calcule les tests d'équité
3. **Filtrage** — `passesAll()` applique les règles dures puis compare l'indice de co-joueurs de la grille complète au seuil du cœur
4. **Estimation Monte Carlo** — 50 000 combinaisons testées par tranches (thread principal jamais bloqué), résultat mémoïsé par jeu
5. **Rendu** — Toutes les sections sont recalculées au changement de jeu

> [!IMPORTANT]
> La couverture du cœur (70 / 80 / 90 %) est un choix de confort, pas une probabilité de gain : élargir le cœur fait tomber plus de tirages dedans mais accepte des grilles plus partagées (mesuré hors échantillon en EM : −14 % de co-joueurs à 70 %, −9 % à 80 %, −5 % à 90 % ; au LOTO −23 / −18 / −12 %). Le portefeuille contre-tendance, lui, prend les grilles les moins jouées du cœur quelle que soit la couverture.
