/*
  TiltSensorCheck.ino
  Simple I2C scanner + MPU (e.g. MPU6050) checker.
  - Scans I2C bus and prints found addresses
  - If device at 0x68/0x69 found, reads WHO_AM_I and accel/gyro registers
  Upload to your board and open Serial Monitor at 115200 baud.
*/

#include <Wire.h>

const byte WHO_AM_I = 0x75;
const byte MPU_ADDRS[] = {0x68, 0x69};

void setup() {
  Serial.begin(115200);
  Wire.begin();
  delay(100);
  Serial.println("\n=== TiltSensorCheck ===");
  scanI2C();
}

void loop() {
  // Check for MPU at common addresses
  bool mpuFound = false;
  byte mpuAddr = 0;
  for (byte i = 0; i < sizeof(MPU_ADDRS); i++) {
    if (devicePresent(MPU_ADDRS[i])) {
      mpuFound = true;
      mpuAddr = MPU_ADDRS[i];
      break;
    }
  }

  if (mpuFound) {
    Serial.print("MPU device present at 0x"); Serial.println(mpuAddr, HEX);
    byte id = readRegister(mpuAddr, WHO_AM_I);
    Serial.print("WHO_AM_I: 0x"); Serial.println(id, HEX);
    readAccelGyro(mpuAddr);
  } else {
    Serial.println("No MPU found at 0x68/0x69. If your sensor uses a different address, check wiring.");
  }

  Serial.println("---");
  delay(1000);
}

int scanI2C() {
  Serial.println("Scanning I2C bus...");
  int count = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("Found I2C device at 0x");
      if (addr < 16) Serial.print('0');
      Serial.println(addr, HEX);
      count++;
    }
  }
  if (count == 0) Serial.println("No I2C devices found. Check wiring (SDA/SCL/GND/VCC) and pull-ups.");
  return count;
}

bool devicePresent(byte addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

byte readRegister(byte addr, byte reg) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return 0xFF;
  Wire.requestFrom(addr, (byte)1);
  if (Wire.available()) return Wire.read();
  return 0xFF;
}

void readAccelGyro(byte addr) {
  const byte ACCEL_XOUT_H = 0x3B;
  Wire.beginTransmission(addr);
  Wire.write(ACCEL_XOUT_H);
  if (Wire.endTransmission(false) != 0) {
    Serial.println("Failed to request sensor registers.");
    return;
  }
  Wire.requestFrom(addr, (byte)14);
  if (Wire.available() < 14) {
    Serial.println("Not enough bytes available from sensor.");
    return;
  }

  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  int16_t temp = (Wire.read() << 8) | Wire.read();
  int16_t gx = (Wire.read() << 8) | Wire.read();
  int16_t gy = (Wire.read() << 8) | Wire.read();
  int16_t gz = (Wire.read() << 8) | Wire.read();

  Serial.print("Accel raw: "); Serial.print(ax); Serial.print(", "); Serial.print(ay); Serial.print(", "); Serial.println(az);
  Serial.print("Gyro raw:  "); Serial.print(gx); Serial.print(", "); Serial.print(gy); Serial.print(", "); Serial.println(gz);

  // Assuming default full scale +/-2g -> scale = 16384 LSB/g
  const float aRes = 16384.0;
  Serial.print("Accel g:   ");
  Serial.print(ax / aRes, 3); Serial.print(", ");
  Serial.print(ay / aRes, 3); Serial.print(", "); Serial.println(az / aRes, 3);
}
