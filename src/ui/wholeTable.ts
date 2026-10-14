/**
 * The whole table seen from above (DESIGN.md 3.6): every colony's nests,
 * tubes and arena in its place, with its ants as dots, and the places still
 * free. Drawn flat on a canvas; tapping a colony shows it, and while a new
 * colony is being placed, tapping a free place puts it there.
 */
import { MAX_COLONIES } from '../sim/colonies';
import type { ColonyView } from '../worker/protocol';
import { Place } from '../sim/ants';
import { SPECIES_NAMES, type SpeciesId } from '../sim/species';

/** Places on the table: two rows of two. */
const COLUMNS = 2;
/** Bare table between a colony's nests and its arena, and round each place, mm. */
const GAP = 40;
const MARGIN = 40;
/** Room under each place for its name, mm. */
const LABEL = 90;
/** What an empty place is drawn as wide and deep: a test tube beside a 40 × 30 cm arena, mm. */
const EMPTY = { nest: { width: 160, height: 60 }, arena: { width: 400, height: 300 } };

const MATERIAL_FILL: Record<string, string> = { ytong: '#e9e4da', plaster: '#f4f1ea', acrylic: '#b9d8e3', wood: '#b98a55' };

export class WholeTable {
  private views: ColonyView[] = [];
  private chosen = -1;
  private free: number[] = [];
  /** True while the keeper is choosing where a new colony goes: free places are marked. */
  placing = false;
  /** Where each place is drawn, in canvas pixels, from the last drawing. */
  private cells: { slot: number; x: number; y: number; width: number; height: number }[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Keeps what the worker last said and draws it. */
  set(views: ColonyView[] | null, chosen: number, free: number[]): void {
    if (views) this.views = views;
    this.chosen = chosen;
    this.free = free;
    this.draw();
  }

  /** The place under canvas point (x, y), in CSS pixels, or -1. */
  slotAt(x: number, y: number): number {
    const c = this.cells.find((k) => x >= k.x && y >= k.y && x <= k.x + k.width && y <= k.y + k.height);
    return c ? c.slot : -1;
  }

  draw(): void {
    const canvas = this.canvas;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // One scale for every place, so the colonies' setups can be compared.
    const nestW = Math.max(EMPTY.nest.width, ...this.views.map((v) => v.nestWidth));
    const tallest = Math.max(EMPTY.arena.height, ...this.views.map((v) => Math.max(v.nestHeight, v.arenaHeight)));
    const arenaW = Math.max(EMPTY.arena.width, ...this.views.map((v) => v.arenaWidth));
    const cellW = MARGIN * 2 + nestW + GAP + arenaW;
    const cellH = MARGIN * 2 + tallest + LABEL;
    const rows = Math.ceil(MAX_COLONIES / COLUMNS);
    const s = Math.min(w / (COLUMNS * cellW), h / (rows * cellH));
    const ox = (w - COLUMNS * cellW * s) / 2;
    const oy = (h - rows * cellH * s) / 2;
    // The table top.
    g.fillStyle = '#7a5434';
    g.fillRect(ox, oy, COLUMNS * cellW * s, rows * cellH * s);
    g.strokeStyle = 'rgba(40, 24, 10, 0.25)';
    g.lineWidth = 1;
    for (let k = 0; k < 40; k++) {
      const y = oy + ((k * 37) % Math.max(1, rows * cellH * s));
      g.beginPath();
      g.moveTo(ox, y);
      g.lineTo(ox + COLUMNS * cellW * s, y + 3);
      g.stroke();
    }
    this.cells = [];
    for (let slot = 0; slot < MAX_COLONIES; slot++) {
      const x = ox + (slot % COLUMNS) * cellW * s;
      const y = oy + Math.floor(slot / COLUMNS) * cellH * s;
      this.cells.push({ slot, x, y, width: cellW * s, height: cellH * s });
      const view = this.views.find((v) => v.slot === slot);
      g.save();
      g.translate(x, y);
      g.scale(s, s);
      if (view) this.drawColony(g, view, nestW, cellW, cellH, s);
      else this.drawFree(g, slot, cellW, cellH, s);
      g.restore();
    }
  }

  private drawColony(g: CanvasRenderingContext2D, v: ColonyView, nestW: number, cellW: number, cellH: number, s: number): void {
    if (v.slot === this.chosen) {
      g.strokeStyle = '#e8a83c';
      g.lineWidth = 3 / s;
      g.strokeRect(10, 10, cellW - 20, cellH - 20);
    }
    const nx = MARGIN;
    const ny = MARGIN;
    const ax = MARGIN + nestW + GAP;
    const ay = MARGIN;
    // The nests: modules and tubes on their table, or the sand farm.
    if (v.table) {
      const t = v.table;
      g.lineCap = 'round';
      for (const tube of t.tubes) {
        g.strokeStyle = tube.plugged ? 'rgba(230, 240, 245, 0.55)' : 'rgba(230, 240, 245, 0.9)';
        g.lineWidth = 6;
        g.beginPath();
        for (let k = 0; k + 1 < tube.path.length; k += 2) {
          const px = nx + tube.path[k]!;
          const py = ny + tube.path[k + 1]!;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }
      for (const m of t.modules) {
        g.fillStyle = m.kind === 'tube' ? '#dfe9ee' : (MATERIAL_FILL[m.material] ?? '#e9e4da');
        g.fillRect(nx + m.x, ny + m.y, m.width, m.height);
        g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        g.lineWidth = 1 / s;
        g.strokeRect(nx + m.x, ny + m.y, m.width, m.height);
      }
      // The arena's tube, from its port to the arena's wall.
      const m = t.modules.find((k) => k.id === t.arena.module);
      const p = m?.ports[t.arena.port];
      if (p) {
        g.strokeStyle = 'rgba(230, 240, 245, 0.9)';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(nx + p.x, ny + p.y);
        g.bezierCurveTo(nx + p.x + GAP, ny + p.y, ax - GAP, ay + v.arenaHeight / 2, ax, ay + v.arenaHeight / 2);
        g.stroke();
      }
    } else {
      g.fillStyle = '#c9a874';
      g.fillRect(nx, ny, v.nestWidth, v.nestHeight);
      g.strokeStyle = 'rgba(230, 240, 245, 0.9)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(nx + v.nestWidth, ny + 30);
      g.lineTo(ax, ay + v.arenaHeight / 2);
      g.stroke();
    }
    // The arena.
    g.fillStyle = '#e4d3ae';
    g.fillRect(ax, ay, v.arenaWidth, v.arenaHeight);
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = 4;
    g.strokeRect(ax, ay, v.arenaWidth, v.arenaHeight);
    // The ants, a dot each, big enough to see at this scale.
    g.fillStyle = '#1d1714';
    const r = Math.max(2.2, 1.6 / s);
    for (let k = 0; k + 2 < v.ants.length; k += 3) {
      const inArena = v.ants[k + 2] === Place.arena;
      const px = (inArena ? ax : nx) + v.ants[k]!;
      const py = (inArena ? ay : ny) + v.ants[k + 1]!;
      g.fillRect(px - r / 2, py - r / 2, r, r);
    }
    // Its name, and how it is doing.
    const size = 14 / s;
    g.fillStyle = '#f3e6cc';
    g.font = `600 ${size}px Georgia, serif`;
    const base = MARGIN + Math.max(v.nestHeight, v.arenaHeight) + 22 / s;
    g.fillText(v.name, MARGIN, base);
    g.font = `${12 / s}px system-ui, sans-serif`;
    g.fillStyle = '#c9c2b4';
    const alive = v.workers > 0 || v.queen ? `${v.workers} workers${v.queen ? ', the queen' : ', no queen'}` : 'the colony has died out';
    const about = `${SPECIES_NAMES[v.species as SpeciesId] ?? ''} · ${alive}`;
    g.fillText(about, MARGIN, base + 17 / s);
  }

  private drawFree(g: CanvasRenderingContext2D, slot: number, cellW: number, cellH: number, s: number): void {
    const open = this.free.includes(slot);
    g.setLineDash([12, 10]);
    g.strokeStyle = this.placing && open ? '#7fd39a' : 'rgba(243, 230, 204, 0.35)';
    g.lineWidth = (this.placing && open ? 3 : 1.5) / s;
    g.strokeRect(MARGIN, MARGIN, cellW - 2 * MARGIN, cellH - 2 * MARGIN - LABEL / 2);
    g.setLineDash([]);
    g.fillStyle = this.placing && open ? '#c8f0d4' : 'rgba(243, 230, 204, 0.6)';
    g.font = `${14 / s}px system-ui, sans-serif`;
    const label = this.placing && open ? 'Tap to put the new colony here' : 'Free place';
    g.fillText(label, cellW / 2 - g.measureText(label).width / 2, cellH / 2);
  }
}
