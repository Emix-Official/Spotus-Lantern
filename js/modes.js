/**
 * Spotus Lantern - Lighting Modes & Color Synthesizer
 * Formulates the target RGB output according to the active audio frame and mode.
 */

class SpotusModesEngine {
  constructor() {
    this.currentMode = 'bass-pulse'; // 'bass-pulse' | 'spectrum-flow' | 'album-harmony' | 'neon-strobe' | 'ambient-breathe' | 'manual'
    this.manualColor = { r: 29, g: 185, b: 84 }; // Spotify green default
    this.masterBrightness = 1.0; // 0.0 to 1.0
    
    // Internal animation state
    this.pulseDecay = 0;
    this.hueShift = 0;
    this.strobeState = false;
    this.ambientPhase = 0;
    
    // Palette references
    this.albumPalette = [
      { r: 254, g: 0, b: 118 },
      { r: 0, g: 242, b: 254 },
      { r: 29, g: 185, b: 84 }
    ];
  }

  setMode(mode) {
    this.currentMode = mode;
  }

  setManualColor(r, g, b) {
    this.manualColor = { r, g, b };
    if (this.currentMode !== 'manual') {
      this.currentMode = 'manual';
    }
  }

  setBrightness(percent) {
    this.masterBrightness = Math.max(0.05, Math.min(1.0, percent / 100));
  }

  setAlbumPalette(palette) {
    if (Array.isArray(palette) && palette.length > 0) {
      this.albumPalette = palette;
    }
  }

  /**
   * Calculate next target RGB frame given audio data
   */
  computeFrame(audioData) {
    let outR = 0, outG = 0, outB = 0;

    const bass = audioData ? audioData.bass : 0;
    const mid = audioData ? audioData.mid : 0;
    const treble = audioData ? audioData.treble : 0;
    const volume = audioData ? audioData.volume : 0;
    const isBeat = audioData ? audioData.isBeat : false;
    const beatIntensity = audioData ? audioData.beatIntensity : 0;

    switch (this.currentMode) {
      case 'bass-pulse': {
        // Pulse on kick drop, smoothly decay
        if (isBeat) {
          this.pulseDecay = 1.0 + (beatIntensity * 0.4);
          this.hueShift = (this.hueShift + 35) % 360;
        } else {
          this.pulseDecay *= 0.88; // Quick decay
        }

        // Floor baseline ambient level
        const level = Math.max(0.12, Math.min(1.0, (bass * 0.4) + (this.pulseDecay * 0.6)));
        const rgb = this._hsvToRgb(this.hueShift, 0.9, level);
        outR = rgb.r;
        outG = rgb.g;
        outB = rgb.b;
        break;
      }

      case 'spectrum-flow': {
        // Multi-band frequency mixing
        // Bass -> Red/Magenta channel
        // Mid  -> Emerald/Green channel
        // Treble -> Cyan/Blue channel
        outR = Math.min(255, (bass * 230) + (treble * 40));
        outG = Math.min(255, (mid * 240) + (treble * 60));
        outB = Math.min(255, (treble * 220) + (bass * 80));

        // Subtle boost on beats
        if (isBeat) {
          outR = Math.min(255, outR * 1.35);
          outG = Math.min(255, outG * 1.25);
          outB = Math.min(255, outB * 1.35);
        }
        break;
      }

      case 'album-harmony': {
        // Sync with Spotify album colors
        const c1 = this.albumPalette[0] || { r: 29, g: 185, b: 84 };
        const c2 = this.albumPalette[1] || { r: 0, g: 242, b: 254 };

        // Modulate blend ratio with audio volume
        const blend = Math.max(0, Math.min(1, volume * 1.5));
        const baseR = (c1.r * (1 - blend)) + (c2.r * blend);
        const baseG = (c1.g * (1 - blend)) + (c2.g * blend);
        const baseB = (c1.b * (1 - blend)) + (c2.b * blend);

        const energyScale = Math.max(0.2, Math.min(1.0, (volume * 0.7) + (isBeat ? 0.35 : 0)));
        outR = baseR * energyScale;
        outG = baseG * energyScale;
        outB = baseB * energyScale;
        break;
      }

      case 'neon-strobe': {
        // High-energy rave strobe
        if (isBeat) {
          this.strobeState = !this.strobeState;
          if (this.strobeState) {
            outR = 255;
            outG = 255;
            outB = 255; // White strobe flash
          } else {
            outR = 254;
            outG = 0;
            outB = 118; // Neon magenta
          }
        } else {
          // Dim cyan baseline
          outR = 0;
          outG = 40;
          outB = 60;
        }
        break;
      }

      case 'ambient-breathe': {
        // Slow hypnotic sine wave glow
        this.ambientPhase += 0.04 + (volume * 0.08);
        const sineWave = (Math.sin(this.ambientPhase) + 1) / 2; // 0 to 1
        const hue = (this.ambientPhase * 15) % 360;
        const brightness = 0.25 + (sineWave * 0.75);
        const rgb = this._hsvToRgb(hue, 0.85, brightness);
        outR = rgb.r;
        outG = rgb.g;
        outB = rgb.b;
        break;
      }

      case 'manual':
      default: {
        outR = this.manualColor.r;
        outG = this.manualColor.g;
        outB = this.manualColor.b;
        break;
      }
    }

    // Apply master brightness scaling
    outR = Math.round(Math.max(0, Math.min(255, outR * this.masterBrightness)));
    outG = Math.round(Math.max(0, Math.min(255, outG * this.masterBrightness)));
    outB = Math.round(Math.max(0, Math.min(255, outB * this.masterBrightness)));

    return { r: outR, g: outG, b: outB };
  }

  _hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor((h / 60) % 6);
    const f = (h / 60) - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
      default: r = 0; g = 0; b = 0; break;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }
}

// Global instance
window.spotusModes = new SpotusModesEngine();
