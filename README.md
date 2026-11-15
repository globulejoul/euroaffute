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

- **Règles dures** — Numéros déjà sortis ensemble (seconds tirages LOTO inclus), patterns jamais observés en 20 ans (progressions arithmétiques, même dizaine), bornes absolues de somme et de range, et une règle de goût : aucune suite de 3 numéros ou plus, consécutifs ou en progression de raison ≤ 11 en EM et LOTO (1-2-3, 2-4-6, 5-10-15, 10-20-30…), ≤ 3 en EuroDreams — sans effet sur les chances, la zone rejetée étant d'ailleurs sur-jouée (+12 % de co-joueurs en EM, +36 % au LOTO)
- **Règle cœur = indice de co-joueurs** — Le cœur retient les 80 % de grilles (réglable : 70 / 80 / 90 %) les moins jouées d'après le modèle de popularité mesuré ; sous tirage uniforme, autant de tirages y tombent (vérifié : 78 % en EM, 80 % au LOTO). Les anciennes bornes p10–p90 sur la somme, le range, les paires consécutives ou les trous ne faisaient que redécouvrir la loi combinatoire (p10/p90 observés = p10/p90 théoriques) et rejetaient autant de grilles délaissées que de grilles sur-jouées : zone acceptée mesurée à −1 % de co-joueurs en EM, contre −11 % (cœur à 80 %) à −14 % (cœur à 70 %) aujourd'hui, comptés aux gagnants à 5 numéros
- **Badge « Équité vérifiée »** — χ² global avec correction de tirage sans remise (Joe 1993), runs test d'indépendance temporelle, et taux de sortie par tranche de « retard » (9,9 à 10,2 % pour 10 % attendus en EM : attendre un numéro ne sert à rien) ; la heatmap de fréquences est graduée en **écarts-types théoriques** (saturation ±3σ) pour ne pas transformer le bruit en signal visuel

### Indice de popularité mesuré

Les compteurs de gagnants par rang révèlent ce que jouent les autres. Rapportés au volume exact (voir plus bas), ils donnent pour chaque tirage le nombre de grilles jouées qui avaient exactement 2, 3, 4 ou 5 de ses numéros : comparé à ce qu'en ferait le hasard, c'est la popularité des numéros sortis, lue à quatre niveaux — jusqu'à la grille entière, sans extrapolation.

Le modèle **« Flash + joueurs manuels »** s'ajuste sur ces quatre niveaux (EuroMillions et LOTO) :

- **Les Flash** — une part des grilles est tirée uniformément : 57 % en EuroMillions, 40 % au LOTO. Deux mesures indépendantes la confirment en EM (0,57 par les numéros, 0,61 par le lien entre numéros et étoiles). Elle fait **plancher** : même la grille la plus délaissée garde ces co-joueurs-là (au mieux −43 % en EM, −60 % au LOTO), et les préférences des autres joueurs s'en trouvent diluées.
- **Les joueurs manuels** — leurs numéros fétiches, plus sept structures combinatoires. Chez eux, chaque paire de numéros ≤ 31 multiplie la présence d'une grille par 1,43 en EM (1,50 au LOTO) — l'effet « dates » est convexe, une grille 100 % dates est partagée bien au-delà du produit de ses numéros —, chaque paire consécutive la réduit de 35 % (ils « étalent » leurs numéros), la même ligne de la grille aussi (−27 % en EM), tandis que les alignements de 3+ (+52 % en EM) et les paires de multiples de 7 (+20 %) sont sur-joués.
- **Étoiles et N° Chance** — mesurés valeur par valeur, sans modèle : la part des gagnants « 2 numéros » qui ont aussi les deux étoiles est la part des grilles portant cette paire. Les 66 paires sont toutes sorties au moins 6 fois depuis 2016 : 11-12 est la moins jouée (−29 %), 3-7 la plus jouée (+67 %), et une paire n'est pas le produit de ses deux étoiles (les consécutives sont délaissées de 14 %). Au LOTO, le N° Chance 7 est sur-joué de 41 %, le 1 délaissé de 23 %.
- **Numéros et étoiles ne se multiplient pas** — seuls les joueurs manuels cumulent les deux préférences : une grille à −30 % de numéros et −27 % d'étoiles est à −38 %, pas −49 %. Une étoile ou un N° Chance qui répète l'un des numéros de la grille reste joué +6,5 à +7 % de plus (« même chiffre fétiche »).

