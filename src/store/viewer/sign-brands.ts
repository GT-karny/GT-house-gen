/**
 * Viewer-only brand artwork for Japanese roadside stores.
 *
 * A brand owns its palette, voice and vector mark here. Physical placement stays
 * in `store/gen`, while cabinets and materials stay in the viewer. Canvas is only
 * the final rasterisation step for a GPU texture; the source artwork below is
 * resolution-independent geometry and live type.
 */

export type StoreSignRole = 'fascia' | 'wall' | 'pylon' | 'blade' | 'rooftop' | 'square' | 'menu';

export interface PilotBrandSpec {
  id: number;
  name: string;
  shortName: string;
  category: string;
  latin: string;
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  casing: string;
  font: string;
  weight: number;
}

const KAKU = '"Zen Kaku Gothic New", "Yu Gothic", sans-serif';
const ROUNDED = '"M PLUS Rounded 1c", "Yu Gothic", sans-serif';
const DISPLAY = '"Dela Gothic Latin", "Dela Gothic One", "Yu Gothic", sans-serif';

/** The three reference-quality brands used to validate the authoring process. */
export const PILOT_BRANDS: readonly PilotBrandSpec[] = [
  {
    id: 2, name: 'くらし館', shortName: 'くらし館', category: 'ホームセンター', latin: 'KURASHIKAN',
    primary: '#d95d24', secondary: '#1d3138', accent: '#f0b13d', surface: '#f2eadb', casing: '#252d30',
    font: KAKU, weight: 900,
  },
  {
    id: 3, name: 'まちポート', shortName: 'まち', category: 'コンビニエンスストア', latin: 'MACHI PORT',
    primary: '#165ca8', secondary: '#2f9b61', accent: '#35a7cf', surface: '#f8faf8', casing: '#d8dedd',
    font: ROUNDED, weight: 800,
  },
  {
    id: 7, name: 'グリルバンズ', shortName: 'バンズ', category: 'BURGERS & CAFE', latin: 'GRILL BUNS',
    primary: '#8e2830', secondary: '#e1a637', accent: '#f7ead0', surface: '#fbf1dc', casing: '#34272a',
    font: DISPLAY, weight: 400,
  },
] as const;

export function pilotBrandFor(id: number): PilotBrandSpec | undefined {
  return PILOT_BRANDS.find((brand) => brand.id === id);
}

type Ctx = CanvasRenderingContext2D;

