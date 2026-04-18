import type { AcousticMaterial } from '../types';

// ─── Interpolation helper ─────────────────────────────────────────────────────
// Maps 8 octave-band values (63, 125, 250, 500, 1k, 2k, 4k, 8kHz) to the
// app's 24 1/3-octave bands (50 Hz – 10 kHz), linearly interpolating in
// log-frequency space (which is equivalent to linear interpolation across the
// uniformly-spaced index array).
//
// Octave-band centres live at 1/3-octave indices:
//   63→1  125→4  250→7  500→10  1k→13  2k→16  4k→19  8k→22

type OctBands = [number, number, number, number, number, number, number, number];

function interp(v: OctBands): number[] {
  const out = new Array(24).fill(0) as number[];
  const pts  = [1, 4, 7, 10, 13, 16, 19, 22] as const;

  pts.forEach((idx, i) => { out[idx] = v[i]; });

  // Clamp beyond edges
  for (let i = 0;        i < pts[0];   i++) out[i] = v[0];
  for (let i = pts[7]+1; i < 24;       i++) out[i] = v[7];

  // Linear interpolation between adjacent octave-band anchors
  for (let s = 0; s < pts.length - 1; s++) {
    const i0 = pts[s], i1 = pts[s + 1];
    const v0 = v[s],   v1 = v[s + 1];
    for (let i = i0 + 1; i < i1; i++) {
      out[i] = v0 + (v1 - v0) * (i - i0) / (i1 - i0);
    }
  }

  return out.map(x => Math.max(0, Math.min(1, x)));
}

function mat(
  name: string,
  category: string,
  type: AcousticMaterial['type'],
  bands: OctBands,
  scattering = 0.05,
  thickness?: number,
  flowResistivity?: number,
): AcousticMaterial {
  return { name, category, type, absorption: interp(bands), scattering, thickness, flowResistivity };
}

// ─── ISO 354 / Published Data Library ────────────────────────────────────────
// Absorption coefficients at octave bands: [63, 125, 250, 500, 1k, 2k, 4k, 8k Hz]