**Validation hors échantillon** (appris sur 70 % des tirages, jugé sur les 30 % suivants) : le nombre de gagnants est prévu à 1,6 % près à 2 numéros en EM (8,2 % sans modèle), 4,0 % à 3 et 9,3 % à 4 ; au LOTO, 2,4 %, 5,6 % et 15,3 % (14,3 %, 23,8 % et 35,5 % sans modèle). Pour le cinquième des tirages annoncé le moins joué, le modèle prédit −30 % de gagnants à 5 numéros en EM et les compteurs en donnent −27 % ; au LOTO, −41 % prédits pour −48 % observés. L'ancien indice — le ratio « 3 numéros / 2 numéros » extrapolé à la grille entière — annonçait −44 % là où les compteurs donnent −30 %.

EuroDreams (6 numéros, ~300 tirages) garde le modèle local de l'app, par moindres carrés sur ce ratio ; c'est aussi le repli si `data/popularity.json` manque. Personne, en revanche, ne joue mesurablement les numéros chauds, froids, ceux du tirage précédent ni la date du jour. Et côté tirage, le bénéfice se lit en euros : les soirs pauvres en dates, l'espérance hors rang 1 a payé +21 % (EM), et le lot du rang « 3 numéros » +26 à +56 %.

### Économie du tirage

