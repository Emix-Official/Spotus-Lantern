/**
 * Spotus Lantern - Bluetooth Low Energy (BLE) Engine
 * Reverse-engineered protocol for Lotus Lantern / ELK-BLEDOM / MELK RGB controllers.
 * Fully supports custom pin ordering (GBR, RGB, GRB, etc.) with rate-limited streaming.
 */

class LotusBLEController {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.isConnecting = false;
    
    // Hardware Color Order mapping
    // Default to 'GBR' per user's specific LED hardware setup
    this.colorOrder = 'GBR';
    
    // Services and Characteristics known for Lotus Lantern / ELK-BLEDOM
    this.SERVICE_UUIDS = [
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ffd5-0000-1000-8000-00805f9b34fb',
      '0000ffb0-0000-1000-8000-00805f9b34fb'
    ];
    
    this.WRITE_CHAR_UUIDS = [
      '0000fff3-0000-1000-8000-00805f9b34fb',
      '0000ffe1-0000-1000-8000-00805f9b34fb',
      '0000ffd9-0000-1000-8000-00805f9b34fb',
      '0000ffb2-0000-1000-8000-00805f9b34fb'
    ];

    // Rate limiter state (BLE transmission bandwidth limit: ~15-20 updates/sec max)
    this.minIntervalMs = 50; // ~20 FPS max rate
    this.lastSendTime = 0;
    this.pendingColor = null;
    this.isTransmitting = false;
    this.lastSentRGB = { r: -1, g: -1, b: -1 };
    
