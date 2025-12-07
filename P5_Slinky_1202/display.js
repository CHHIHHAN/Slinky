// Display with layered rendering (5 layers) ///////////////////////////////////

// Palette definitions
const canvasBgColor = { r: 0, g: 0, b: 0, a: 255 };
const COLOR_PALETTES = [
  {
    name: "Palette0",
    barBase: { r: 144, g: 255, b: 0, a: 255 },
    anchorCore: { r: 255, g: 50, b: 0, a: 255 },
    blockCore: { r: 255, g: 255, b: 255, a: 255 },
    targetCore: { r: 43, g: 0, b: 255, a: 255 },
    targetHit: { r: 0, g: 229, b: 255, a: 255 }
  },
  {
    name: "Palette1",
    barBase: { r: 0, g: 255, b: 255, a: 255 },
    anchorCore: { r: 0, g: 180, b: 154, a: 255 },
    blockCore: { r: 255, g: 255, b: 255, a: 255 },
    targetCore: { r: 240, g: 40, b: 180, a: 255 },
    targetHit: { r: 0, g: 229, b: 255, a: 255 }
  },
  {
    name: "Palette2",
    barBase: { r: 255, g: 0, b: 157, a: 255 },
    anchorCore: { r: 200, g: 0, b: 255, a: 120 },
    blockCore: { r: 255, g: 255, b: 255, a: 255 },
    targetCore: { r: 238, g: 255, b: 0, a: 255 },
    targetHit: { r: 0, g: 229, b: 255, a: 255 }
  },
  {
    name: "Palette3",
    barBase: { r: 60, g: 180, b: 80, a: 255 },
    anchorCore: { r: 200, g: 60, b: 255, a: 255 },
    blockCore: { r: 0, g: 220, b: 200, a: 255 },
    targetCore: { r: 255, g: 140, b: 40, a: 255 },
    targetHit: { r: 0, g: 229, b: 255, a: 255 }
  }
];

let colorDefs = { canvasBg: canvasBgColor, ...COLOR_PALETTES[2] };
let currentPaletteIndex = 0;
let COLORS = {};

function setPalette(index = 0) {
  currentPaletteIndex = constrain(index, 0, COLOR_PALETTES.length - 1);
  const p = COLOR_PALETTES[currentPaletteIndex];
  colorDefs = { canvasBg: canvasBgColor, ...p };
  initColors();
}

function initColors() {
  COLORS = {};
  Object.keys(colorDefs).forEach((key) => {
    const def = colorDefs[key];
    const base = color(def.r, def.g, def.b, def.a);
    const comp = color(255 - def.r, 255 - def.g, 255 - def.b, def.a);
    COLORS[key] = { base, comp };
  });
}

const ENABLE_BREATHING = false;
const ENABLE_ALPHA_BREATHING = false;

function animatedBackgroundColor(_t) {
  const base = colorDefs.canvasBg;
  return color(base.r, base.g, base.b, base.a);
}

function animatedColor(key, t) {
  const info = COLORS[key];
  if (!info) return color(0);

  const dtR = 0.0;
  const dtG = (2 * Math.PI) / 3;
  const dtB = (4 * Math.PI) / 3;
  const k = 0.6;
  const wRawR = 0.5 * (1 + Math.sin(t + dtR));
  const wRawG = 0.5 * (1 + Math.sin(t + dtG));
  const wRawB = 0.5 * (1 + Math.sin(t + dtB));
  const wR = 0.5 + (wRawR - 0.5) * k;
  const wG = 0.5 + (wRawG - 0.5) * k;
  const wB = 0.5 + (wRawB - 0.5) * k;

  const r = ENABLE_BREATHING ? red(info.base) * (1 - wR) + red(info.comp) * wR : red(info.base);
  const g = ENABLE_BREATHING ? green(info.base) * (1 - wG) + green(info.comp) * wG : green(info.base);
  const b = ENABLE_BREATHING ? blue(info.base) * (1 - wB) + blue(info.comp) * wB : blue(info.base);

  let a = alpha(info.base);
  if (ENABLE_ALPHA_BREATHING) {
    const omegaA = 1.2;
    const wa = 0.5 * (1 + Math.sin(t * omegaA));
    if (key === "barBase") {
      a = a * (0.6 + 0.4 * wa);
    } else if (key === "anchorCore") {
      a = a * (1.0 - 0.4 * wa);
    }
  }

  return color(r, g, b, a);
}

