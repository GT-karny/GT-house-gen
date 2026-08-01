import './store-fonts.css';
import { drawPilotBrand, PILOT_BRANDS, type StoreSignRole } from './viewer/sign-brands';

const PROOFS: ReadonlyArray<{ role: StoreSignRole; width: number; height: number }> = [
  { role: 'fascia', width: 1200, height: 180 },
  { role: 'wall', width: 800, height: 260 },
  { role: 'pylon', width: 360, height: 560 },
  { role: 'blade', width: 240, height: 560 },
  { role: 'rooftop', width: 800, height: 260 },
];

async function renderProofs(): Promise<void> {
  await Promise.all([
    document.fonts.load('900 32px "Zen Kaku Gothic New"', 'くらし館ホームセンター'),
    document.fonts.load('800 32px "M PLUS Rounded 1c"', 'まちポート'),
    document.fonts.load('400 32px "Dela Gothic One"', 'グリルバンズ'),
    document.fonts.load('400 32px "Dela Gothic Latin"', 'GRILL BUNS'),
  ]);
  const root = document.getElementById('proofs');
  if (!root) return;

  for (const brand of PILOT_BRANDS) {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    title.textContent = `${brand.name} / ${brand.latin}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `ID ${brand.id} · ${brand.category} · ${brand.primary} / ${brand.secondary}`;
    const grid = document.createElement('div');
    grid.className = 'proofs';

    for (const proof of PROOFS) {
      const figure = document.createElement('figure');
      figure.dataset.role = proof.role;
      const caption = document.createElement('figcaption');
      caption.textContent = `${proof.role} · ${proof.width}:${proof.height}`;
      const canvas = document.createElement('canvas');
      canvas.width = proof.width;
      canvas.height = proof.height;
      const ctx = canvas.getContext('2d');
      if (ctx) drawPilotBrand(ctx, proof.width, proof.height, brand.id, proof.role);
      figure.append(caption, canvas);
      grid.append(figure);
    }

    section.append(title, meta, grid);
    root.append(section);
  }
}

void renderProofs();
