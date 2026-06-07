/**
 * Répare le texte français affiché (mojibake UTF-8 / caractères de remplacement legacy).
 * Utilisé à l'affichage des bannières et messages de jeu.
 */
const MOJIBAKE_REPLACEMENTS = [
  ['Ã©', 'é'], ['Ã¨', 'è'], ['Ãª', 'ê'], ['Ã«', 'ë'],
  ['Ã‰', 'É'], ['Ãˆ', 'È'], ['ÃŠ', 'Ê'], ['Ã‹', 'Ë'],
  ['Ã ', 'à'], ['Ã¢', 'â'], ['Ã¤', 'ä'],
  ['Ã§', 'ç'], ['Ã®', 'î'], ['Ã¯', 'ï'],
  ['Ã´', 'ô'], ['Ã¶', 'ö'],
  ['Ã¹', 'ù'], ['Ã»', 'û'], ['Ã¼', 'ü'],
  ['â€™', "'"], ['â€œ', '"'], ['â€\u009d', '"'],
  ['â€"', '—'], ['â€"', '–'], ['â€¦', '…'],
  ['Â«', '«'], ['Â»', '»'],
];

const LEGACY_REPAIRS = [
  [/Entra\uFFFDnement/g, 'Entraînement'],
  [/carte \uFFFDnergie/g, 'carte Énergie'],
  [/ajoutez la \uFFFD un/g, 'ajoutez-la à un'],
  [/\uFFFDchangez/g, 'Échangez'],
  [/d\uFFFDg\uFFFDt/g, 'dégâts'],
  [/d\uFFFDg\uFFFDts/g, 'dégâts'],
  [/sp\uFFFDciaux/g, 'spéciaux'],
  [/D\uFFFDfaussez/g, 'Défaussez'],
  [/D\uFFFDbut/g, 'Début'],
  [/D\uFFFDfaite/g, 'Défaite'],
  [/annul\uFFFDe/g, 'annulée'],
  [/cartes \uFFFDnergies/g, 'cartes Énergies'],
  [/\uFFFDnergie/g, 'Énergie'],
  [/pr\uFFFDf\uFFFDr/g, 'préfér'],
  [/r\uFFFDcompense/g, 'Récompense'],
  [/r\uFFFDduit/g, 'réduit'],
  [/r\uFFFDduction/g, 'réduction'],
  [/r\uFFFDussi/g, 'réussi'],
  [/r\uFFFDv\uFFFDl/g, 'révél'],
  [/d\uFFFDj\uFFFD/g, 'déjà'],
  [/d\uFFFDsactiv/g, 'désactiv'],
  [/g\uFFFDn\uFFFDr/g, 'génér'],
  [/t\uFFFDl\uFFFDport/g, 'téléport'],
  [/attach\uFFFD/g, 'attaché'],
  [/jou\uFFFD/g, 'joué'],
  [/soign\uFFFD/g, 'soigné'],
  [/empoisonn\uFFFD/g, 'empoisonné'],
  [/paralys\uFFFD/g, 'paralysé'],
  [/gel\uFFFD/g, 'gelé'],
  [/alli\uFFFD/g, 'allié'],
  [/Ath\uFFFDna/g, 'Athéna'],
  [/\uFFFDchange/g, 'échange'],
  [/pr\uFFFDc\uFFFDdent/g, 'précédent'],
  [/suppl\uFFFDmentaire/g, 'supplémentaire'],
  [/s\uFFFDlection/g, 'sélection'],
  [/r\uFFFDpart/g, 'répart'],
];

const MOJIBAKE_HINT = /Ã.|â€|Â«|Â»|\uFFFD/;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function repairFrenchDisplayText(value) {
  if (value == null) return '';
  if (typeof value !== 'string') return String(value);
  if (!MOJIBAKE_HINT.test(value)) return value;

  let out = value;
  for (const [bad, good] of MOJIBAKE_REPLACEMENTS) {
    if (out.includes(bad)) out = out.split(bad).join(good);
  }
  for (const [pattern, replacement] of LEGACY_REPAIRS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
