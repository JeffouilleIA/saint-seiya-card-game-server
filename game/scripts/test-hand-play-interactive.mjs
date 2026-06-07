/**
 * Regression guard: player active must stay targetable in main phase for hand plays.
 * node scripts/test-hand-play-interactive.mjs
 */

function playerActiveInteractive(flags) {
  const {
    huitiemeSensActiveClickable,
    kanonSanctuaryActiveClickable,
    pickDonDeVie,
    donDeVieClickable,
    healNextTurnClickable,
    sacrificeClickable,
    pickHealAllyNextTurn,
    pickVoluntarySacrifice,
    pickHuitiemeSensTarget,
    pickKanonSanctuaryTarget,
    pickOppOnlyBenchTarget,
  } = flags;

  return (
    (huitiemeSensActiveClickable &&
      kanonSanctuaryActiveClickable &&
      (!pickDonDeVie || donDeVieClickable)) ||
    healNextTurnClickable ||
    sacrificeClickable ||
    (!pickDonDeVie &&
      !pickHealAllyNextTurn &&
      !pickVoluntarySacrifice &&
      !pickHuitiemeSensTarget &&
      !pickKanonSanctuaryTarget &&
      !pickOppOnlyBenchTarget)
  );
}

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    failures++;
  } else {
    console.log('OK:', msg);
  }
};

const mainPhase = {
  huitiemeSensActiveClickable: true,
  kanonSanctuaryActiveClickable: true,
  pickDonDeVie: false,
  donDeVieClickable: false,
  healNextTurnClickable: false,
  sacrificeClickable: false,
  pickHealAllyNextTurn: false,
  pickVoluntarySacrifice: false,
  pickHuitiemeSensTarget: false,
  pickKanonSanctuaryTarget: false,
  pickOppOnlyBenchTarget: false,
};

assert(playerActiveInteractive(mainPhase), 'main phase: active knight is targetable');

const donDeViePick = {
  ...mainPhase,
  pickDonDeVie: true,
  donDeVieClickable: true,
};
assert(playerActiveInteractive(donDeViePick), 'donDeVie pending: valid target is clickable');

const donDeVieInvalid = {
  ...mainPhase,
  pickDonDeVie: true,
  donDeVieClickable: false,
};
assert(!playerActiveInteractive(donDeVieInvalid), 'donDeVie pending: invalid target not clickable');

const oldRegression = {
  ...mainPhase,
  pickDonDeVie: false,
  donDeVieClickable: false,
  huitiemeSensActiveClickable: true,
  kanonSanctuaryActiveClickable: true,
};
assert(
  !(
    oldRegression.huitiemeSensActiveClickable &&
    oldRegression.kanonSanctuaryActiveClickable &&
    oldRegression.donDeVieClickable
  ),
  'old regression formula blocked main phase when donDeVieClickable is false',
);
assert(playerActiveInteractive(oldRegression), 'fixed formula allows main phase targeting');

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nHand-play interactive logic tests passed.');
