# Railway — déployer le multijoueur (`chevalier-multi`)

Checklist en une page pour servir **Chevalier TCG multijoueur** sur Railway depuis la branche **`chevalier-multi`** — sans fusionner dans `main`.

Dépôt GitHub : [JeffouilleIA/saint-seiya-card-game-server](https://github.com/JeffouilleIA/saint-seiya-card-game-server)

---

## Prérequis

| Élément | Attendu |
|--------|---------|
| Plan Railway | **Hobby** (ou supérieur) — déploiement depuis branche autre que `main` |
| Branche Git | `chevalier-multi` poussée sur `origin` |
| Fichiers repo | `railway.toml`, `package.json`, `server.js`, dossier `./game/` |
| CLI (optionnel) | `npx @railway/cli` + `railway login` |

---

## 1. Vérifier la branche GitHub

```powershell
cd saint-seiya-card-game-server
git fetch origin
git checkout chevalier-multi
git status
# → "Your branch is up to date with 'origin/chevalier-multi'"
git ls-remote origin chevalier-multi
```

Branche distante attendue : `refs/heads/chevalier-multi` (commit multijoueur, ex. lobby Socket.io).

---

## 2. Config repo (déjà en place sur `chevalier-multi`)

**`railway.toml`**

- `buildCommand` : `npm run build`
- `startCommand` : `npm start`
- `healthcheckPath` : `/health`
- `healthcheckTimeout` : 120 s

**`package.json`**

- `start` → `node server.js`
- `build` → `node scripts/sync-game.mjs`
- Dépendance `socket.io`

**`/health`** (`server.js`) doit retourner :

- `"multiplayer": true`
- `"gitBranch": "chevalier-multi"` (ou `RAILWAY_GIT_BRANCH` / `GIT_BRANCH`)
- `"socketio": true`
- `"multiplayerRooms": { ... }`
- `"railway": true` en production Railway

---

## 3. Déployer via le dashboard Railway (recommandé si CLI non connectée)

1. Ouvrir [railway.app](https://railway.app) → projet **saint-seiya-card-game-server** (ou **New Project**).
2. **Service web** → **Settings** → **Source** :
   - Repo : `JeffouilleIA/saint-seiya-card-game-server`
   - **Branch** : `chevalier-multi` (remplacer `main` si besoin)
   - Root directory : `/` (racine du repo)
3. **Settings** → **Build** : laisser Nixpacks lire `railway.toml` (`npm run build` puis `npm start`).
4. **Settings** → **Networking** → **Generate Domain** (si aucune URL publique).
5. **Deployments** → **Deploy** (ou push sur `chevalier-multi` pour déclencher un build auto).
6. Attendre build + healthcheck `/health` vert.

### Variables d'environnement (optionnel)

| Variable | Valeur | Effet |
|----------|--------|--------|
| `GIT_BRANCH` | `chevalier-multi` | Affichée dans `/health` si Railway ne la fournit pas |
| `PORT` | *(auto Railway)* | Ne pas fixer manuellement sauf besoin spécifique |

Ne pas fusionner `chevalier-multi` dans `main` tant que vous voulez le multijoueur **uniquement** sur cette branche.

---

## 4. Déployer via CLI (après login)

```powershell
cd saint-seiya-card-game-server
npx @railway/cli login
npx @railway/cli link          # choisir le projet / service existant
npx @railway/cli up --detach   # déploiement depuis le répertoire courant
```

Pour forcer la branche côté GitHub : le service Railway doit déjà être configuré sur **`chevalier-multi`** (Settings → Source). La CLI déploie le code local ; assurez-vous d’être sur la bonne branche :

```powershell
git checkout chevalier-multi
git pull origin chevalier-multi
```

---

## 5. Vérifier après déploiement

### URL publique

Format Railway par défaut :

```text
https://<nom-service>.up.railway.app
```

Exemples :

- Health : `https://<nom-service>.up.railway.app/health`
- Jeu : `https://<nom-service>.up.railway.app/`

Le domaine exact est visible dans **Settings → Networking** ou dans les logs de démarrage (`Public : https://...`).

### Commande

```powershell
curl https://<nom-service>.up.railway.app/health
```

### JSON attendu (extrait)

```json
{
  "ok": true,
  "multiplayer": true,
  "gitBranch": "chevalier-multi",
  "socketio": true,
  "railway": true,
  "multiplayerRooms": {
    "roomCount": 0,
    "waiting": 0,
    "playing": 0
  }
}
```

Si `"multiplayer": false` ou `"gitBranch": "main"` → le service pointe encore sur **`main`** ; repasser la branche source à `chevalier-multi` et redéployer.

### Test fonctionnel rapide

1. Ouvrir l’URL du jeu dans deux navigateurs / onglets.
2. **Jouer en ligne** → créer une salle / rejoindre avec le code.
3. Vérifier que `/health` monte `multiplayerRooms` quand une salle existe.

---

## 6. Dépannage

| Symptôme | Action |
|----------|--------|
| Build échoue « jeu introuvable » | Vérifier que `./game/index.html` est commité sur `chevalier-multi` |
| Healthcheck timeout | Logs du service ; `npm start` doit écouter `0.0.0.0` et `PORT` |
| Ancienne version (solo) | Branch source = `main` → passer à `chevalier-multi` |
| WebSocket / lobby KO | Domaine HTTPS Railway ; pas de proxy bloquant Socket.io |

---

## Références

- Guide multijoueur complet : [MULTIPLAYER.md](./MULTIPLAYER.md)
- Branche de prod multijoueur : **`chevalier-multi`** (ne pas merger dans `main` sans décision explicite)