export const MATERIALS_LIBRARY: AcousticMaterial[] = [

  // ── Masonry & Concrete ───────────────────────────────────────────────────────
  mat('Concrete (Bare)',        'Masonry', 'broadband',
      [0.02, 0.02, 0.02, 0.03, 0.04, 0.05, 0.05, 0.05], 0.05),
  mat('Concrete (Painted)',     'Masonry', 'broadband',
      [0.01, 0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.02], 0.05),
  mat('Brick (Exposed)',        'Masonry', 'broadband',
      [0.03, 0.03, 0.03, 0.03, 0.04, 0.05, 0.07, 0.07], 0.07),
  mat('Marble / Stone Floor',   'Masonry', 'broadband',
      [0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.02, 0.02], 0.03),

  // ── Wood & Panels ────────────────────────────────────────────────────────────
  mat('Timber Floor',  'Wood', 'broadband',
      [0.15, 0.11, 0.11, 0.10, 0.07, 0.06, 0.07, 0.07], 0.10),
  mat('Plywood 6mm',   'Wood', 'panel',
      [0.28, 0.28, 0.22, 0.17, 0.09, 0.10, 0.11, 0.10], 0.10, 0.006),
  mat('MDF 18mm',      'Wood', 'panel',
      [0.22, 0.22, 0.30, 0.20, 0.08, 0.05, 0.05, 0.04], 0.08, 0.018),
  mat('Cork Sheet 10mm','Wood','broadband',
      [0.10, 0.10, 0.20, 0.45, 0.50, 0.55, 0.60, 0.55], 0.15, 0.010),

  // ── Glass & Metal ────────────────────────────────────────────────────────────
  mat('Float Glass',       'Glass & Metal', 'broadband',
      [0.35, 0.35, 0.25, 0.18, 0.12, 0.07, 0.04, 0.03], 0.05),
  mat('Steel Panel',       'Glass & Metal', 'broadband',
      [0.05, 0.05, 0.04, 0.03, 0.02, 0.02, 0.03, 0.03], 0.05),
  mat('Perforated Metal',  'Glass & Metal', 'resonator',
      [0.25, 0.40, 0.70, 0.80, 0.60, 0.40, 0.30, 0.25], 0.20),

  // ── Soft Furnishings ─────────────────────────────────────────────────────────
  mat('Carpet (Light)',   'Soft Furnishings', 'broadband',
      [0.02, 0.03, 0.09, 0.25, 0.31, 0.33, 0.44, 0.45], 0.20),
  mat('Carpet (Heavy)',   'Soft Furnishings', 'broadband',
      [0.07, 0.09, 0.08, 0.21, 0.26, 0.27, 0.37, 0.38], 0.25),
  mat('Heavy Curtain',    'Soft Furnishings', 'broadband',
      [0.05, 0.07, 0.31, 0.49, 0.75, 0.70, 0.60, 0.55], 0.35),
  mat('Upholstered Seats','Soft Furnishings', 'broadband',
      [0.20, 0.28, 0.40, 0.50, 0.58, 0.62, 0.62, 0.60], 0.40),
  mat('Audience (per m²)','Soft Furnishings', 'broadband',
      [0.22, 0.25, 0.35, 0.42, 0.46, 0.50, 0.50, 0.50], 0.40),

  // ── Construction Boards ──────────────────────────────────────────────────────
  mat('Gypsum / Drywall',   'Construction', 'panel',
      [0.10, 0.10, 0.08, 0.05, 0.03, 0.03, 0.03, 0.03], 0.05, 0.013),
  mat('Suspended Ceiling',  'Construction', 'broadband',
      [0.05, 0.08, 0.15, 0.35, 0.50, 0.55, 0.55, 0.50], 0.15),

  // ── Acoustic Treatment ───────────────────────────────────────────────────────
  mat('Acoustic Foam 25mm',   'Acoustic Treatment', 'custom',
      [0.03, 0.05, 0.10, 0.35, 0.65, 0.85, 0.95, 0.95], 0.50, 0.025, 8000),
  mat('Acoustic Foam 50mm',   'Acoustic Treatment', 'custom',
      [0.06, 0.10, 0.20, 0.55, 0.85, 0.95, 0.98, 0.98], 0.55, 0.050, 6000),
  mat('Acoustic Foam 100mm',  'Acoustic Treatment', 'custom',
      [0.15, 0.25, 0.55, 0.90, 0.98, 0.98, 0.98, 0.98], 0.60, 0.100, 5000),
  mat('Egg-Crate Foam',       'Acoustic Treatment', 'custom',
      [0.07, 0.12, 0.28, 0.60, 0.80, 0.90, 0.95, 0.95], 0.55, 0.050),
  mat('Mineral Wool 50mm',    'Acoustic Treatment', 'custom',
      [0.10, 0.15, 0.45, 0.80, 0.95, 0.95, 0.95, 0.92], 0.60, 0.050, 10000),
  mat('Rockwool Slab 100mm',  'Acoustic Treatment', 'custom',
      [0.20, 0.35, 0.70, 0.95, 0.98, 0.98, 0.97, 0.95], 0.65, 0.100, 12000),
  mat('Acoustic Ceiling Tile','Acoustic Treatment', 'custom',
      [0.05, 0.10, 0.25, 0.55, 0.70, 0.80, 0.90, 0.90], 0.40),
  mat('Studio ISO Panel 4"',  'Acoustic Treatment', 'custom',
      [0.15, 0.20, 0.50, 0.85, 0.95, 0.98, 0.98, 0.98], 0.55, 0.100, 7000),

  // ── Resonators ───────────────────────────────────────────────────────────────
  mat('Bass Trap (Corner)',  'Resonator', 'bass-trap',
      [0.50, 0.60, 0.70, 0.45, 0.30, 0.20, 0.15, 0.12], 0.30, 0.150),
  mat('Resonant Panel',     'Resonator', 'resonator',
      [0.35, 0.40, 0.75, 0.45, 0.25, 0.15, 0.10, 0.08], 0.10, 0.018),
  mat('Helmholtz Resonator','Resonator', 'resonator',
      [0.15, 0.25, 0.80, 0.95, 0.80, 0.40, 0.20, 0.10], 0.10),

  // ── Other ────────────────────────────────────────────────────────────────────
  mat('Water Surface', 'Other', 'broadband',
      [0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.03, 0.03], 0.03),
  mat('Bookshelf',     'Other', 'broadband',
      [0.10, 0.15, 0.25, 0.35, 0.40, 0.45, 0.40, 0.35], 0.50),
];

export const MATERIAL_CATEGORIES = [...new Set(MATERIALS_LIBRARY.map(m => m.category))] as string[];

/** Average absorption across 24 bands. */
export const avgAlpha = (m: AcousticMaterial) =>
  (m.absorption.reduce((a, b) => a + b, 0) / m.absorption.length).toFixed(3);
