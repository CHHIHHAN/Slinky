#include <Wire.h>

float GRAV = 9.80665;

const byte WHO_AM_I_REG = 0x75;

// --------------------- End A -----------------------
const int TILT_A_PIN = 16;
uint8_t MPU_A_ADDR = 0x68;

// per-end idle trackers (separate for A and B)
float A_idle = 0.0f;
float B_idle = 0.0f;

// previous tilt state for edge detection (A)
int prevTiltA = 0;
// previous tilt state for edge detection (B)
int prevTiltB = 0;

const int FORCE_WINDOW = 120;

bool A_capturing = false;
bool A_pushHandled = false;
unsigned long A_captureStart = 0;

float A_baseline = 9.8;
float A_env = 0.0;
float A_peakEnv = 0.0;


// --------------------- End B -----------------------
const int TILT_B_PIN = 10;
uint8_t MPU_B_ADDR = 0x69;     // AD0 拉高

bool B_capturing = false;
bool B_pushHandled = false;
unsigned long B_captureStart = 0;

float B_baseline = 9.8;
float B_env = 0.0;
float B_peakEnv = 0.0;


// -------------------- MPU Raw Read --------------------
bool readAccelRaw(uint8_t addr, int16_t &ax, int16_t &ay, int16_t &az) {
  Wire.beginTransmission(addr);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;

  Wire.requestFrom((int)addr, 6, true);
  if (Wire.available() < 6) return false;

  ax = (Wire.read() << 8) | Wire.read();
  ay = (Wire.read() << 8) | Wire.read();
  az = (Wire.read() << 8) | Wire.read();

  return true;
}

float rawToMs2(int16_t v) {
  return (float)v / 16384.0f * GRAV;
}


// ---------------- Tilt Burst ----------------
bool checkTiltBurst(int pin) {
  return digitalRead(pin) == LOW;
}



// ---------------- Process End (enhanced) ----------------
void processEndWithLevel(
  // input
  bool &capturing,
  bool &pushHandled,
  unsigned long &captureStart,
  float &baseline,
  float &env,
  float &peakEnv,
  uint8_t MPU_ADDR,
  int tiltPin,
  bool tiltEdge,
  bool altEnv,
  float &idle,
  // output
  float &envOut,
  bool &didPush,
  float &pushForce,
  int &pushLevel
) {

  didPush   = false;
  pushLevel = 0;

  bool tiltValid = checkTiltBurst(tiltPin);

  // -------- read mpu --------
  int16_t ax_raw, ay_raw, az_raw;
  readAccelRaw(MPU_ADDR, ax_raw, ay_raw, az_raw);
  float az = rawToMs2(az_raw);

  baseline = baseline * 0.9997 + az * 0.0003;

  float dyn = az - baseline;
  float envInput = fabs(dyn);

  // Alternate envelope for end A: slightly faster rise, different decay and idle smoothing
  if (altEnv) {
    env = max(env * 0.85f, envInput);   // faster rise / slower decay than default
    envOut = env;
    // idle estimation for alt: respond a bit faster to baseline changes
    idle = idle * 0.99f + envOut * 0.01f;

    // -------- start capture window (alt) --------
    if (!capturing && tiltValid && !pushHandled && envOut > idle * 1.1f) {
      capturing = true;
      captureStart = millis();
      peakEnv = envOut;
    }

    // Immediate edge-trigger behavior: if tilt edge (0->1) occurs, treat as instantaneous push
    if (tiltEdge && !pushHandled) {
      float ratio = envOut / (idle + 0.0001f);
      float ratioThreshold = 1.6f; // slightly more sensitive for A
      if (ratio > ratioThreshold) {
        didPush = true;
        pushForce = envOut - idle;
        pushHandled = true;
        // level mapping
        if      (ratio >= 6.0f) pushLevel = 3;
        else if (ratio >= 3.0f) pushLevel = 2;
        else                    pushLevel = 1;
        // ensure we are not left in capturing state
        capturing = false;
      }
    }
  } else {
    env = max(env * 0.80f, envInput);
    envOut = env;

    // idle estimation (default)
    idle = idle * 0.995f + envOut * 0.005f;

    float threshold = idle * 1.8f;

    // Immediate edge-trigger for non-alt (e.g., End B): if tilt edge 0->1, check ratio now
    if (tiltEdge && !pushHandled) {
      float ratio = envOut / (idle + 0.0001f);
      float ratioThreshold = 1.8f;
      if (ratio > ratioThreshold) {
        didPush = true;
        pushForce = envOut - idle;
        pushHandled = true;
        if      (ratio >= 6.0f) pushLevel = 3;
        else if (ratio >= 3.0f) pushLevel = 2;
        else                    pushLevel = 1;
        capturing = false;
      }
    }

    // -------- start capture window (default) --------
    if (!capturing && tiltValid && !pushHandled && envOut > idle * 1.2f) {
      capturing = true;
      captureStart = millis();
      peakEnv = envOut;
    }
  }


  // -------- capturing --------
  if (capturing) {
    if (envOut > peakEnv) peakEnv = envOut;

    if (millis() - captureStart > FORCE_WINDOW) {
      capturing = false;
      pushHandled = true;

      // For ratio threshold we allow slightly more sensitivity when altEnv is used
      float ratio = peakEnv / (idle + 0.0001f);
      float ratioThreshold = altEnv ? 1.6f : 1.8f;

      if (ratio > ratioThreshold) {
        didPush = true;
        pushForce = peakEnv - idle;

        // ------- Push Level Mapping -------
        if      (ratio >= 6.0f) pushLevel = 3;
        else if (ratio >= 3.0f) pushLevel = 2;
        else                    pushLevel = 1;
      }
    }
  }

  if (!tiltValid) pushHandled = false;
}



