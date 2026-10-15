/**
 * Spotus Lantern - Audio Analysis & Beat Detection Engine
 * Integrates Web Audio API, System Loopback, Microphone, and Demo Synthesizer.
 * Provides multi-band FFT filtering and adaptive dynamic beat tracking.
 */

class SpotusAudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.activeStream = null;
    this.activeSourceType = 'none'; // 'system' | 'mic' | 'demo' | 'none'
    
    // FFT Settings
    this.fftSize = 1024;
    this.frequencyBinCount = 512;
    this.freqData = new Uint8Array(512);
    this.timeData = new Uint8Array(512);
    
    // Beat Detection & Energy Tracker
    this.energyHistory = [];
    this.historyLength = 40;
    this.beatThreshold = 1.35; // Multiplier over moving average
    this.sensitivity = 1.0;
    this.lastBeatTime = 0;
    this.beatCooldownMs = 150;
    this.currentBass = 0;
    this.currentMid = 0;
    this.currentTreble = 0;
    this.currentVolume = 0;
    this.isBeat = false;
    this.beatIntensity = 0;
    
    // Synthetic Demo Simulator state
    this.demoInterval = null;
    this.demoGainNode = null;
    
    // Callbacks
    this.onBeat = null;
    this.onFrame = null;
    this.onSourceChange = null;
  }

  _initContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.78;
      this.frequencyBinCount = this.analyser.frequencyBinCount;
      this.freqData = new Uint8Array(this.frequencyBinCount);
      this.timeData = new Uint8Array(this.frequencyBinCount);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  setSensitivity(val) {
    // Val between 0.5 (low sensitivity, only heavy kicks) and 2.0 (high sensitivity)
    this.sensitivity = Math.max(0.4, Math.min(2.5, val));
    this.beatThreshold = 1.55 - (this.sensitivity * 0.25);
  }

  /**
   * Capture System / Spotify Tab Audio via getDisplayMedia
   */
  async startSystemCapture() {
    this._initContext();
    this.stopCurrentSource();

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        // User didn't check "Also share system audio"
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error('No audio track selected. Make sure to check "Also share system audio" or share the Spotify tab.');
      }

      // Stop video track immediately to save CPU/GPU resources
      displayStream.getVideoTracks().forEach(track => track.stop());

      // Create stream with just the audio
      this.activeStream = new MediaStream([audioTracks[0]]);
      audioTracks[0].addEventListener('ended', () => {
        this.stopCurrentSource();
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.activeStream);
      this.sourceNode.connect(this.analyser);
      this.activeSourceType = 'system';

      this._emitSourceChange('system', 'System Audio (Active)');
      return true;
    } catch (err) {
      this.activeSourceType = 'none';
      this._emitSourceChange('none', 'Capture cancelled or failed');
      throw err;
    }
  }

  /**
   * Capture Microphone / Line-in Audio
   */
  async startMicrophoneCapture() {
    this._initContext();
    this.stopCurrentSource();

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.activeStream = micStream;
      this.sourceNode = this.audioContext.createMediaStreamSource(micStream);
      this.sourceNode.connect(this.analyser);
      this.activeSourceType = 'mic';

      this._emitSourceChange('mic', 'Microphone (Active)');
      return true;
    } catch (err) {
      this.activeSourceType = 'none';
      this._emitSourceChange('none', 'Microphone access denied');
      throw err;
    }
  }

  /**
   * Built-in Synthetic Demo Simulator (Electronic 128 BPM Pulse)
   */
  startDemoSynthesizer() {
    this._initContext();
    this.stopCurrentSource();

    this.demoGainNode = this.audioContext.createGain();
    this.demoGainNode.gain.setValueAtTime(0.01, this.audioContext.currentTime); // Very quiet so it doesn't disturb user
    this.demoGainNode.connect(this.analyser);
    // Do not connect to audioContext.destination so it won't blast speakers, but feeds FFT cleanly!

    this.activeSourceType = 'demo';
    this._emitSourceChange('demo', 'Demo Synthesizer (128 BPM)');

    let beatCounter = 0;
    const intervalMs = (60 / 128) * 1000; // ~468ms per beat

    this.demoInterval = setInterval(() => {
      if (this.activeSourceType !== 'demo') return;
      
      const now = this.audioContext.currentTime;
      // Synthesize a punchy 60Hz kick oscillator
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.demoGainNode);

      osc.start(now);
      osc.stop(now + 0.25);

      // Add hi-hat or mid sizzle on off-beats
      if (beatCounter % 2 === 1) {
        const noiseOsc = this.audioContext.createOscillator();
        const noiseGain = this.audioContext.createGain();
        noiseOsc.type = 'triangle';
        noiseOsc.frequency.setValueAtTime(4500, now);
        noiseGain.gain.setValueAtTime(0.4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noiseOsc.connect(noiseGain);
        noiseGain.connect(this.demoGainNode);
        noiseOsc.start(now);
        noiseOsc.stop(now + 0.09);
      }
      beatCounter++;
    }, intervalMs);
  }

  stopCurrentSource() {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    if (this.demoGainNode) {
      try { this.demoGainNode.disconnect(); } catch (e) {}
      this.demoGainNode = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(t => t.stop());
      this.activeStream = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (e) {}
      this.sourceNode = null;
    }
    this.activeSourceType = 'none';
    this._emitSourceChange('none', 'No Audio Source');
  }

  _emitSourceChange(type, label) {
    if (typeof this.onSourceChange === 'function') {
      this.onSourceChange({ type, label });
    }
  }

  /**
   * Update audio analysis frame (called inside requestAnimationFrame loop)
   */
  processFrame() {
    if (!this.analyser || this.activeSourceType === 'none') {
      return {
        freqData: null,
        timeData: null,
        bass: 0,
        mid: 0,
        treble: 0,
        volume: 0,
        isBeat: false,
        beatIntensity: 0
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    // Audio frequency bands
    // Sample rate ~44100Hz or 48000Hz, bin width ~43Hz
    // Sub-bass & Bass: Bins 1 to 6 (~40Hz - 250Hz)
    // Midrange: Bins 7 to 35 (~250Hz - 1500Hz)
    // Treble: Bins 36 to 140 (~1500Hz - 6000Hz)

    let bassSum = 0;
    const bassBins = 6;
    for (let i = 1; i <= bassBins; i++) {
      bassSum += this.freqData[i];
    }
    const rawBass = bassSum / (bassBins * 255);

    let midSum = 0;
    const midStart = 7, midEnd = 35;
    for (let i = midStart; i <= midEnd; i++) {
      midSum += this.freqData[i];
    }
    const rawMid = midSum / ((midEnd - midStart + 1) * 255);

    let trebleSum = 0;
    const trebleStart = 36, trebleEnd = 140;
    for (let i = trebleStart; i <= trebleEnd; i++) {
      trebleSum += this.freqData[i];
    }
    const rawTreble = trebleSum / ((trebleEnd - trebleStart + 1) * 255);

    // Overall energy/volume
    const rawVolume = (rawBass * 0.5) + (rawMid * 0.3) + (rawTreble * 0.2);

    // Smooth values
    this.currentBass = (this.currentBass * 0.3) + (rawBass * 0.7);
    this.currentMid = (this.currentMid * 0.4) + (rawMid * 0.6);
    this.currentTreble = (this.currentTreble * 0.4) + (rawTreble * 0.6);
    this.currentVolume = (this.currentVolume * 0.3) + (rawVolume * 0.7);

    // Beat Detection using Moving Average Variance
    this.energyHistory.push(rawBass);
    if (this.energyHistory.length > this.historyLength) {
      this.energyHistory.shift();
    }

    let avgEnergy = 0;
    for (let i = 0; i < this.energyHistory.length; i++) {
      avgEnergy += this.energyHistory[i];
    }
    avgEnergy = avgEnergy / Math.max(1, this.energyHistory.length);

    const now = performance.now();
    const timeSinceLastBeat = now - this.lastBeatTime;

    this.isBeat = false;
    this.beatIntensity = 0;

    // Trigger beat if bass surpasses threshold and cooldown elapsed
    if (
      rawBass > 0.15 &&
      rawBass > (avgEnergy * this.beatThreshold) &&
      timeSinceLastBeat > this.beatCooldownMs
    ) {
      this.isBeat = true;
      this.lastBeatTime = now;
      this.beatIntensity = Math.min(1.0, (rawBass - avgEnergy) * 3.5);

      if (typeof this.onBeat === 'function') {
        this.onBeat({
          intensity: this.beatIntensity,
          bass: this.currentBass,
          timestamp: now
        });
      }
    }

    const frameData = {
      freqData: this.freqData,
      timeData: this.timeData,
      bass: this.currentBass,
      mid: this.currentMid,
      treble: this.currentTreble,
      volume: this.currentVolume,
      isBeat: this.isBeat,
      beatIntensity: this.beatIntensity
    };

    if (typeof this.onFrame === 'function') {
      this.onFrame(frameData);
    }

    return frameData;
  }
}

// Global instance
window.spotusAudio = new SpotusAudioEngine();
