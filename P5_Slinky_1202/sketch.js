/* /////////////////////////////////////
   自定义一维波动小游戏（波动 + 衰减 + 目标命中）
*/ /////////////////////////////////////

let display; // 显示聚合
let controller; // 状态机与波形控制
let collisionAnimation; // 占位动画

// 主长条基准尺寸
const BASE_BAR_LENGTH = 3000;
const BASE_BAR_HEIGHT = 50;

// 实际尺寸（根据屏幕自适应缩放）
let barLength = BASE_BAR_LENGTH;
let barHeight = BASE_BAR_HEIGHT;

function recalcDimensions() {
  const scale = windowWidth / BASE_BAR_LENGTH;
  barLength = Math.max(1, Math.round(BASE_BAR_LENGTH * scale));
  barHeight = Math.max(1, Math.round(BASE_BAR_HEIGHT * scale));
}

function setup() {
  recalcDimensions();
  createCanvas(windowWidth, windowHeight); // 全屏画布

  initColors();

  display = new Display(barLength, barHeight);
  collisionAnimation = new Animation(); // 占位
  controller = new Controller(barLength, barHeight); // 控制器
}

function draw() {
  controller.update();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  recalcDimensions();

  // 重新构建显示与控制（使用新宽度）
  display = new Display(barLength, barHeight);
  collisionAnimation = new Animation();
  controller = new Controller(barLength, barHeight);
}
