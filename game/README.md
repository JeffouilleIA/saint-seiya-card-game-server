# Chevalier TCG — Prototype V1

Jeu de cartes jouable solo dans le navigateur (Chrome), fidèle aux règles et cartes connues du projet Chevalier.

## Lancer en local

Les modules ES nécessitent un petit serveur HTTP (pas `file://` direct).

### Raccourci Windows

- Double-clic sur **`Lancer Chevalier.bat`** (dans ce dossier)
- Ou double-clic sur **`Chevalier TCG`** sur le bureau
- Pour recréer le raccourci bureau : clic droit PowerShell → `.\creer-raccourci-bureau.ps1`

Chrome s'ouvre sur **http://localhost:8080**. Fermez la fenêtre **Chevalier TCG - Serveur** pour arrêter.

### Ligne de commande

```bash
node server.js
```

## Fichiers

| Fichier | Rôle |
|---------|------|
| `data/cards.json` | Données cartes (format JSON que vous éditez) |
| `cards.js` | Charge le JSON + normalise pour le jeu |
| `effects.js` | Résolution des effets d'attaques / talents |
| `rules.js` | Règles et hypothèses provisoires (à modifier) |
| `engine.js` | Moteur de partie |
| `ui.js` | Interface et rendu des cartes |
| `app.js` | Point d'entrée |
| `assets/cards/` | Images des cartes (PNG recommandé, même nom que dans `cards.js`) |

## Images des cartes

Placez vos visuels dans `assets/cards/` avec le nom indiqué dans `data/cards.json` (champ `image`), par exemple :

- `andromede-noir.jpg`
- `20260520_080900.jpg` (Ikki du Phénix)
- etc.

Pour ajouter ou modifier une carte, éditez **`data/cards.json`** puis rechargez le jeu (`Ctrl+F5`).

Sans image, un fond illustratif par carte s'affiche automatiquement.

## Vocabulaire

- cosmo / cosmo ardent
- effet 1, effet 2, effet 3
- Récompense, retraite, énergie attachée
