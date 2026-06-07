Attack voice + SFX (synthetic, original)

Files in attacks/:
  seiya_meteores.wav   — "Par les Météores de Pégase !"
  shiryu_dragon.wav    — "Colère du Dragon !"
  hyoga_diamond_dust.wav — "Poussière de Diamant !"

Generation (Node — preferred on this machine):
  npm install
  npm run generate:attack-audio

Alternate (Python, if installed + ffmpeg for MP3):
  pip install edge-tts numpy pydub
  python scripts/generate_attack_voices.py

Method:
  - Voice: Microsoft Edge TTS (fr-FR-HenriNeural), rate boosted, trimmed/time-stretched to ≤1s
  - SFX: procedural waveforms (sweeps, noise, impacts, ice) mixed under voice
  - No copyrighted samples or external sound libraries

Regenerate after editing scripts/generate-attack-voices.mjs
