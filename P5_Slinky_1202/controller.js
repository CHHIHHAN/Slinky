// Controller: waves, state machine, input (clean version)

const IMPACT_PRESETS = [
  { name: "soft", wave: { A0: 300, alpha: 0.0020, omega: 30, k: 0.045, speedScale: 3.2, pushScale: 1.5 } },
  { name: "medium", wave: { A0: 500, alpha: 0.0015, omega: 40, k: 0.05, speedScale: 4.8, pushScale: 2.0 } },
  { name: "hard", wave: { A0: 800, alpha: 0.0015, omega: 50, k: 0.08, speedScale: 6.0, pushScale: 3.0 } }
];

const BASE_GEOMETRY = {
  barLength: 3000,
  barHeight: 50,
  segmentHalfLength: 200,
  blockHalfLength: 30,
  targetHalfLength: 90, // already tripled
  targetMinGap: 80,
  targetOffsetFromCenter: 200
};

class Wave {
  constructor(direction, barLength, params, startTime) {
    this.dir = direction; // 1: left->right, -1: right->left
    this.barLength = barLength;
    this.startTime = startTime;
    this.A0 = params.A0;
    this.alpha = params.alpha;
    this.omega = params.omega;
    this.k = params.k;
    this.speedScale = params.speedScale || 1;
    this.pushScale = params.pushScale || 1;
    this.c = (this.omega / this.k) * this.speedScale;
    this.lambda = (2 * Math.PI) / this.k;
    this.halfPeriod = Math.PI / this.omega;
    this.travelTime = this.barLength / this.c;
    this.duration = this.travelTime + this.halfPeriod;
    this.blockPushed = false;
  }

  active(t) {
    return t >= this.startTime && t <= this.startTime + this.duration;
  }

  displacementAt(x, t) {
    const tau = t - this.startTime;
    if (tau < 0 || !this.active(t)) return 0;
    const baseX = this.dir === 1 ? x : (this.barLength - x);
    const phaseOffset = baseX / this.c;
    const localTau = tau - phaseOffset;
    if (localTau < 0 || localTau > this.halfPeriod) return 0;
    const amp = this.A0 * Math.exp(-this.alpha * baseX);
    const phase = this.omega * localTau;
    const disp = amp * Math.sin(phase);
    return this.dir === 1 ? disp : -disp;
  }

  frontPosition(t) {
    const tau = t - this.startTime;
    return this.dir === 1 ? this.c * tau : this.barLength - this.c * tau;
  }
}

class Controller {
  constructor(barLength = BASE_GEOMETRY.barLength, barHeight = BASE_GEOMETRY.barHeight) {
    this.gameState = "PLAY"; // PLAY / TOUCH / HIT / WIN
    this.time = 0;
    this.winHits = 3;
    this.winStartTime = null;

    this.barLength = Math.max(1, Math.round(barLength));
    this.barHeight = Math.max(1, Math.round(barHeight));
    this.scale = this.barLength / BASE_GEOMETRY.barLength;

    this.segmentCount = 4;
    this.segmentHalfLength = BASE_GEOMETRY.segmentHalfLength * this.scale;

    this.blockHalfLength = BASE_GEOMETRY.blockHalfLength * this.scale;
    this.blockBlend = 0.5;
    this.blockSpeedScale = 0.35;
    this.targetHalfLength = BASE_GEOMETRY.targetHalfLength * this.scale;
    this.targetBlend = 0.5;
    this.targetMinGap = Math.max(10, BASE_GEOMETRY.targetMinGap * this.scale);
    this.targetOffsetFromCenter = BASE_GEOMETRY.targetOffsetFromCenter * this.scale;
    this.overlapThreshold = 2.0;

    this.anchorParams = { blend: 0.05, breatheAmp: 0.5, breatheOmega: 1.5, beta: 0.6 };
    this.waveParams = { ...IMPACT_PRESETS[1].wave };

    this.waves = [];
    this.hitCount = 0;
    this.segments = [];

    this.buildSegments();
    const mid = this.barLength * 0.5;
    this.block = new BlockSegment(mid, this.blockHalfLength, this.blockBlend, this.blockSpeedScale, this.barLength);
    this.target = new TargetSegment(mid + this.targetOffsetFromCenter, this.targetHalfLength, this.targetBlend, this.barLength);
    this.respawnTargetSafe();

    this.collisionAnimation = new Animation();

    this.overlapStartTime = null;
    this.overlappingNow = false;
    this.baseTargetColor = colorDefs.targetCore ? { ...colorDefs.targetCore } : { r: 238, g: 255, b: 0, a: 255 };
    this.flashState = null;
    this.flashInterval = 0.15;
  }

