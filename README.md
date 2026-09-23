# Inspecto
AI-powered factory visit assistant: hit record, upload photos, get a structured multilingual report in minutes. Turns field conversations into actionable intelligence.

## Contenu
- `inspecto front.html` : l'application complète (React, un seul fichier). Fonctionne hors ligne (IndexedDB) ; l'IA passe par `/api/*`.
- `mobile/index.html` : page téléphone ouverte par le QR code d'une visite pour envoyer des photos.
- `lib/ai.js` : appel du fournisseur IA (Mistral ou Anthropic, choisi d'après la clé) et transcription Voxtral.
- `server.js` : serveur local (sert l'app, l'API IA et le relais photos en mémoire).
- `netlify/functions/` : même API en Netlify Functions (`api.mjs` pour l'IA, `mobile.mjs` pour le relais photos sur Netlify Blobs).
- `demo/` : plan d'évacuation et notes de terrain de l'audit de démonstration École 42.

## Déploiement web (Netlify)
1. Connecter ce dépôt à Netlify (build `node build.mjs`, publication `site/`, déjà dans `netlify.toml`).
2. Dans *Site configuration → Environment variables*, ajouter `MISTRAL_API_KEY` (ou `ANTHROPIC_API_KEY`).
   Optionnel : `MISTRAL_QUICK` / `MISTRAL_DEFAULT` pour choisir les modèles (par défaut `ministral-14b-latest` et `pixtral-12b-2409`, qui passent sur l'offre gratuite ; avec un plan payant, `mistral-small-latest` / `mistral-medium-latest` donnent de meilleurs rapports).
3. Déployer. L'app est à la racine, la page mobile sous `/mobile`, l'API sous `/api/*`. Le QR code d'une visite pointe automatiquement vers `/mobile` du même site.

Micro et caméra exigent HTTPS (fourni par Netlify) et Edge ou Chrome pour la reconnaissance vocale.

## Lancement local
```powershell
$env:MISTRAL_API_KEY="..."        # facultatif : sans clé, capture seule (pas d'IA)
powershell -ExecutionPolicy Bypass -File .\start.ps1
```
Ouvre http://localhost:3000 ; la page mobile est sur `http://<ip-du-pc>:3000/mobile` pour un téléphone sur le même Wi-Fi.
Node portable : `~/node/node.exe` est utilisé si `node` n'est pas dans le PATH. `--use-system-ca` fait accepter les certificats du proxy d'entreprise.
