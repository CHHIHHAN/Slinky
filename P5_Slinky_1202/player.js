// 均分段、小球、目标的定义 ////////////////////////////////////////////////

// 均分锚点：可呼吸 + 受波形推动
class AnchorSegment {
  constructor(center, halfLength, blend, breatheAmp, breatheOmega, beta) {
    this.restCenter = center;        // X0 静止中心
    this.baseHalfLength = halfLength; // L0/2
    this.blend = blend;              // 混色百分比
    this.breatheAmp = breatheAmp;    // A_breathe
    this.breatheOmega = breatheOmega;// omega_b
    this.beta = beta;                // 局部波感权重

    this.center = center;            // 当前中心
    this.length = halfLength;        // 当前半长
  }

  update(waves, t) {
    // 呼吸长度
    const breatheScale = 1 + this.breatheAmp * Math.sin(this.breatheOmega * t);
    const halfL = this.baseHalfLength * breatheScale;

    // 呼吸后的左右端静止位置
    const xLeftRest = this.restCenter - halfL;
    const xRightRest = this.restCenter + halfL;

    // 叠加波形后的端点
    let uLeft = 0;
    let uRight = 0;
    waves.forEach((wave) => {
      uLeft += wave.displacementAt(xLeftRest, t);
      uRight += wave.displacementAt(xRightRest, t);
    });
    const xLeftWave = xLeftRest + uLeft;
    const xRightWave = xRightRest + uRight;

    // 骨架插值的中心/半长
    const centerWave = 0.5 * (xLeftWave + xRightWave);
    const halfLWave = Math.max(1, 0.5 * Math.abs(xRightWave - xLeftWave));

    // 局部波混合：取中点进行额外采样
    const xRestMid = 0.5 * (xLeftRest + xRightRest);
    let uMid = 0;
    waves.forEach((wave) => {
      uMid += wave.displacementAt(xRestMid, t);
    });
    const centerLocal = xRestMid + uMid;

    // 最终中心：骨架与局部混合
    this.center = (1 - this.beta) * centerWave + this.beta * centerLocal;
    this.length = halfLWave;
  }
}

// 小球（block）：被波推动，平滑移动
class BlockSegment {
  constructor(center, length, blend, speedScale, barLength) {
    this.center = center;
    this.length = length;
    this.blend = blend;
    this.speedScale = speedScale; // 相对波速比例
    this.barLength = barLength;
    this.targetCenter = center;
    this.velocity = 0;
  }

  push(distance, waveSpeed) {
    this.targetCenter = constrain(this.center + distance, 0, this.barLength);
    this.velocity = Math.abs(waveSpeed) * this.speedScale;
  }

  update(dt) {
    if (Math.abs(this.targetCenter - this.center) < 1) {
      this.center = this.targetCenter;
      this.velocity = 0;
      return;
    }
    const dir = Math.sign(this.targetCenter - this.center);
    this.center += dir * this.velocity * dt;
    if ((dir > 0 && this.center > this.targetCenter) || (dir < 0 && this.center < this.targetCenter)) {
      this.center = this.targetCenter;
      this.velocity = 0;
    }
  }
}

// 目标：被击中后随机重生
class TargetSegment {
  constructor(center, length, blend, barLength) {
    this.center = center;
    this.length = length;
    this.blend = blend;
    this.barLength = barLength;
  }

  respawn(minGap = 40, avoidCenter = null, avoidLength = 0) {
    const margin = Math.max(this.length + minGap, 80);
    let candidate = random(margin, this.barLength - margin);
    let attempts = 0;
    if (avoidCenter !== null) {
      while (
        Math.abs(candidate - avoidCenter) <= (this.length + avoidLength + minGap) &&
        attempts < 30
      ) {
        candidate = random(margin, this.barLength - margin);
        attempts++;
      }
    }
    this.center = candidate;
  }
}
