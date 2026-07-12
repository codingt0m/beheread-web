# Beheread Web

Liseuse de mangas `.cbz` **100 % côté client**. Un fichier ouvert (local ou
depuis Google Drive) est décompressé directement dans le navigateur (via
[JSZip](https://stuk.github.io/jszip/)) : **aucun upload vers un serveur
tiers**, aucun backend applicatif, aucune fonction serverless. Idéal pour un
hébergement statique sur Vercel sans risque de saturer la bande passante.

Deux modes :

- **Fichier local** : glisser-déposer ou ouvrir un `.cbz`/`.zip`, exactement
  comme avant — session éphémère, rien n'est conservé au-delà des
  préférences de lecture (localStorage).
- **Bibliothèque Google Drive** *(optionnel)* : connecte un dossier Drive
  contenant vos archives, et persiste la progression de lecture, le
  regroupement par série et un cache de métadonnées (auteur/année via
  AniList/MangaDex) dans l'`appDataFolder` privé de l'application — la
  bibliothèque et la progression suivent alors l'utilisateur d'un appareil
  à l'autre. Voir "Connexion Google Drive" plus bas pour la configuration.

## Stack

- React 18 + Vite (SPA statique)
- JSZip (extraction ZIP/CBZ en mémoire)
- Google Identity Services + Google Picker + API Drive v3 (mode bibliothèque
  Drive uniquement, chargés à la demande) — aucun SDK npm, juste `fetch`

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
  main.jsx        Point d'entree, monte <App />
  App.jsx          Ecran de choix (local / Drive) + machine a etats bibliotheque/liseuse
  Library.jsx      Bibliotheque Drive : scan du dossier, recherche, regroupement par serie
  Reader.jsx       Liseuse (ecran d'accueil local integre, ou pilotee par App via `initialSource`)
  lib/
    entries.js         Tri naturel des noms de page + filtrage des entrees d'archive utiles
    prefs.js            Lecture/ecriture des preferences utilisateur dans localStorage
    pagination.js       Logique de pagination (planches doubles, appariement, recul/avance)
    layout.js           Calcul de la taille et position des pages affichees (ajustement, zoom)
    fingerprint.js       Empreinte de contenu (sha1 taille+debut), portage de storage.py
    series.js            Detection heuristique serie/tome a partir du nom de fichier (portage de series.py)
    comicInfo.js         Lecture de ComicInfo.xml dans une archive deja chargee par JSZip
    textSimilarity.js    Similarite de chaines (Ratcliff/Obershelp) pour le matching de titres
    throttle.js          Delai minimal entre requetes par source de metadonnees
    metadataSources/     Clients fetch pour Google Books, AniList, MangaDex (portage 1:1 des clients Python)
    metadata.js           Cascade de metadonnees (ComicInfo -> Google Books -> AniList -> MangaDex)
    googleAuth.js         Connexion Google (Identity Services), scopes drive.file + drive.appdata
    drive.js              Client REST Drive v3 : listage recursif, telechargement, appDataFolder, Picker
    indexedDbCache.js     Mini wrapper IndexedDB (miroir local des JSON de l'appDataFolder)
    store.js              Persistance cloud (progression/parametres/cache meta), ecritures differees
    libraryDrive.js        Dedup + regroupement par serie + tome suivant, a partir du listage Drive
```

La logique metier pure (sans dependance au DOM ni a React) vit dans `src/lib/`
et est couverte par des tests unitaires. `Reader.jsx`, `Library.jsx` et
`App.jsx` restent les seuls endroits qui touchent l'etat React, le DOM et les
evenements ; ils delegent les calculs a `src/lib/`.

## Connexion Google Drive (optionnelle)

Le mode "fichier local" fonctionne sans aucune configuration. Pour activer
la bibliotheque Drive, il faut creer les identifiants dans un projet Google
Cloud (etape manuelle, a faire une seule fois) :

1. Sur [console.cloud.google.com](https://console.cloud.google.com), creer
   (ou reutiliser) un projet, puis activer **Google Drive API** et
   **Google Picker API** (menu "APIs & Services" > "Library").
2. Configurer l'ecran de consentement OAuth ("OAuth consent screen") :
   type "External" suffit pour un usage personnel (ajoutez votre compte
   comme "Test user" tant que l'app n'est pas verifiee par Google).
3. Creer un identifiant **OAuth 2.0 Client ID** de type "Web application"
   ("Credentials" > "Create Credentials"). Ajoutez l'URL de votre app
   (`http://localhost:5173` en dev, votre domaine Vercel en prod) dans
   "Authorized JavaScript origins". Copiez le Client ID.
4. Creer une **API key** ("Credentials" > "Create Credentials" > "API key"),
   et restreignez-la a l'API "Google Picker" ainsi qu'a votre/vos domaine(s)
   ("Application restrictions" > "HTTP referrers").
5. Copiez `.env.example` vers `.env.local` et renseignez
   `VITE_GOOGLE_CLIENT_ID` et `VITE_GOOGLE_API_KEY`. Sur Vercel, ajoutez ces
   deux variables dans "Project Settings" > "Environment Variables".

Sans ces variables, le bouton "Se connecter a Google Drive" reste masque et
l'app se comporte exactement comme avant (mode local uniquement).

**Portee actuelle du mode Drive** (limitations connues, evolutions possibles
mais hors perimetre de cette premiere version) :

- Seuls `.cbz`/`.zip`/`.epub` sont geres (pas de CBR/RAR : aucune
  bibliotheque JS d'extraction RAR fiable cote navigateur, contrairement au
  bureau qui s'appuie sur un outil externe).
- Pas de vignette de couverture dans la bibliotheque (il faudrait telecharger
  chaque archive rien que pour lister le dossier) : un espace reserve
  affiche le numero de tome et l'auteur si connu.
- Un seul dossier racine Drive a la fois (le bureau gere plusieurs dossiers
  sources).
- Le jeton d'acces Google expire au bout d'environ une heure ; une
  reconnexion silencieuse est tentee au chargement de la page, mais une
  session Drive tres longue peut necessiter de se reconnecter.

## Tests

```bash
npm test           # execute la suite de tests unitaires (Vitest)
```

Les tests couvrent `src/lib/` : tri naturel des pages, filtrage des archives,
persistance des preferences, logique de pagination (planches doubles,
appariement, decalage de parite), calcul de la disposition (ajustement,
zoom, mode manga), detection serie/tome, cascade de metadonnees et
persistance cloud (debounce, resolution du sens de lecture, dedup/
regroupement de la bibliotheque).

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
