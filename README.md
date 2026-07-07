# Beheread Web

Liseuse de mangas `.cbz` **100 % côté client**. Le fichier choisi par
l'utilisateur est décompressé directement dans le navigateur (via
[JSZip](https://stuk.github.io/jszip/)) : **aucun upload**, aucun backend,
aucune fonction serverless. Idéal pour un hébergement statique sur Vercel
sans risque de saturer la bande passante.

## Stack

- React 18 + Vite (SPA statique)
- JSZip (extraction ZIP/CBZ en mémoire)

## Développement local

```bash
cd beheread-web
npm install
npm run dev
```

Ouvre l'URL affichée (par défaut http://localhost:5173).

## Architecture

```
src/
  main.jsx        Point d'entree, monte <Reader /> dans le DOM
  Reader.jsx       Composant unique : ecran d'accueil + liseuse (etat React, evenements clavier/souris/molette)
  lib/
    entries.js     Tri naturel des noms de page + filtrage des entrees d'archive utiles
    prefs.js       Lecture/ecriture des preferences utilisateur dans localStorage
    pagination.js  Logique de pagination (planches doubles, appariement, recul/avance)
    layout.js      Calcul de la taille et position des pages affichees (ajustement, zoom)
```

La logique metier pure (sans dependance au DOM ni a React) vit dans `src/lib/`
et est couverte par des tests unitaires. `Reader.jsx` reste le seul endroit
qui touche l'etat React, le DOM et les evenements ; il delegue les calculs a
`src/lib/`.

## Tests

```bash
npm test           # execute la suite de tests unitaires (Vitest)
```

Les tests couvrent `src/lib/` : tri naturel des pages, filtrage des archives,
persistance des preferences, logique de pagination (planches doubles,
appariement, decalage de parite) et calcul de la disposition (ajustement,
zoom, mode manga).

## Raccourcis clavier

| Touche(s)                    | Action                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| `↓` / `Espace`                 | Page suivante                                                |
| `↑` / `Retour arriere`         | Page precedente                                              |
| `→` / `←`                      | Page suivante/precedente (sens selon mode manga)              |
| `Page suivante` / `Page precedente` | Avance/recule d'une seule page (ignore le mode double page)   |
| `Origine` / `Fin`             | Premiere / derniere page                                     |
| `D`                           | Bascule simple page / double page                             |
| `M`                           | Bascule sens de lecture (manga ↔ normal)                     |
| `S`                           | Decale la parite des paires de pages                          |
| `F`                           | Change le mode d'ajustement (fenetre/largeur/hauteur)          |
| `+` / `-` / `0`               | Zoom avant / arriere / reinitialisation                        |
| `F11`                         | Plein ecran                                                   |
| `Echap`                       | Quitte le plein ecran, sinon ferme le fichier                 |
| Molette                       | Page suivante/precedente (`Ctrl` + molette = zoom)             |
| Clic zone gauche/droite       | Page precedente/suivante (sens selon mode manga)               |
| Glisser-deposer sur la page   | Deplace la vue quand elle deborde (zoom > ajustement)          |

## Build de production

```bash
npm run build      # genere le dossier dist/
npm run preview    # sert dist/ en local pour verification
```

## Déploiement Vercel

Le projet vit dans un sous-dossier. Sur Vercel, définir **Root Directory =
`beheread-web`**. Le framework Vite est détecté automatiquement
(build : `npm run build`, output : `dist`).