- **Volume de joueurs par tirage** — la série que la FDJ ne publie pas, mesurée par les **dotations** : `lot × gagnants` d'un rang est une part fixe des mises, d'où le volume joué à 1 ou 2 % près, quels que soient les numéros sortis. L'ancienne estimation `gagnants ÷ probabilité` gonflait avec les numéros populaires : écart-type de 13 % contre le volume exact en EM, 17 % au LOTO, jusqu'à +73 % et +70 % les soirs de dates. Les régimes de répartition sont reconnus dans les données, sans une seule date codée (EM 2004, 2011, 2016, 2020 ; LOTO 2019 ; EuroDreams 2025), de même que les lots fixes prélevés sur l'enveloppe des autres rangs (remboursements du N° Chance au LOTO depuis 2019, des « 2 numéros » en EuroDreams) : le volume mesuré ne dépend plus des numéros sortis, ce qui se vérifie. Repli sur `gagnants ÷ probabilité` quand tous les lots sont fixes (LOTO de mars 2017 à octobre 2019). Graphique, effet jour, élasticité à la cagnotte
- **Espérance réelle d'une grille** — rangs fixes + My Million ; le jackpot seul ne suffit jamais (seuil ≈ 280 M€ à volume médian, au-dessus du plafond de 250 M€), **mais au plafond l'excédent est reversé au rang 5+1** : mesuré sur 16 soirs plafonnés 2019–2025, +0,46 € par grille — la mesure retombe sur le règlement, 42 % de 1,10 €, la part du jackpot après cinq reports. Au volume réellement joué ces soirs-là (53 M de grilles en médiane, contre 32 M un soir de gros report ordinaire ; 12 M de grilles françaises s'y partagent My Million, qui ne pèse plus que 0,08 € au lieu de 0,20 €), l'espérance est d'environ 2,5 € pour 2,50 € — le seul cas où une grille vaut sa mise (panneau « soir de plafond » quand la cagnotte annoncée atteint 250 M€)
- **Modèle de Poisson du jackpot** — validé sur l'historique (22,9 % prédit vs 22,6 % observé sur 1 998 tirages EM) ; panneau « prochain tirage » : volume attendu (± erreur mesurée en walk-forward : 10 % en EM, 3 % au LOTO), P(le jackpot tombe), risque de devoir le partager — celui d'une grille au hasard, et la fourchette selon la grille, du plancher des Flash aux grilles très jouées —, espérance d'une grille au hasard, jackpot et My Million compris (le million étant partagé entre les grilles françaises du soir)
- **Espérance propre à chaque grille** (EuroMillions, LOTO) — toutes les grilles ont les mêmes chances ; ce qui les distingue, c'est avec combien de gagnants elles partageraient chaque lot. Pour chaque rang en répartition, l'app moyenne la part touchée sur les tirages qui feraient gagner la grille à ce rang (le nombre de co-gagnants y suit le modèle « Flash + joueurs manuels » au volume attendu), et chiffre de même la part du jackpot gardée. Elle affiche l'**écart à une grille tirée au hasard**, ajouté à l'espérance « ce soir » du panneau : une seule référence dans toute la page. Un soir ordinaire d'EuroMillions (26 M€), une grille au hasard vaut 0,88 € pour 2,50 € misés, 98 grilles sur 100 valent entre 0,80 et 0,93 €, le portefeuille contre-tendance 0,91 à 0,93 € ; au LOTO (23 M€), 1,91 € pour 2,20 €, entre 1,59 et 2,06 €. Un soir de plafond, l'écart se creuse — 2,49 € au hasard, de 1,74 à 2,85 €, ≈ 2,80 € pour le portefeuille contre-tendance : au-dessus de la mise, mais l'essentiel tient dans des gains à une chance sur plusieurs millions, ce que l'app rappelle à chaque fois. Le risque de partager le jackpot va de 8 à 32 % selon la grille pour 12 % en moyenne (EM, soir ordinaire), de 8 à 44 % au LOTO, de 21 à 67 % un soir de plafond. Deux repères à ne pas confondre : l'indice de co-joueurs se compare à la grille *moyenne*, tirée vers le haut par une minorité de grilles très jouées ; l'espérance se compare à une grille *au hasard*, dont la moitié sont déjà sous −13 % (EM) ou −19 % (LOTO) — une grille à −5 % de co-joueurs ne vaut donc en général pas plus qu'une grille au hasard, et l'audit le dit
- **Hall of shame du partage** — surdispersion des gagnants (sd(z) jusqu'à 7,1 pour 1,0 attendu sous hasard) et les pires soirées où un pattern « humain » a pulvérisé les lots, classées par ratio gagnants/attendus (ex. LOTO 11/03/2026, 10-12-14-16-18 : 41 gagnants à 5 numéros pour 1,6 attendu, ×25)

### Génération de grilles

- **Grille filtrée** — Combinaison aléatoire passant les règles dures et la règle cœur, affichée avec son indice de co-joueurs et son espérance au prochain tirage, face à celle d'une grille au hasard
- **Portefeuille cœur en partition disjointe** — 10 grilles couvrant 100 % des numéros (recouvrement minimal) : P(au moins une grille avec ≥ 2 bons numéros) gagne jusqu'à ~10 points à budget identique ; les étoiles / N° Chance les moins joués vont aux blocs les plus populaires pour que chaque grille reste sous le seuil du cœur
- **Portefeuille contre-tendance calibré** — les 10 grilles les moins jouées d'un pool de 300 candidates du cœur, triées par l'indice complet (numéros + structures + étoiles ou N° Chance, plus deux règles structurelles : suites arithmétiques, alignements grille) ; chaque grille affiche son % de co-joueurs estimé (typiquement −36 à −40 % en EM, −46 à −49 % au LOTO : les Flash font plancher) et son espérance au prochain tirage, avec la moyenne du portefeuille face à une grille au hasard

### Visualisations

- **Dynamique récente** — Graphique SVG des 15 derniers jackpots + estimation du prochain tirage
- **Volume de joueurs** — Graphique SVG des 80 derniers tirages, points verts quand le rang 1 tombe
- **Heatmap de fréquences** — Écart à l'attendu en σ pour chaque numéro et étoile/bonus (attendu des étoiles ventilé sur les 3 ères : 9, 11 puis 12 étoiles)
- **Dernier tirage** — Résultat, verdict filtres, répartition des gains par rang, indice de popularité du tirage

### Audit de grille

Saisissez vos numéros fétiches pour vérifier :
- Passage ou rejet par chaque règle, et l'indice de co-joueurs de la grille avec son détail (paires de dates, paires consécutives, étoile qui répète un numéro…)
- Son espérance au prochain tirage face à une grille au hasard, son risque de partager le jackpot si elle le décroche, et les lots attendus par nombre de bons numéros (EuroMillions et LOTO)
- Plus proche voisin dans l'historique
- Simulation « si j'avais joué cette grille à chaque tirage » avec bilan net, calculée avec les règles de gains de chaque époque

## Stack technique

- **Frontend** — HTML, CSS, JavaScript vanilla (aucun framework, aucun bundler)
- **Polices** — auto-hébergées (4 woff2 latin, 108 KB, dont 2 fontes variables — aucune requête tierce)
- **Données** — Archives CSV officielles FDJ, converties en JSON minifié par un script Node.js
- **Hébergement** — GitHub Pages (site statique)
- **Mises à jour** — GitHub Actions après chaque tirage (mardi/vendredi pour EM, lundi/mercredi/samedi pour LOTO, lundi/jeudi pour ED) + rattrapage quotidien le matin ; le modèle de popularité y est réajusté quand un jeu a un nouveau tirage

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
node scripts/fit-popularity.js # modèle de popularité → data/popularity.json (1 à 3 min par jeu)
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
├── index.html              # Application (HTML + JS inline)
├── js/
│   └── core.js             # Calcul partagé avec les scripts Node : rangs par ère, volume exact, modèle de popularité, espérance par grille
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
│   ├── jackpots.json       # Cagnottes (produites par GitHub Actions)
│   └── popularity.json     # Paramètres du modèle de popularité (idem)
├── scripts/
│   ├── update-data.js      # Pipeline de téléchargement et parsing FDJ
│   ├── update-jackpots.js  # Cagnottes côté serveur (contourne le CORS)
│   ├── fit-popularity.js   # Ajustement du modèle « Flash + joueurs manuels »
│   ├── corrections.json    # Correctifs manuels des archives FDJ (sources documentées)
│   └── validate-data.js    # Garde-fou d'intégrité (CI + local)
└── .github/
    └── workflows/
        └── update-data.yml # Scheduler GitHub Actions (avec validation bloquante)
```

## Comment ça marche

1. **Chargement** — Le JSON du jeu sélectionné est chargé, parsé et mis en cache de session (changement d'onglet ≈ 15 ms)
2. **Apprentissage** — `learnPopularity()` charge le modèle de popularité publié (`data/popularity.json`, ajusté hors ligne par `scripts/fit-popularity.js` : l'app ne fait que l'évaluer) et garde en repli son modèle local, par moindres carrés ; `learnFilters()` en déduit le seuil du cœur — exact avec le modèle publié, dont les quantiles sont calculés sur toutes les grilles, par Monte Carlo sinon —, plus les règles dures ; `learnEconomics()` mesure le volume de joueurs par les dotations (`exactVolumes()` : régimes de répartition reconnus par leurs rapports de dotation, constante de chaque rang apprise par une identité exacte), puis l'espérance, le modèle de Poisson et l'excédent des soirs de plafond ; `learnFairness()` calcule les tests d'équité
3. **Espérance par grille** — après le chargement, `popTables()` (`js/core.js`, le moteur qui sert aussi à l'ajustement) parcourt une fois les ~2 millions de grilles de numéros, par tranches en tâche de fond (≈ 0,3 s) ; `gridValue()` en tire ensuite l'espérance d'une grille en 5 à 10 ms, sur un échantillon fixe de tirages (même grille, même valeur)
4. **Filtrage** — `passesAll()` applique les règles dures puis compare l'indice de co-joueurs de la grille complète au seuil du cœur
5. **Estimation Monte Carlo** — 50 000 combinaisons testées par tranches (thread principal jamais bloqué), résultat mémoïsé par jeu
6. **Rendu** — Toutes les sections sont recalculées au changement de jeu

> [!IMPORTANT]
> La couverture du cœur (70 / 80 / 90 %) est un choix de confort, pas une probabilité de gain : élargir le cœur fait tomber plus de tirages dedans mais accepte des grilles plus partagées (compté aux gagnants à 5 numéros, en EM : −14 % de co-joueurs à 70 %, −11 % à 80 %, −7 % à 90 % ; au LOTO −25 / −22 / −16 %). Le portefeuille contre-tendance, lui, prend les grilles les moins jouées du cœur quelle que soit la couverture.