    // Event listeners
    this.onStatusChange = null;
    this.onError = null;
    this.onPacketSent = null;
  }

  setColorOrder(order) {
    this.colorOrder = order.toUpperCase();
  }

  /**
   * Remap Target RGB (R, G, B) into the physical channel bytes expected by the controller
   * For the user's GBR strip:
   * Target Red   -> Channel 3 (B pin in RGB)
   * Target Green -> Channel 1 (R pin in RGB)
   * Target Blue  -> Channel 2 (G pin in RGB)
   */
  mapRGBChannels(r, g, b) {
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));

    switch (this.colorOrder) {
      case 'GBR':
        // Channel 1: Green, Channel 2: Blue, Channel 3: Red
        return { ch1: g, ch2: b, ch3: r };
      case 'GRB':
        return { ch1: g, ch2: r, ch3: b };
      case 'BRG':
        return { ch1: b, ch2: r, ch3: g };
      case 'BGR':
        return { ch1: b, ch2: g, ch3: r };
      case 'RBG':
        return { ch1: r, ch2: b, ch3: g };
      case 'RGB':
      default:
        return { ch1: r, ch2: g, ch3: b };
    }
  }

  isSupported() {
    return !!(navigator && navigator.bluetooth);
  }

  async connect() {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Google Chrome or Microsoft Edge on Windows/macOS/Android.');
    }

    try {
      this.isConnecting = true;
      this._emitStatus('connecting', 'Requesting Bluetooth Device...');

      // Request device with optionalServices so we can access GATT services
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'ELK' },
          { namePrefix: 'Lotus' },
          { namePrefix: 'MELK' },
          { namePrefix: 'LED' },
          { namePrefix: 'Triones' },
          { namePrefix: 'SP105' }
        ],
        optionalServices: this.SERVICE_UUIDS
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this._handleDisconnect();
      });

      this._emitStatus('connecting', `Connecting to GATT server on ${this.device.name || 'LED Strip'}...`);
      this.server = await this.device.gatt.connect();

      // Find primary service
      let service = null;
      for (const serviceUuid of this.SERVICE_UUIDS) {
        try {
          service = await this.server.getPrimaryService(serviceUuid);
          if (service) break;
        } catch (e) {
          // Continue searching other service UUIDs
        }
      }

      if (!service) {
        throw new Error('Could not find compatible Lotus/ELK BLE service on this device.');
      }

      // Find write characteristic
      for (const charUuid of this.WRITE_CHAR_UUIDS) {
        try {
          this.characteristic = await service.getCharacteristic(charUuid);
          if (this.characteristic) break;
        } catch (e) {
          // Continue searching other characteristic UUIDs
        }
      }

      if (!this.characteristic) {
        throw new Error('Could not locate writable BLE characteristic.');
      }

      this.isConnected = true;
      this.isConnecting = false;
      this._emitStatus('connected', `Connected to ${this.device.name || 'Lotus LED'}`);

      // Wake up / power on lights
      await this.setPower(true);
      return this.device.name || 'Lotus Lantern';
    } catch (err) {
      this.isConnecting = false;
      this.isConnected = false;
      this._emitStatus('disconnected', err.message || 'Connection failed');
      throw err;
    }
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._handleDisconnect();
  }

  _handleDisconnect() {
    this.isConnected = false;
    this.isConnecting = false;
    this.characteristic = null;
    this.server = null;
    this.lastSentRGB = { r: -1, g: -1, b: -1 };
    this._emitStatus('disconnected', 'Disconnected from LED Controller');
  }

  _emitStatus(state, detail) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange({ state, detail, deviceName: this.device ? this.device.name : null });
    }
  }

  /**
   * Low-level raw packet write with fallback for writeValueWithResponse
   */
  async _writeRaw(bytes) {
    if (!this.characteristic || !this.isConnected) return false;
    try {
      const buffer = new Uint8Array(bytes);
      if (this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(buffer);
      } else {
        await this.characteristic.writeValue(buffer);
      }
      
      if (typeof this.onPacketSent === 'function') {
        this.onPacketSent(buffer);
      }
      return true;
    } catch (err) {
      if (typeof this.onError === 'function') {
        this.onError(err);
      }
      return false;
    }
  }

  /**
   * Power ON / OFF
   * 9-byte packet: 7E 04 04 [01/00] FF FF FF 00 EF
   */
  async setPower(on) {
    const stateByte = on ? 0x01 : 0x00;
    const packet = [0x7E, 0x04, 0x04, stateByte, 0xFF, 0xFF, 0xFF, 0x00, 0xEF];
    return await this._writeRaw(packet);
  }

  /**
   * Brightness Control (0 to 100%)
   * 9-byte packet: 7E 07 01 [Percent 0-64 hex] FF FF FF 00 EF
   */
  async setBrightness(percent) {
    const val = Math.max(0, Math.min(100, Math.round(percent)));
    const packet = [0x7E, 0x07, 0x01, val, 0xFF, 0xFF, 0xFF, 0x00, 0xEF];
    return await this._writeRaw(packet);
  }

  /**
   * Animation Speed Control (0 to 100%)
   * 9-byte packet: 7E 04 02 [Speed 0-64 hex] FF FF FF 00 EF
   */
  async setSpeed(percent) {
    const val = Math.max(0, Math.min(100, Math.round(percent)));
    const packet = [0x7E, 0x04, 0x02, val, 0xFF, 0xFF, 0xFF, 0x00, 0xEF];
    return await this._writeRaw(packet);
  }

  /**
   * Hardware Preset Mode (0 to 212)
   * 9-byte packet: 7E 07 03 [ModeID] FF FF FF 00 EF
   */
  async setHardwareMode(modeId) {
    const mode = Math.max(0, Math.min(212, Math.round(modeId)));
    const packet = [0x7E, 0x07, 0x03, mode, 0xFF, 0xFF, 0xFF, 0x00, 0xEF];
    return await this._writeRaw(packet);
  }

  /**
   * Immediate Color Setting (Preempts queue)
   */
  async setRGBImmediate(r, g, b) {
    const { ch1, ch2, ch3 } = this.mapRGBChannels(r, g, b);
    // Standard Lotus 9-byte Color packet: 7E 07 05 03 [Ch1] [Ch2] [Ch3] 10 EF
    const packet = [0x7E, 0x07, 0x05, 0x03, ch1, ch2, ch3, 0x10, 0xEF];
    this.lastSentRGB = { r, g, b };
    return await this._writeRaw(packet);
  }

  /**
   * Streamed RGB for Audio Reactive Visualizer (Rate-limited to prevent BLE packet congestion)
   */
  sendStreamRGB(r, g, b) {
    if (!this.isConnected) return;

    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));

    // Deadband check to avoid re-sending identical colors
    if (
      Math.abs(this.lastSentRGB.r - r) < 2 &&
      Math.abs(this.lastSentRGB.g - g) < 2 &&
      Math.abs(this.lastSentRGB.b - b) < 2
    ) {
      return;
    }

    this.pendingColor = { r, g, b };

    const now = performance.now();
    if (!this.isTransmitting && now - this.lastSendTime >= this.minIntervalMs) {
      this._flushStreamRGB();
    }
  }

  async _flushStreamRGB() {
    if (!this.pendingColor || this.isTransmitting || !this.isConnected) return;

    const { r, g, b } = this.pendingColor;
    this.pendingColor = null;
    this.isTransmitting = true;
    this.lastSendTime = performance.now();

    try {
      const { ch1, ch2, ch3 } = this.mapRGBChannels(r, g, b);
      const packet = [0x7E, 0x07, 0x05, 0x03, ch1, ch2, ch3, 0x10, 0xEF];
      await this._writeRaw(packet);
      this.lastSentRGB = { r, g, b };
    } catch (err) {
      // Stream packet error
    } finally {
      this.isTransmitting = false;
      // If a newer pending frame arrived while transmitting, flush next frame
      if (this.pendingColor) {
        const elapsed = performance.now() - this.lastSendTime;
        const delay = Math.max(0, this.minIntervalMs - elapsed);
        setTimeout(() => this._flushStreamRGB(), delay);
      }
    }
  }
}

// Global instance
window.lotusBLE = new LotusBLEController();