  setImpactPreset(index = 1) {
    const i = constrain(index - 1, 0, IMPACT_PRESETS.length - 1);
    const preset = IMPACT_PRESETS[i];
    this.waveParams = { ...preset.wave };
  }

  buildSegments() {
    this.segments = [];
    for (let i = 0; i < this.segmentCount; i++) {
      const center = ((i + 1) * this.barLength) / (this.segmentCount + 1);
      this.segments.push(
        new AnchorSegment(
          center,
          this.segmentHalfLength,
          this.anchorParams.blend,
          this.anchorParams.breatheAmp,
          this.anchorParams.breatheOmega,
          this.anchorParams.beta
        )
      );
    }
  }

  update() {
    if (this.gameState === "PLAY" || this.gameState === "HIT" || this.gameState === "TOUCH") {
      const dt = deltaTime / 1000;
      this.time += dt;
      background(animatedBackgroundColor(this.time));
      this.ensureTargetValid();
      this.updateWaves();
      this.updateSegments();
      this.updateBlock(dt);
      this.handleOverlap();
      this.updateFlash();
      display.renderFrame(this.segments, this.block, this.target, this.time);
      display.show();
    } else if (this.gameState === "WIN") {
      const dt = deltaTime / 1000;
      this.time += dt;
      background(animatedBackgroundColor(this.time));
      this.ensureTargetValid();
      if (this.winStartTime !== null && this.time - this.winStartTime >= 3) {
        this.resetGame();
      }
    }
  }

  launchWave(direction) {
    if (this.gameState === "WIN") return; // 忽略 WIN 状态下的按键
    const now = this.time;
    const wave = new Wave(direction, this.barLength, this.waveParams, now);
    this.waves.push(wave);
  }

  updateWaves() {
    const now = this.time;
    this.waves = this.waves.filter((w) => w.active(now));
    this.waves.forEach((wave) => {
      if (wave.blockPushed) return;
      const front = wave.frontPosition(now);
      if ((wave.dir === 1 && front >= this.block.center) || (wave.dir === -1 && front <= this.block.center)) {
        wave.blockPushed = true;
        const baseA0 = 400;
        const distance = wave.dir * wave.lambda * (wave.A0 / baseA0) * wave.pushScale;
        this.block.push(distance, wave.c);
      }
    });
  }

  updateSegments() {
    this.segments.forEach((seg) => seg.update(this.waves, this.time));
  }

  updateBlock(dt) {
    this.block.update(dt);
  }

  isOverlapping() {
    return Math.abs(this.block.center - this.target.center) <= this.block.length + this.target.length;
  }

  handleOverlap() {
    if (this.gameState === "HIT" || this.gameState === "WIN") {
      this.overlappingNow = false;
      return;
    }

    const overlap = this.isOverlapping();
    this.overlappingNow = overlap;

    if (!overlap) {
      this.resetTouchState();
      return;
    }

    if (this.overlapStartTime === null) {
      this.overlapStartTime = this.time;
      this.gameState = "TOUCH";
      this.startTouchFlash();
    } else if (this.gameState !== "TOUCH") {
      this.gameState = "TOUCH";
    }

    const elapsed = this.time - this.overlapStartTime;
    if (elapsed >= this.overlapThreshold) {
      this.triggerHit();
    }
  }