// Display with 5 layers (1=top,5=bottom)
class Display {
  constructor(_barLength, _barHeight) {
    this.barLength = _barLength;
    this.barHeight = _barHeight;
    this.layers = 5;
    this.buffers = [];
    for (let l = 0; l < this.layers; l++) {
      this.buffers[l] = new Array(this.barLength);
    }
    this.clear();
  }

  clear() {
    const transparent = color(0, 0, 0, 0);
    for (let l = 0; l < this.layers; l++) {
      for (let i = 0; i < this.barLength; i++) {
        this.buffers[l][i] = transparent;
      }
    }
  }

  applyGradientSegment(segment, segmentColor, layer = 5) {
    const idx = layer - 1;
    const inner = segment.length * segment.blend;
    const maxRange = segment.length;
    const startIdx = Math.max(0, Math.floor(segment.center - maxRange));
    const endIdx = Math.min(this.barLength - 1, Math.ceil(segment.center + maxRange));
    for (let i = startIdx; i <= endIdx; i++) {
      const dx = Math.abs(i - segment.center);
      if (dx > maxRange) continue;
      let weight = 1;
      if (dx > inner) {
        const span = maxRange - inner;
        weight = 1 - (dx - inner) / (span || 1);
      }
      weight = constrain(weight, 0, 1);
      this.buffers[idx][i] = lerpColor(this.buffers[idx][i], segmentColor, weight);
    }
  }

  applySolidSegment(segment, segmentColor, layer = 5) {
    const idx = layer - 1;
    const startIdx = Math.max(0, Math.floor(segment.center - segment.length));
    const endIdx = Math.min(this.barLength - 1, Math.ceil(segment.center + segment.length));
    for (let i = startIdx; i <= endIdx; i++) {
      this.buffers[idx][i] = segmentColor;
    }
  }

  applySegments(segments, layer = 5) {
    segments.forEach((seg) => this.applyGradientSegment(seg, seg.color, layer));
  }

  renderFrame(segments, block, target, t) {
    this.clear();
    // 底层填充 barBase
    const baseColor = animatedColor("barBase", t);
    const baseSeg = { center: this.barLength * 0.5, length: this.barLength * 0.5, blend: 0, color: baseColor };
    this.applySolidSegment(baseSeg, baseColor, 5);

    // 均分点（默认层5）
    segments.forEach((seg) => {
      const segColor = animatedColor("anchorCore", t);
      this.applyGradientSegment(seg, segColor, 5);
    });

    if (target) {
      const targetColor = animatedColor("targetCore", t);
      this.applySolidSegment(target, targetColor, 5);
    }

    if (block) {
      const blockColor = animatedColor("blockCore", t);
      this.applySolidSegment(block, blockColor, 5);
    }
  }

  show() {
    noStroke();
    const startX = (width - this.barLength) * 0.5;
    const startY = (height - this.barHeight) * 0.5;
    for (let i = 0; i < this.barLength; i++) {
      let finalColor = colorDefs.canvasBg ? color(colorDefs.canvasBg.r, colorDefs.canvasBg.g, colorDefs.canvasBg.b, colorDefs.canvasBg.a) : color(0);
      for (let l = 0; l < this.layers; l++) {
        const c = this.buffers[l][i];
        if (alpha(c) > 0) {
          finalColor = c;
          break;
        }
      }
      fill(finalColor);
      rect(startX + i, startY, 1, this.barHeight);
    }
  }
}
