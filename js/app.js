/**
 * Spotus Lantern - Main Application Coordinator
 * Binds BLE, Audio, Spotify, Modes, and Visualizer with Cyber-Studio UI.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const btnConnectBle = document.getElementById('btnConnectBle');
  const btnDisconnectBle = document.getElementById('btnDisconnectBle');
  const bleStatusPill = document.getElementById('bleStatusPill');
  const bleStatusText = document.getElementById('bleStatusText');
  const bleStatusDot = document.getElementById('bleStatusDot');
  const colorOrderSelect = document.getElementById('colorOrderSelect');

  // Test Buttons
  const btnTestRed = document.getElementById('btnTestRed');
  const btnTestGreen = document.getElementById('btnTestGreen');
  const btnTestBlue = document.getElementById('btnTestBlue');
  const btnPowerToggle = document.getElementById('btnPowerToggle');

  // Audio Source Buttons
  const sourceCards = document.querySelectorAll('.source-card');

  // Mode Selection Pills
  const modePills = document.querySelectorAll('.mode-pill');

  // Sliders
  const brightnessSlider = document.getElementById('brightnessSlider');
  const brightnessVal = document.getElementById('brightnessVal');
  const sensitivitySlider = document.getElementById('sensitivitySlider');
  const sensitivityVal = document.getElementById('sensitivityVal');
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');

  // Frequency Band Meters
  const meterBass = document.getElementById('meterBass');
  const valBass = document.getElementById('valBass');
  const meterMid = document.getElementById('meterMid');
  const valMid = document.getElementById('valMid');
  const meterTreble = document.getElementById('meterTreble');
  const valTreble = document.getElementById('valTreble');
  const meterVol = document.getElementById('meterVol');
  const valVol = document.getElementById('valVol');

  // Visualizer Overlay
  const liveAudioBadge = document.getElementById('liveAudioBadge');
  const ambientHalo = document.getElementById('ambientHalo');

  // Spotify Elements
  const btnSpotifyAuth = document.getElementById('btnSpotifyAuth');
  const btnSpotifyDemo = document.getElementById('btnSpotifyDemo');
  const spotifyClientIdInput = document.getElementById('spotifyClientIdInput');
  const trackArtwork = document.getElementById('trackArtwork');
  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  const trackEnergyFill = document.getElementById('trackEnergyFill');
  const dominantSwatchesContainer = document.getElementById('dominantSwatches');

  // Swatches & Color Picker
  const customColorInput = document.getElementById('customColorInput');
  const swatchButtons = document.querySelectorAll('.swatch-btn');
  const fxChips = document.querySelectorAll('.fx-chip');

  // Toast
  const toastNotice = document.getElementById('toastNotice');
  const toastText = document.getElementById('toastText');

  // Initialize Canvas Visualizer
  const visualizer = new window.SpotusVisualizer('visualizerCanvas');

  // Power state tracker
  let isPoweredOn = true;

  // Initialize BLE Color Order
  const savedOrder = localStorage.getItem('spotus_color_order') || 'GBR';
  colorOrderSelect.value = savedOrder;
  window.lotusBLE.setColorOrder(savedOrder);

  colorOrderSelect.addEventListener('change', (e) => {
    const order = e.target.value;
    window.lotusBLE.setColorOrder(order);
    localStorage.setItem('spotus_color_order', order);
    showToast(`Color mapping set to ${order}`);
  });

  // 1. Bluetooth Connection Handling
  btnConnectBle.addEventListener('click', async () => {
    try {
      btnConnectBle.disabled = true;
      btnConnectBle.textContent = 'Connecting...';
      const deviceName = await window.lotusBLE.connect();
      showToast(`Connected to ${deviceName}`);
    } catch (err) {
      showToast(err.message || 'Bluetooth connection failed');
    } finally {
      btnConnectBle.disabled = false;
      btnConnectBle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11"></path>
        </svg>
        Connect Lights
      `;
    }
  });

  btnDisconnectBle.addEventListener('click', async () => {
    await window.lotusBLE.disconnect();
    showToast('Disconnected from LED strip');
  });

  window.lotusBLE.onStatusChange = ({ state, detail }) => {
    bleStatusText.textContent = detail;
    if (state === 'connected') {
      bleStatusDot.className = 'status-dot connected';
      btnConnectBle.style.display = 'none';
      btnDisconnectBle.style.display = 'inline-flex';
    } else if (state === 'connecting') {
      bleStatusDot.className = 'status-dot active';
    } else {
      bleStatusDot.className = 'status-dot';
      btnConnectBle.style.display = 'inline-flex';
      btnDisconnectBle.style.display = 'none';
    }
  };

  // 2. Hardware Color Calibration Tests (Crucial for GBR verification!)
  btnTestRed.addEventListener('click', async () => {
    window.spotusModes.setManualColor(255, 0, 0);
    await window.lotusBLE.setRGBImmediate(255, 0, 0);
    showToast('Sent pure RED (Calibrating GBR)');
  });

  btnTestGreen.addEventListener('click', async () => {
    window.spotusModes.setManualColor(0, 255, 0);
    await window.lotusBLE.setRGBImmediate(0, 255, 0);
    showToast('Sent pure GREEN (Calibrating GBR)');
  });

  btnTestBlue.addEventListener('click', async () => {
    window.spotusModes.setManualColor(0, 0, 255);
    await window.lotusBLE.setRGBImmediate(0, 0, 255);
    showToast('Sent pure BLUE (Calibrating GBR)');
  });

  btnPowerToggle.addEventListener('click', async () => {
    isPoweredOn = !isPoweredOn;
    await window.lotusBLE.setPower(isPoweredOn);
    showToast(isPoweredOn ? 'LEDs turned ON' : 'LEDs turned OFF');
    btnPowerToggle.style.opacity = isPoweredOn ? '1' : '0.5';
  });

  // 3. Audio Source Selection
  sourceCards.forEach(card => {
    card.addEventListener('click', async () => {
      const source = card.dataset.source;
      sourceCards.forEach(c => c.classList.remove('active'));

      try {
        if (source === 'system') {
          await window.spotusAudio.startSystemCapture();
          card.classList.add('active');
          liveAudioBadge.classList.add('streaming');
          showToast('Streaming System / Spotify Audio');
        } else if (source === 'mic') {
          await window.spotusAudio.startMicrophoneCapture();
          card.classList.add('active');
          liveAudioBadge.classList.add('streaming');
          showToast('Microphone Audio Active');
        } else if (source === 'demo') {
          window.spotusAudio.startDemoSynthesizer();
          window.spotusSpotify.loadDemoTrack();
          card.classList.add('active');
          liveAudioBadge.classList.add('streaming');
          showToast('Demo 128 BPM Beat Synthesizer Active');
        } else {
          window.spotusAudio.stopCurrentSource();
          liveAudioBadge.classList.remove('streaming');
          showToast('Audio Input Disabled');
        }
      } catch (err) {
        showToast(err.message || 'Could not start audio stream');
        sourceCards[0].classList.add('active'); // revert to none
      }
    });
  });

  // 4. Lighting Mode Selection
  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const mode = pill.dataset.mode;
      modePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      window.spotusModes.setMode(mode);
      showToast(`Mode switched to ${pill.querySelector('.mode-pill-title').textContent}`);
    });
  });

  // 5. Sliders
  brightnessSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    brightnessVal.textContent = `${val}%`;
    window.spotusModes.setBrightness(val);
    window.lotusBLE.setBrightness(val);
  });

  sensitivitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    sensitivityVal.textContent = `${val.toFixed(1)}x`;
    window.spotusAudio.setSensitivity(val);
  });

  speedSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    speedVal.textContent = `${val}%`;
    window.lotusBLE.setSpeed(val);
  });

  // 6. Manual Color Swatches & Picker
  swatchButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const rgbStr = btn.dataset.rgb;
      const [r, g, b] = rgbStr.split(',').map(Number);
      window.spotusModes.setManualColor(r, g, b);
      window.lotusBLE.setRGBImmediate(r, g, b);
      modePills.forEach(p => p.classList.remove('active'));
      showToast(`Static RGB Color applied`);
    });
  });

  customColorInput.addEventListener('input', (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    window.spotusModes.setManualColor(r, g, b);
    window.lotusBLE.setRGBImmediate(r, g, b);
    modePills.forEach(p => p.classList.remove('active'));
  });

  // 7. Built-in Hardware Effects Chips
  fxChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const modeId = parseInt(chip.dataset.fx, 10);
      fxChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      window.lotusBLE.setHardwareMode(modeId);
      showToast(`Hardware Animation: ${chip.textContent}`);
    });
  });

  // 8. Spotify Integration
  if (spotifyClientIdInput) {
    spotifyClientIdInput.value = window.spotusSpotify.clientId;
    spotifyClientIdInput.addEventListener('change', (e) => {
      window.spotusSpotify.setClientId(e.target.value);
    });
  }

  btnSpotifyAuth.addEventListener('click', async () => {
    if (window.spotusSpotify.isAuthorized()) {
      window.spotusSpotify.logout();
      btnSpotifyAuth.textContent = 'Connect Spotify';
      showToast('Logged out of Spotify');
    } else {
      try {
        btnSpotifyAuth.disabled = true;
        await window.spotusSpotify.loginWithSpotify();
      } catch (err) {
        showToast(err.message || 'Could not start Spotify login');
      } finally {
        btnSpotifyAuth.disabled = false;
      }
    }
  });

  btnSpotifyDemo.addEventListener('click', () => {
    window.spotusSpotify.loadDemoTrack();
    showToast('Loaded Spotify Demo Track & Palette');
  });

  window.spotusSpotify.onAuthStatusChange = (isAuthed) => {
    btnSpotifyAuth.textContent = isAuthed ? 'Disconnect Spotify' : 'Connect Spotify';
  };

  window.spotusSpotify.onAuthError = (err) => {
    showToast(err.message || 'Spotify authorization failed');
  };

  window.spotusSpotify.onTrackChange = (track) => {
    if (!track) return;
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    if (track.albumArt) {
      trackArtwork.src = track.albumArt;
    }
  };

  window.spotusSpotify.onPaletteExtracted = (palette) => {
    window.spotusModes.setAlbumPalette(palette);
    dominantSwatchesContainer.innerHTML = '';
    palette.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'dominant-swatch';
      swatch.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
      swatch.title = `RGB(${color.r}, ${color.g}, ${color.b})`;
      swatch.addEventListener('click', () => {
        window.spotusModes.setManualColor(color.r, color.g, color.b);
        window.lotusBLE.setRGBImmediate(color.r, color.g, color.b);
      });
      dominantSwatchesContainer.appendChild(swatch);
    });
  };

  // Beat Event Callback
  window.spotusAudio.onBeat = ({ intensity }) => {
    visualizer.triggerBeat(intensity);
  };

  // 9. High-Performance 60 FPS Render & Sync Loop
  let frameCount = 0;
  function animationLoop() {
    requestAnimationFrame(animationLoop);

    // Process audio FFT
    const audioData = window.spotusAudio.processFrame();

    // Compute target lighting color for current frame
    const activeRGB = window.spotusModes.computeFrame(audioData);

    // Update canvas visualizer
    visualizer.draw(audioData, activeRGB);

    // Stream rate-limited RGB to BLE strip
    if (isPoweredOn && window.lotusBLE.isConnected) {
      window.lotusBLE.sendStreamRGB(activeRGB.r, activeRGB.g, activeRGB.b);
    }

    // Update UI telemetry every ~4 frames to keep CPU minimal
    frameCount++;
    if (frameCount % 4 === 0) {
      const bassPct = Math.round(audioData.bass * 100);
      const midPct = Math.round(audioData.mid * 100);
      const treblePct = Math.round(audioData.treble * 100);
      const volPct = Math.round(audioData.volume * 100);

      meterBass.style.height = `${bassPct}%`;
      valBass.textContent = `${bassPct}%`;

      meterMid.style.height = `${midPct}%`;
      valMid.textContent = `${midPct}%`;

      meterTreble.style.height = `${treblePct}%`;
      valTreble.textContent = `${treblePct}%`;

      meterVol.style.height = `${volPct}%`;
      valVol.textContent = `${volPct}%`;

      if (trackEnergyFill) {
        trackEnergyFill.style.width = `${Math.min(100, volPct * 1.3)}%`;
      }

      // Atmospheric background light halo
      if (ambientHalo) {
        ambientHalo.style.background = `radial-gradient(ellipse at center, rgba(${activeRGB.r}, ${activeRGB.g}, ${activeRGB.b}, 0.35) 0%, rgba(0, 242, 254, 0.1) 50%, transparent 75%)`;
      }
    }
  }

  // Start Animation Loop
  animationLoop();

  // Toast Helper
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toastText.textContent = msg;
    toastNotice.classList.add('show');
    toastTimer = setTimeout(() => {
      toastNotice.classList.remove('show');
    }, 3200);
  }
});