  resetGame() {
    this.hitCount = 0;
    this.time = 0;
    this.winStartTime = null;
    this.waves = [];
    this.block.center = this.barLength * 0.5;
    this.block.targetCenter = this.block.center;
    this.block.velocity = 0;
    this.respawnTargetSafe();
    this.gameState = "PLAY";
    this.overlapStartTime = null;
    this.overlappingNow = false;
    this.flashState = null;
    this.restoreTargetColor();
  }

  ensureTargetValid() {
    if (!this.target || isNaN(this.target.center) || this.target.center < 0 || this.target.center > this.barLength) {
      this.respawnTargetSafe();
    }
  }

  respawnTargetSafe() {
    const minGap = this.targetMinGap;
    const attemptsMax = 40;
    const minCenter = this.barLength * 0.05;
    const maxCenter = this.barLength * 0.95;
    if (!this.target) {
      this.target = new TargetSegment(this.barLength * 0.5, this.targetHalfLength, this.targetBlend, this.barLength);
    }
    let attempts = 0;
    do {
      this.target.respawn(minGap, this.block.center, this.block.length);
      attempts++;
    } while (
      attempts < attemptsMax &&
      Math.abs(this.target.center - this.block.center) <= (this.target.length + this.block.length + minGap)
    );
    if (isNaN(this.target.center) || this.target.center < 0 || this.target.center > this.barLength) {
      this.target.center = Math.min(this.barLength - 100, this.barLength * 0.7);
    }
    this.target.center = Math.max(minCenter, Math.min(maxCenter, this.target.center));
  }

  resetTouchState() {
    this.overlapStartTime = null;
    if (this.gameState === "TOUCH") {
      this.gameState = "PLAY";
    }
    if (this.flashState && this.flashState.mode === "touch") {
      this.restoreTargetColor();
      this.flashState = null;
    }
  }

  triggerHit() {
    if (this.gameState === "HIT") return;
    this.hitCount += 1;
    const willWin = this.hitCount >= this.winHits;
    this.overlapStartTime = null;
    this.finishHit(willWin);
  }

  startTouchFlash() {
    if (this.flashState && this.flashState.mode === "hit") return;
    this.flashState = {
      mode: "touch",
      start: this.time,
      interval: this.flashInterval,
      flashes: Infinity, // continuous flashing while touching
      continuous: true,
      originalColor: this.baseTargetColor,
      hitColor: colorDefs.targetHit || { r: 0, g: 229, b: 255, a: 255 }
    };
  }

  finishHit(willWin = false) {
    this.gameState = "HIT";
    this.restoreTargetColor();
    this.flashState = null;
    if (willWin) {
      this.transitionToWin();
    } else {
      this.respawnTargetSafe();
      this.gameState = "PLAY";
    }
  }

  updateFlash() {
    if (!this.flashState) return;
    const fs = this.flashState;
    const elapsed = this.time - fs.start;
    const toggleCount = Math.floor(elapsed / fs.interval);
    const totalToggles = fs.flashes * 2;
    const shouldEnd = !fs.continuous && toggleCount >= totalToggles;
    if (shouldEnd) {
      this.restoreTargetColor();
      this.flashState = null;
      if (fs.mode === "hit") {
        this.gameState = "PLAY";
      } else if (fs.mode === "touch" && !this.overlappingNow) {
        this.gameState = "PLAY";
      }
      return;
    }
    const useHit = toggleCount % 2 === 1;
    const c = useHit ? fs.hitColor : fs.originalColor;
    colorDefs.targetCore = c;
    initColors();
  }

  transitionToWin() {
    this.gameState = "WIN";
    this.winStartTime = this.time;
    this.waves = [];
    this.overlapStartTime = null;
    this.restoreTargetColor();
  }

  restoreTargetColor() {
    const baseColor = (this.flashState && this.flashState.originalColor) || this.baseTargetColor;
    colorDefs.targetCore = baseColor;
    initColors();
  }
}

