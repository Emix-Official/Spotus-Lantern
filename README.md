# Spotus Lantern

Next-generation audio synchronization software designed to bridge **Spotify** (Desktop, Web, or System Sound) with **Lotus Lantern / ELK-BLEDOM** Bluetooth Low Energy (BLE) LED light strips.

The official Lotus Lantern mobile application only reacts to locally stored music files because mobile OS sandboxes restrict third-party access to DRM-protected streaming audio streams. **Spotus Lantern** bypasses this constraint by analyzing real-time PCM audio waveforms and dispatching reverse-engineered 9-byte GATT packets directly to the controller hardware.

---

## Architecture Overview

```text
┌─────────────────────────┐
│ Spotify Desktop / Web   │
│ Or System Soundcard     │
└────────────┬────────────┘
             │ (Loopback Audio Stream)
             ▼
┌────────────────────────────────────────────────────────┐
│ Spotus Lantern Studio Engine                           │
│ ────────────────────────────────────────────────────── │
│ • 1024-Point Real-Time FFT Multi-Band Filter           │
│ • Adaptive Dynamic Bass Beat Detection (Moving Avg)    │
│ • Hardware Color Channel Remapper (GBR Default)        │
│ • MTU-Aware Transmission Limiter (15-20 FPS Queue)     │
└────────────┬───────────────────────────────────────────┘
             │ (9-Byte Hex Command Frames)
             ▼
┌─────────────────────────┐
│ Lotus Lantern Hardware  │
│ (ELK-BLEDOM / MELK)     │
└─────────────────────────┘
```

---

## Hardware Pin Ordering: GBR Configuration

Standard LED controllers assume physical pin order `[R, G, B]`. Many commercial strips wire their internal traces differently. On your specific hardware strip:
- Sending Red triggered Green.
- Sending Green triggered Blue.
- Sending Blue triggered Red.

Spotus Lantern includes a hardware pin remapper set to **`GBR`** mode by default:
- **Intended Red** $\rightarrow$ Dispatched on Channel 3
- **Intended Green** $\rightarrow$ Dispatched on Channel 1
- **Intended Blue** $\rightarrow$ Dispatched on Channel 2

You can calibrate and test this live in the studio dashboard via the **Test Red**, **Test Green**, and **Test Blue** buttons.

---

## Key Features

- **Cyber-Studio Dark HUD**: Designed with the **Outfit** typography, obsidian glassmorphism, responsive controls, and zero emojis.
- **Dual Visualizer Engine**: 48-band mirrored equalizer, peak hold capacitors, and an oscilloscope waveform overlay running at 60 FPS.
- **Multiple Audio Ingestion Routes**:
  - **Spotify / System Audio**: Direct digital capture via browser screen/tab sharing with audio enabled.
  - **Microphone / Line-In**: Ambient acoustic capture for speakers or room audio.
  - **128 BPM Beat Synthesizer**: Built-in electronic oscillator demo for testing and calibration without audio playback.
  - **Spotify Web API**: Album artwork dominant color extractor and track metadata integration.
- **5 Dynamic Lighting Modes**:
  1. **Bass Drop Pulse**: High-energy kicks with analog filament decay.
  2. **Spectrum Flow**: Multi-band frequency separation (bass = crimson/magenta, mids = emerald, treble = electric cyan).
  3. **Album Art Sync**: Dynamic color blending between the top 3 dominant colors of the currently playing album cover.
  4. **Neon Strobe**: Rave transient strobe on sharp beat spikes.
  5. **Ambient Flow**: Hypnotic sinusoidal breathing synced to music rhythm.
  6. **Hardware FX**: Direct triggering of the 200+ built-in Lotus Lantern hardware chip animations.

---

## Getting Started

### Method 1: Web Studio (Recommended)

1. Open `index.html` in a Web Bluetooth-enabled browser (**Google Chrome** or **Microsoft Edge**).
2. For optimal permissions, serve the folder over a local server:
   ```bash
   npx serve .
   # Or using Python:
   python -m http.server 3000
   ```
3. Navigate to `http://localhost:3000` in Chrome/Edge.
4. Click **Connect Lights**, select your `ELK-BLEDOM` or `Lotus` device from the Bluetooth dialog, and enjoy synchronized Spotify illumination.

> **Important**: Bluetooth Low Energy controllers only pair with one host at a time. Make sure the Lotus Lantern mobile app is fully closed or Bluetooth is toggled off on your phone.

---

### Method 2: Native Desktop Python Bridge

For running directly in the background capturing Windows PC soundcard output (WASAPI loopback):

```bash
cd python_bridge
pip install -r requirements.txt
python bridge.py --color-order GBR
```

---

## Bluetooth GATT Specifications

- **Service UUID**: `0000fff0-0000-1000-8000-00805f9b34fb`
- **Write Characteristic UUID**: `0000fff3-0000-1000-8000-00805f9b34fb` (Write Without Response)
- **RGB Command Packet**: `[0x7E, 0x07, 0x05, 0x03, Ch1, Ch2, Ch3, 0x10, 0xEF]`
- **Brightness Packet**: `[0x7E, 0x07, 0x01, Val, 0xFF, 0xFF, 0xFF, 0x00, 0xEF]`
- **Power On Packet**: `[0x7E, 0x04, 0x04, 0x01, 0xFF, 0xFF, 0xFF, 0x00, 0xEF]`
- **Power Off Packet**: `[0x7E, 0x04, 0x04, 0x00, 0xFF, 0xFF, 0xFF, 0x00, 0xEF]`
