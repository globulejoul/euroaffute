# EuroAffûté

**Filtres appris depuis 20 ans de tirages.**

Un outil d'analyse statistique qui télécharge l'intégralité des tirages EuroMillions, LOTO et EuroDreams depuis les archives officielles de la FDJ, en déduit des règles de distribution, et génère des grilles filtrées.

> [!NOTE]
> Cet outil n'augmente pas vos chances de gagner. Il élimine les combinaisons statistiquement improbables et privilégie les grilles "contre-tendance" pour réduire le partage en cas de gain.

## Fonctionnalités

### Trois jeux supportés

| Jeu | Boules | Complémentaire | Tirages | Depuis |
|-----|--------|----------------|---------|--------|
| EuroMillions | 5 sur 50 | 2 étoiles (1–12) | ~1 940 | fév. 2004 |
| LOTO | 5 sur 49 | 1 N° Chance (1–10) | ~2 750 | oct. 2008 |
| EuroDreams | 6 sur 40 | 1 N° Dream (1–5) | ~260 | nov. 2023 |

### Analyse statistique

- **Règles dures** — Patterns jamais observés en 20 ans (progressions arithmétiques, même dizaine, etc.)
- **Distribution cœur** — Bornes p10–p90 apprises pour la somme, le range, la parité, la couverture des dizaines
- **Seuils adaptatifs par jeu** — Gap max, paires consécutives, concentration par dizaine calibrés sur les données réelles de chaque jeu (densité 10% pour EM/LOTO vs 15% pour EuroDreams)

### Génération de grilles

- **Grille filtrée** — Combinaison aléatoire passant l'ensemble des règles apprises
- **Portefeuille cœur** — 10 grilles dans le cœur de distribution (80%+ des tirages historiques)
- **Portefeuille contre-tendance** — 10 grilles évitant les numéros populaires (dates, multiples de 7, alignements grille FDJ) pour minimiser le partage du jackpot

### Visualisations

- **Dynamique récente** — Graphique SVG des 15 derniers jackpots + estimation du prochain tirage
- **Heatmap de fréquences** — Écart à l'attendu pour chaque numéro et étoile/bonus, avec légende colorimétrique cohérente
- **Dernier tirage** — Résultat, verdict filtres, répartition des gains par rang, tests contre-tendance

### Audit de grille

Saisissez vos numéros fétiches pour vérifier :
- Passage ou rejet par chaque filtre (avec détail et pourcentage historique)
- Plus proche voisin dans l'historique
- Simulation "si j'avais joué cette grille à chaque tirage" avec bilan net

## Stack technique

- **Frontend** — HTML, CSS, JavaScript vanilla (aucun framework, aucun bundler)
- **Données** — Archives CSV officielles FDJ, converties en JSON par un script Node.js
- **Hébergement** — GitHub Pages (site statique)
- **Mises à jour** — GitHub Actions déclenché après chaque tirage (mardi/vendredi pour EM, lundi/mercredi/samedi pour LOTO, lundi/jeudi pour ED)

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
```

Le script télécharge les archives ZIP depuis l'API FDJ, extrait les CSV, parse les tirages et génère les fichiers `data/*.json`.

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

Les jackpots en temps réel sont scrapés depuis [fdj.fr](https://www.fdj.fr), [secretsdujeu.com](https://www.secretsdujeu.com) et [euro-millions.com](https://www.euro-millions.com) via proxies CORS.

## Architecture

```
euroaffute/
├── index.html              # Application complète (HTML + JS inline)
├── css/
│   ├── common.css          # Styles partagés, design system, spacing tokens
│   ├── euromillions.css    # Thème EuroMillions (bleu/or)
│   ├── loto.css            # Thème LOTO (bleu/rouge)
│   └── eurodreams.css      # Thème EuroDreams (violet/rose)
├── data/
│   ├── euromillions.json   # ~1 940 tirages
│   ├── loto.json           # ~2 750 tirages
│   └── eurodreams.json     # ~260 tirages
├── scripts/
│   └── update-data.js      # Pipeline de téléchargement et parsing FDJ
└── .github/
    └── workflows/
        └── update-data.yml # Scheduler GitHub Actions
```

## Comment ça marche

1. **Chargement** — Le JSON du jeu sélectionné est chargé et parsé côté client
2. **Apprentissage** — `learnFilters()` analyse l'intégralité des tirages pour extraire des seuils statistiques (quantiles, fréquences, patterns rares)
3. **Filtrage** — `passesAll()` applique les règles apprises pour accepter ou rejeter une combinaison
4. **Estimation Monte Carlo** — 50 000 combinaisons aléatoires testées pour estimer le taux de survie des filtres
5. **Rendu** — Toutes les sections (règles, fréquences, gains, timeline) sont recalculées à chaque changement de jeu

> [!IMPORTANT]
> Les seuils sont **adaptatifs par jeu**. EuroDreams (6 boules sur 40, densité 15%) utilise des seuils différents d'EuroMillions (5 boules sur 50, densité 10%) — par exemple, 3 numéros consécutifs sont acceptés en EuroDreams (3.9% des tirages) mais rejetés en EuroMillions (2.4%).