// -------------------- setup --------------------
void setup() {
  Serial.begin(115200);
  while (!Serial);

  pinMode(TILT_A_PIN, INPUT_PULLUP);
  pinMode(TILT_B_PIN, INPUT_PULLUP);

  // initialize prevTiltA to current state to avoid spurious edge at startup
  prevTiltA = (digitalRead(TILT_A_PIN) == LOW) ? 1 : 0;
  // initialize prevTiltB to current state to avoid spurious edge at startup
  prevTiltB = (digitalRead(TILT_B_PIN) == LOW) ? 1 : 0;
  Wire.begin();
  Wire.setClock(400000);

  // Wake A
  Wire.beginTransmission(MPU_A_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission();

  // Wake B
  Wire.beginTransmission(MPU_B_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission();

  Serial.println("Start JSON Mode");

  // --- Debug: read WHO_AM_I for A and B (helps identify module)
  Wire.beginTransmission(MPU_A_ADDR);
  Wire.write(WHO_AM_I_REG);
  if (Wire.endTransmission(false) == 0) {
    Wire.requestFrom((int)MPU_A_ADDR, (int)1);
    if (Wire.available()) {
      byte idA = Wire.read();
      Serial.print("MPU A WHO_AM_I: 0x"); Serial.println(idA, HEX);
    }
  } else {
    Serial.println("Failed to read WHO_AM_I from MPU A");
  }

  Wire.beginTransmission(MPU_B_ADDR);
  Wire.write(WHO_AM_I_REG);
  if (Wire.endTransmission(false) == 0) {
    Wire.requestFrom((int)MPU_B_ADDR, (int)1);
    if (Wire.available()) {
      byte idB = Wire.read();
      Serial.print("MPU B WHO_AM_I: 0x"); Serial.println(idB, HEX);
    }
  } else {
    Serial.println("Failed to read WHO_AM_I from MPU B");
  }
}



// -------------------- loop --------------------
void loop() {

  float A_envOut, B_envOut;
  bool  A_pushed, B_pushed;
  float A_force,  B_force;
  int   A_level,  B_level;
  // read tilt pins first and detect A-edge (0->1)
  int tiltAraw = (digitalRead(TILT_A_PIN) == LOW) ? 1 : 0;
  int tiltBraw = (digitalRead(TILT_B_PIN) == LOW) ? 1 : 0;
  bool tiltAedge = (prevTiltA == 0 && tiltAraw == 1);
  bool tiltBedge = (prevTiltB == 0 && tiltBraw == 1);

  processEndWithLevel(
    A_capturing, A_pushHandled, A_captureStart,
    A_baseline, A_env, A_peakEnv,
    MPU_A_ADDR, TILT_A_PIN, tiltAedge, true, A_idle,
    A_envOut, A_pushed, A_force, A_level
  );

  processEndWithLevel(
    B_capturing, B_pushHandled, B_captureStart,
    B_baseline, B_env, B_peakEnv,
    MPU_B_ADDR, TILT_B_PIN, tiltBedge, false, B_idle,
    B_envOut, B_pushed, B_force, B_level
  );

  // ---- JSON output ----
  // tiltAraw/tiltBraw already read above for edge detection
  // update prevTiltA for next loop
  prevTiltA = tiltAraw;
  // update prevTiltB for next loop
  prevTiltB = tiltBraw;

  Serial.print("{\"A\":{");
  Serial.print("\"p\":");   Serial.print(A_pushed ? 1 : 0); Serial.print(",");
  Serial.print("\"tilt\":"); Serial.print(tiltAraw); Serial.print(",");
  Serial.print("\"lvl\":"); Serial.print(A_level);          Serial.print(",");
  Serial.print("\"env\":"); Serial.print(A_envOut, 2);
  Serial.print("},");

  Serial.print("\"B\":{");
  Serial.print("\"p\":");   Serial.print(B_pushed ? 1 : 0); Serial.print(",");
  Serial.print("\"tilt\":"); Serial.print(tiltBraw); Serial.print(",");
  Serial.print("\"lvl\":"); Serial.print(B_level);          Serial.print(",");
  Serial.print("\"env\":"); Serial.print(B_envOut, 2);
  Serial.print("}}");
  Serial.println();

  delay(20);
}
