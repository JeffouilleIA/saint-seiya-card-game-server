# Multijoueur internet (Chevalier TCG)

Branche de déploiement recommandée : **`chevalier-multi`** (client + serveur).

## Architecture

- **Hôte (siège 0)** : moteur autoritaire, envoie l’état via `mp:state`.
- **Invité (siège 1)** : affichage + saisie ; chaque action est relayée (`mp:action` → `engineCall` sur l’hôte).
- **Serveur** : lobby Socket.io, stockage du dernier état pour reconnexion (15 min).

## Tester en local

### 1. Serveur

```bash
cd saint-seiya-card-game-server
npm install
npm start
```

Le jeu est servi sur `http://127.0.0.1:3000` (dossier `./game` ou Chevalier1 adjacent).

Vérifier : `http://127.0.0.1:3000/health` → `"multiplayer": true`, `"gitBranch": "chevalier-multi"`.

### 2. Deux onglets

1. Onglet A : **Jouer en ligne** → Créer une salle → choisir deck → Prêt → Lancer.
2. Onglet B : **Jouer en ligne** → Rejoindre avec le code → deck → Prêt.
3. Jouer quelques tours (fin de tour, banc, attaque, talent si possible).

### 3. Reconnexion

1. Fermer l’onglet invité en pleine partie.
2. Rouvrir → **Jouer en ligne** → **Reprendre la partie** (session mémorisée).
3. L’hôte voit « adversaire de retour » ; l’état reprend où il en était.

## Déployer sur Railway (branche `chevalier-multi`)

1. Ouvrir le projet **saint-seiya-card-game-server** sur [Railway](https://railway.app).
2. Service web → **Settings** → **Source** → **Branch** : choisir `chevalier-multi` (au lieu de `main`).
3. Variables utiles (optionnel) :
   - `GIT_BRANCH=chevalier-multi` (affichée dans `/health`)
4. Le fichier `railway.toml` à la racine configure :
   - `buildCommand`: `npm run build` (copie Chevalier1 → `./game` si présent en CI, sinon `./game` du repo)
   - `healthcheckPath`: `/health`
5. Redéployer après push sur `chevalier-multi`.

### Vérifier le déploiement

```bash
curl https://VOTRE-DOMAINE.railway.app/health
```

Attendu :

```json
{
  "ok": true,
  "multiplayer": true,
  "gitBranch": "chevalier-multi",
  "multiplayerRooms": { "roomCount": 0, "waiting": 0, "playing": 0 }
}
```

## Synchroniser le client Chevalier1

Après modification du jeu dans Chevalier1 :

```bash
cd saint-seiya-card-game-server
npm run sync-game
```

Ou pousser les mêmes fichiers sur la branche `chevalier-multi` des **deux** dépôts (le serveur embarque `./game/`).

## Limitations connues

- **Animations** : l’invité ne rejoue pas toutes les animations de l’hôte (sync d’état uniquement).
- **Hôte déconnecté** : la partie est en pause côté invité ; reconnexion hôte via « Reprendre la partie ».
- **Relance** : seul l’hôte peut relancer après fin de partie.
- **Spectateur / 3+ joueurs** : non supporté.
- **Anti-triche** : validation minimale côté serveur (siège invité uniquement) ; l’hôte reste autoritaire.