// 键盘：左 A/S/D 轻中重；右 L/K/J 轻中重（WIN 状态忽略按键）
function handleControlKey(k) {
  if (!controller || controller.gameState === "WIN") return;
  switch (k) {
    case "a":
      controller.setImpactPreset(1);
      controller.launchWave(1);
      break;
    case "s":
      controller.setImpactPreset(2);
      controller.launchWave(1);
      break;
    case "d":
      controller.setImpactPreset(3);
      controller.launchWave(1);
      break;
    case "l":
      controller.setImpactPreset(1);
      controller.launchWave(-1);
      break;
    case "k":
      controller.setImpactPreset(2);
      controller.launchWave(-1);
      break;
    case "j":
      controller.setImpactPreset(3);
      controller.launchWave(-1);
      break;
    default:
      break;
  }
}

function keyPressed() {
  handleControlKey(key.toLowerCase());
}

class SerialListener {
  constructor(baudRate = 115200) {
    this.baudRate = baudRate;
    this.port = null;
    this.reader = null;
    this.decoder = null;
    this.buffer = "";
    this.connectOnFirstGesture = this.connectOnFirstGesture.bind(this);
    this.init();
  }

  init() {
    if (typeof navigator === "undefined" || !navigator.serial) {
      console.warn("Web Serial API unavailable; keyboard controls only.");
      return;
    }
    navigator.serial.addEventListener("disconnect", () => this.close());
    navigator.serial.addEventListener("connect", (event) => {
      if (!this.port) {
        this.port = event.target;
        this.openPort();
      }
    });
    navigator.serial.getPorts().then((ports) => {
      if (!this.port && ports.length > 0) {
        this.port = ports[0];
        this.openPort();
      }
    });
    window.addEventListener("click", this.connectOnFirstGesture, { once: true });
  }

  async connectOnFirstGesture() {
    if (this.port) return;
    try {
      this.port = await navigator.serial.requestPort();
      await this.openPort();
    } catch (err) {
      console.warn("Serial permission or connection failed:", err);
    }
  }

  async openPort() {
    if (!this.port) return;
    try {
      await this.port.open({ baudRate: this.baudRate });
      this.decoder = new TextDecoderStream();
      this.port.readable.pipeTo(this.decoder.writable).catch(() => {});
      this.reader = this.decoder.readable.getReader();
      this.buffer = "";
      this.readLoop();
      console.log("Serial connected");
    } catch (err) {
      console.error("Failed to open serial port:", err);
      this.close();
    }
  }

  async readLoop() {
    while (this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.handleChunk(value);
      } catch (err) {
        console.warn("Serial read error:", err);
        break;
      }
    }
    this.close();
  }

  handleChunk(text) {
    this.buffer += text;
    let idx;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      this.processLine(line);
    }
  }

  processLine(line) {
    if (!line) return;
    let payload;
    try {
      payload = JSON.parse(line);
    } catch (_err) {
      return;
    }
    this.handlePayload(payload);
  }

  handlePayload(data) {
    if (data && data.A) this.triggerSide("A", data.A);
    if (data && data.B) this.triggerSide("B", data.B);
  }

  triggerSide(side, info) {
    if (!info || Number(info.p) !== 1) return;
    const lvl = Number(info.lvl);
    if (![1, 2, 3].includes(lvl)) return;
    const keyMapA = { 1: "a", 2: "s", 3: "d" };
    const keyMapB = { 1: "l", 2: "k", 3: "j" };
    const keyForSide = side === "A" ? keyMapA[lvl] : keyMapB[lvl];
    handleControlKey(keyForSide);
  }

  async close() {
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (_err) {
        // ignore
      }
      try {
        this.reader.releaseLock();
      } catch (_err) {
        // ignore
      }
    }
    this.reader = null;
    if (this.port) {
      try {
        await this.port.close();
      } catch (_err) {
        // ignore
      }
    }
    this.port = null;
  }
}

const serialListener = new SerialListener();
