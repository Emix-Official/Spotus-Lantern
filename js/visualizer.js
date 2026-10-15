/**
 * Spotus Lantern - Real-Time Canvas Audio Visualizer
 * Renders high-frame-rate responsive spectrum bars, oscilloscope waveform,
 * and reactive beat burst rings with cyber-studio aesthetics.
 */

class SpotusVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.barCount = 48;
    this.peaks = new Array(this.barCount).fill(0);
    this.peakDecay = 0.96;
    
    // Beat pulse visual state
    this.beatPulseSize = 0;
    this.activeGlowColor = 'rgba(29, 185, 84, 0.4)';
    
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());
  }

  _handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  setGlowColor(r, g, b) {
    this.activeGlowColor = `rgba(${r}, ${g}, ${b}, 0.45)`;
  }

  triggerBeat(intensity) {
    this.beatPulseSize = Math.max(this.beatPulseSize, 1.0 + (intensity * 0.8));
  }

  draw(audioData, activeRGB) {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear canvas with subtle trail fade for smooth motion blur
    ctx.fillStyle = 'rgba(7, 8, 11, 0.35)';
    ctx.fillRect(0, 0, w, h);

    if (activeRGB) {
      this.setGlowColor(activeRGB.r, activeRGB.g, activeRGB.b);
    }

    // 1. Draw Beat Ambient Glow in Center
    if (this.beatPulseSize > 0.05) {
      const radius = Math.min(w, h) * 0.45 * this.beatPulseSize;
      const glowGrad = ctx.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, radius);
      glowGrad.addColorStop(0, this.activeGlowColor);
      glowGrad.addColorStop(0.5, 'rgba(0, 242, 254, 0.08)');
      glowGrad.addColorStop(1, 'transparent');
      
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
      ctx.fill();
      
      this.beatPulseSize *= 0.91; // Smooth decay
    }

    if (!audioData || !audioData.freqData) {
      // Idle state: Subtle breathing baseline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const { freqData, timeData } = audioData;

    // 2. Draw 48-Band Mirrored Spectrum Bars
    const totalBars = this.barCount;
    const barWidth = (w / totalBars) * 0.72;
    const barSpacing = (w / totalBars) * 0.28;
    const step = Math.floor(freqData.length / totalBars / 2.5);

    for (let i = 0; i < totalBars; i++) {
      const freqIndex = Math.min(freqData.length - 1, i * step + 1);
      const val = freqData[freqIndex] / 255;
      const targetHeight = val * (h * 0.75);

      // Smooth peak hold
      if (targetHeight > this.peaks[i]) {
        this.peaks[i] = targetHeight;
      } else {
        this.peaks[i] *= this.peakDecay;
      }

      const x = i * (barWidth + barSpacing) + (barSpacing / 2);
      const y = h - targetHeight;

      // Dynamic Gradient based on frequency and active lighting
      const barGrad = ctx.createLinearGradient(0, y, 0, h);
      if (i < totalBars * 0.25) {
        // Bass region: Neon Magenta / Emerald
        barGrad.addColorStop(0, '#fe0076');
        barGrad.addColorStop(1, 'rgba(254, 0, 118, 0.15)');
      } else if (i < totalBars * 0.65) {
        // Mids: Spotify Green / Cyan
        barGrad.addColorStop(0, '#1ed760');
        barGrad.addColorStop(1, 'rgba(30, 215, 96, 0.15)');
      } else {
        // Highs: Electric Cyan / Ice White
        barGrad.addColorStop(0, '#00f2fe');
        barGrad.addColorStop(1, 'rgba(0, 242, 254, 0.15)');
      }

      // Draw rounded bar
      ctx.fillStyle = barGrad;
      this._roundRect(ctx, x, y, barWidth, targetHeight, 4);
      ctx.fill();

      // Peak Indicator Cap
      const peakY = h - this.peaks[i];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, peakY - 2, barWidth, 2);
    }

    // 3. Draw Oscilloscope Waveform Overlay
    if (timeData) {
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();

      const sliceWidth = w / timeData.length;
      let waveX = 0;

      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i] / 128.0; // 0 to 2
        const waveY = (v * (h / 3.2)) + (h * 0.35);

        if (i === 0) {
          ctx.moveTo(waveX, waveY);
        } else {
          ctx.lineTo(waveX, waveY);
        }
        waveX += sliceWidth;
      }
      ctx.stroke();
    }
  }

  _roundRect(ctx, x, y, width, height, radius) {
    if (height < 2) return;
    radius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

window.SpotusVisualizer = SpotusVisualizer;
