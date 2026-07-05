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

## Build de production

```bash
npm run build      # genere le dossier dist/
npm run preview    # sert dist/ en local pour verification
```

## Déploiement Vercel

Le projet vit dans un sous-dossier. Sur Vercel, définir **Root Directory =
`beheread-web`**. Le framework Vite est détecté automatiquement
(build : `npm run build`, output : `dist`).
