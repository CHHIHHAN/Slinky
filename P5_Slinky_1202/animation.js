// Animation: 胜利覆盖（PLAY->WIN 显示全条 target 色；WIN->PLAY 清空） /////////

class Animation {
  constructor() {
    this.winOverlay = null; // { color, barLength }
  }

  // PLAY -> WIN：立即全条覆盖
  startWin(targetColor, barLength) {
    this.winOverlay = {
      color: targetColor,
      barLength
    };
  }

  // WIN -> PLAY：清空覆盖
  startReset() {
    this.winOverlay = null;
  }

  clearAnimations() {
    this.winOverlay = null;
  }

  // 顶层段列表
  getSegments() {
    if (!this.winOverlay) return [];
    const len = this.winOverlay.barLength * 0.5;
    return [
      { center: this.winOverlay.barLength * 0.5, length: len, blend: 0.8, color: this.winOverlay.color }
    ];
  }
}

// 顶层叠加到 Display layer 1
(() => {
  if (typeof Display === "undefined") return;
  const _show = Display.prototype.show;
  Display.prototype.show = function () {
    // 先清空 layer1，避免旧覆盖残留
    const transparent = color(0, 0, 0, 0);
    if (this.buffers && this.buffers[0]) {
      for (let i = 0; i < this.barLength; i++) {
        this.buffers[0][i] = transparent;
      }
    }
    if (typeof collisionAnimation !== "undefined" && collisionAnimation.getSegments) {
      const animSegments = collisionAnimation.getSegments();
      this.applySegments(animSegments, 1);
    }
    _show.call(this);
  };
})();

// 监听状态切换
(() => {
  if (typeof Controller === "undefined") return;
  const _update = Controller.prototype.update;
  Controller.prototype.update = function () {
    const prevState = this.gameState;

    _update.call(this);

    if (prevState !== "WIN" && this.gameState === "WIN") {
      const c = getTargetColor(this.time);
      collisionAnimation.clearAnimations();
      collisionAnimation.startWin(c, this.barLength);
    }

    if (prevState === "WIN" && this.gameState === "PLAY") {
      collisionAnimation.clearAnimations();
      collisionAnimation.startReset();
    }

    // 如果有覆盖，强制渲染一帧（确保立即可见/清空）
    if (
      typeof display !== "undefined" &&
      typeof collisionAnimation !== "undefined" &&
      (collisionAnimation.winOverlay || collisionAnimation.resetAnim)
    ) {
      display.renderFrame(this.segments, this.block, this.target, this.time);
      const animSegments = collisionAnimation.getSegments();
      display.applySegments(animSegments, 1);
      display.show();
    }
  };
})();

function getTargetColor(t) {
  if (typeof animatedColor === "function") {
    try {
      return animatedColor("targetCore", t);
    } catch (e) {}
  }
  if (typeof colorDefs !== "undefined" && colorDefs.targetCore) {
    const c = colorDefs.targetCore;
    return color(c.r, c.g, c.b, c.a);
  }
  return color(255, 215, 0, 255);
}