function fontToFit(ctx: Ctx, text: string, maxWidth: number, startPx: number, font: string, weight: number): number {
  let px = startPx;
  while (px > 12) {
    ctx.font = `${weight} ${px}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) return px;
    px -= 2;
  }
  return 12;
}

function roundedRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBeamK(ctx: Ctx, cx: number, cy: number, size: number, ink: string, ground: string): void {
  ctx.fillStyle = ground;
  roundedRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.12);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.lineWidth = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.22, cy - size * 0.29);
  ctx.lineTo(cx - size * 0.22, cy + size * 0.29);
  ctx.moveTo(cx - size * 0.12, cy);
  ctx.lineTo(cx + size * 0.25, cy - size * 0.29);
  ctx.moveTo(cx - size * 0.12, cy);
  ctx.lineTo(cx + size * 0.3, cy + size * 0.29);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fillRect(cx - size * 0.34, cy + size * 0.32, size * 0.68, size * 0.08);
}

function drawMachiGate(ctx: Ctx, cx: number, cy: number, size: number, blue: string, green: string): void {
  ctx.fillStyle = blue;
  roundedRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.24);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  const stem = size * 0.14;
  ctx.fillRect(cx - size * 0.27, cy - size * 0.18, stem, size * 0.42);
  ctx.fillRect(cx + size * 0.13, cy - size * 0.18, stem, size * 0.42);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.27, cy - size * 0.17);
  ctx.lineTo(cx, cy + size * 0.08);
  ctx.lineTo(cx + size * 0.27, cy - size * 0.17);
  ctx.lineTo(cx + size * 0.27, cy + size * 0.02);
  ctx.lineTo(cx, cy + size * 0.27);
  ctx.lineTo(cx - size * 0.27, cy + size * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = green;
  ctx.beginPath(); ctx.arc(cx, cy + size * 0.27, size * 0.075, 0, Math.PI * 2); ctx.fill();
}

function drawBunMark(ctx: Ctx, cx: number, cy: number, size: number, bun: string, filling: string): void {
  ctx.fillStyle = bun;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.43, cy - size * 0.03);
  ctx.bezierCurveTo(cx - size * 0.37, cy - size * 0.42, cx + size * 0.37, cy - size * 0.42, cx + size * 0.43, cy - size * 0.03);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = filling;
  roundedRect(ctx, cx - size * 0.43, cy + size * 0.04, size * 0.86, size * 0.12, size * 0.05); ctx.fill();
  ctx.fillStyle = bun;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.43, cy + size * 0.23);
  ctx.quadraticCurveTo(cx, cy + size * 0.43, cx + size * 0.43, cy + size * 0.23);
  ctx.lineTo(cx + size * 0.38, cy + size * 0.08);
  ctx.lineTo(cx - size * 0.38, cy + size * 0.08);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = filling; ctx.lineWidth = size * 0.035; ctx.lineCap = 'round';
  for (const sx of [-0.18, 0, 0.18]) {
    ctx.beginPath();
    ctx.moveTo(cx + size * sx - size * 0.035, cy - size * 0.2);
    ctx.lineTo(cx + size * sx + size * 0.035, cy - size * 0.25);
    ctx.stroke();
  }
}

function drawCategory(ctx: Ctx, text: string, x: number, y: number, px: number, colour: string, align: CanvasTextAlign = 'left'): void {
  ctx.fillStyle = colour; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.font = `800 ${px}px ${KAKU}`; ctx.fillText(text, x, y);
}

function horizontalRole(role: StoreSignRole): boolean {
  return role === 'fascia' || role === 'wall' || role === 'rooftop';
}

function centeredFit(ctx: Ctx, text: string, w: number, y: number, maxWidth: number, startPx: number, font: string, weight: number, colour: string): void {
  ctx.fillStyle = colour; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fontToFit(ctx, text, maxWidth, startPx, font, weight);
  ctx.fillText(text, w / 2, y);
}

function panelGap(ctx: Ctx, w: number, y: number, h: number, colour = '#273137'): void {
  ctx.fillStyle = colour; ctx.fillRect(0, y, w, h);
}

/** Roadside pylons use large copy in stacked cabinets, matching Japanese stores. */
function drawKurashikanPylon(ctx: Ctx, w: number, h: number, b: PilotBrandSpec): void {
  // Old Japanese home-centre pylons read as three separate cabinets: an iconic
  // top field, an oversized name panel and a simple merchandise panel below.
  ctx.fillStyle = b.secondary; ctx.fillRect(0, 0, w, h * 0.46);
  drawBeamK(ctx, w / 2, h * 0.23, Math.min(w * 0.75, h * 0.37), b.primary, b.surface);
  panelGap(ctx, w, h * 0.46, h * 0.018);
  ctx.fillStyle = b.surface; ctx.fillRect(0, h * 0.478, w, h * 0.285);
  centeredFit(ctx, b.name, w, h * 0.62, w * 0.96, h * 0.22, b.font, b.weight, b.primary);
  panelGap(ctx, w, h * 0.763, h * 0.018);
  ctx.fillStyle = b.primary; ctx.fillRect(0, h * 0.781, w, h * 0.219);
  centeredFit(ctx, 'DIY・園芸・資材', w, h * 0.89, w * 0.96, h * 0.14, b.font, b.weight, b.surface);
}

function drawMachiPortPylon(ctx: Ctx, w: number, h: number, b: PilotBrandSpec): void {
  ctx.fillStyle = b.secondary; ctx.fillRect(0, 0, w, h * 0.265);
  ctx.fillStyle = b.surface; ctx.fillRect(0, h * 0.265, w, h * 0.335);
  const mark = h * 0.14;
  ctx.fillStyle = b.primary; ctx.textBaseline = 'middle';
  const namePx = fontToFit(ctx, b.name, w - mark - w * 0.06, h * 0.19, b.font, b.weight);
  ctx.font = `${b.weight} ${namePx}px ${b.font}`;
  const wordW = ctx.measureText(b.name).width;
  const total = mark + h * 0.025 + wordW;
  const left = (w - total) / 2;
  drawMachiGate(ctx, left + mark / 2, h * 0.43, mark, b.primary, b.secondary);
  ctx.fillStyle = b.primary; ctx.textAlign = 'left';
  ctx.fillText(b.name, left + mark + h * 0.025, h * 0.43);
  ctx.fillStyle = b.accent; ctx.fillRect(0, h * 0.57, w, h * 0.03);

  panelGap(ctx, w, h * 0.6, h * 0.018);
  ctx.fillStyle = b.primary; ctx.fillRect(0, h * 0.618, w, h * 0.174);
  centeredFit(ctx, '酒・たばこ', w, h * 0.705, w * 0.96, h * 0.13, KAKU, 900, '#ffffff');
  panelGap(ctx, w, h * 0.792, h * 0.018);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, h * 0.81, w, h * 0.19);
  centeredFit(ctx, '銀行ATM', w, h * 0.905, w * 0.96, h * 0.145, KAKU, 900, b.primary);
}

function drawGrillBunsPylon(ctx: Ctx, w: number, h: number, b: PilotBrandSpec): void {
  ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, h);
  // The pylon mark is deliberately wider than the compact square emblem used
  // elsewhere, so its silhouette consumes the road-facing panel like a real sign.
  ctx.save();
  ctx.translate(w / 2, h * 0.22);
  ctx.scale(1.45, 1);
  drawBunMark(ctx, 0, 0, w * 0.68, b.accent, b.secondary);
  ctx.restore();
  centeredFit(ctx, b.name, w, h * 0.49, w * 0.96, h * 0.19, b.font, b.weight, b.accent);
  panelGap(ctx, w, h * 0.61, h * 0.018, b.casing);
  ctx.fillStyle = b.secondary; ctx.fillRect(0, h * 0.628, w, h * 0.18);
  centeredFit(ctx, 'ドライブスルー', w, h * 0.718, w * 0.96, h * 0.13, KAKU, 900, b.primary);
  panelGap(ctx, w, h * 0.808, h * 0.018, b.casing);
  ctx.fillStyle = b.surface; ctx.fillRect(0, h * 0.826, w, h * 0.174);
  centeredFit(ctx, 'お持ち帰り', w, h * 0.913, w * 0.96, h * 0.13, KAKU, 900, b.primary);
}

function drawKurashikan(ctx: Ctx, w: number, h: number, b: PilotBrandSpec, role: StoreSignRole): void {
  if (role === 'pylon') { drawKurashikanPylon(ctx, w, h, b); return; }
  const horizontal = horizontalRole(role);
  ctx.fillStyle = horizontal ? b.secondary : b.surface; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b.primary; ctx.fillRect(0, horizontal ? h * 0.86 : h * 0.9, w, h * 0.14);
  if (horizontal) {
    const mark = h * 0.64, left = Math.max(w * 0.055, (w - Math.min(w * 0.78, h * 5.1)) / 2);
    drawBeamK(ctx, left + mark / 2, h * 0.44, mark, b.primary, b.surface);
    ctx.fillStyle = b.surface; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    fontToFit(ctx, b.name, w - left - mark - h * 0.35, h * 0.52, b.font, b.weight);
    ctx.fillText(b.name, left + mark + h * 0.22, h * 0.48);
    if (w / h > 4.2) drawCategory(ctx, `${b.category}  ${b.latin}`, left + mark + h * 0.24, h * 0.18, h * 0.095, b.accent);
  } else {
    const mark = Math.min(w * 0.68, h * 0.38);
    drawBeamK(ctx, w / 2, h * 0.25, mark, b.primary, b.surface);
    ctx.fillStyle = b.secondary; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = role === 'blade' ? 'くらし' : b.name;
    fontToFit(ctx, label, w * 0.86, h * 0.15, b.font, b.weight);
    ctx.fillText(label, w / 2, h * 0.59);
    drawCategory(ctx, b.category, w / 2, h * 0.76, h * 0.052, b.primary, 'center');
  }
}

function drawMachiPort(ctx: Ctx, w: number, h: number, b: PilotBrandSpec, role: StoreSignRole): void {
  if (role === 'pylon') { drawMachiPortPylon(ctx, w, h, b); return; }
  ctx.fillStyle = b.surface; ctx.fillRect(0, 0, w, h);
  const horizontal = horizontalRole(role);
  ctx.fillStyle = b.secondary; ctx.fillRect(0, 0, w, h * (horizontal ? 0.075 : 0.055));
  ctx.fillStyle = b.accent; ctx.fillRect(0, h * (horizontal ? 0.85 : 0.9), w, h * 0.055);
  ctx.fillStyle = b.primary; ctx.fillRect(0, h * (horizontal ? 0.905 : 0.955), w, h * 0.095);
  if (horizontal) {
    const mark = h * 0.6;
    ctx.fillStyle = b.primary; ctx.textBaseline = 'middle';
    const px = fontToFit(ctx, b.name, w * 0.56, h * 0.45, b.font, b.weight);
    ctx.font = `${b.weight} ${px}px ${b.font}`;
    const wordW = ctx.measureText(b.name).width;
    const total = mark + h * 0.18 + wordW;
    const left = Math.max(w * 0.05, (w - total) / 2);
    drawMachiGate(ctx, left + mark / 2, h * 0.46, mark, b.primary, b.secondary);
    ctx.fillStyle = b.primary;
    ctx.textAlign = 'left'; ctx.fillText(b.name, left + mark + h * 0.18, h * 0.48);
  } else {
    const mark = Math.min(w * 0.7, h * 0.35);
    drawMachiGate(ctx, w / 2, h * 0.25, mark, b.primary, b.secondary);
    ctx.fillStyle = b.primary; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = role === 'blade' ? b.shortName : b.name;
    fontToFit(ctx, label, w * 0.88, h * 0.12, b.font, b.weight);
    ctx.fillText(label, w / 2, h * 0.55);
  }
}

function drawGrillBuns(ctx: Ctx, w: number, h: number, b: PilotBrandSpec, role: StoreSignRole): void {
  if (role === 'pylon') { drawGrillBunsPylon(ctx, w, h, b); return; }
  const horizontal = horizontalRole(role);
  ctx.fillStyle = b.primary; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b.secondary; ctx.fillRect(0, h * (horizontal ? 0.88 : 0.92), w, h * (horizontal ? 0.12 : 0.08));
  if (horizontal) {
    const mark = h * 0.67;
    ctx.fillStyle = b.accent; ctx.textBaseline = 'middle';
    const px = fontToFit(ctx, b.latin, w * 0.62, h * 0.43, b.font, b.weight);
    ctx.font = `${b.weight} ${px}px ${b.font}`;
    const wordW = ctx.measureText(b.latin).width;
    const total = mark + h * 0.2 + wordW;
    const left = Math.max(w * 0.05, (w - total) / 2);
    drawBunMark(ctx, left + mark / 2, h * 0.45, mark, b.accent, b.secondary);
    ctx.textAlign = 'left'; ctx.fillText(b.latin, left + mark + h * 0.2, h * 0.43);
    drawCategory(ctx, b.name, left + mark + h * 0.22, h * 0.7, h * 0.105, b.accent);
  } else {
    const mark = Math.min(w * 0.82, h * 0.43);
    drawBunMark(ctx, w / 2, h * 0.27, mark, b.accent, b.secondary);
    ctx.fillStyle = b.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = role === 'blade' ? b.shortName : b.name;
    fontToFit(ctx, label, w * 0.88, h * 0.115, b.font, b.weight);
    ctx.fillText(label, w / 2, h * 0.58);
    drawCategory(ctx, b.category, w / 2, h * 0.75, h * 0.055, b.accent, 'center');
  }
}

/** Returns true when `logoId` is one of the reference-quality pilot brands. */
export function drawPilotBrand(ctx: Ctx, w: number, h: number, logoId: number, role: StoreSignRole): boolean {
  const brand = pilotBrandFor(logoId);
  if (!brand) return false;
  ctx.save();
  if (brand.id === 2) drawKurashikan(ctx, w, h, brand, role);
  else if (brand.id === 3) drawMachiPort(ctx, w, h, brand, role);
  else drawGrillBuns(ctx, w, h, brand, role);
  ctx.restore();
  return true;
}
