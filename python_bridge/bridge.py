#!/usr/bin/env python3
"""
Spotus Lantern - Native Desktop Audio Loopback Bridge
Captures Windows PC sound output (WASAPI Loopback) in real time,
runs multi-band FFT beat detection, and streams rate-limited RGB packets
over Bluetooth Low Energy (bleak) to Lotus Lantern / ELK-BLEDOM LED strips.
Pre-configured for GBR pin ordering.
"""

import sys
import time
import argparse
import asyncio
import numpy as np

try:
    import sounddevice as sd
except ImportError:
    print("[ERROR] 'sounddevice' library is missing. Install with: pip install -r requirements.txt")
    sd = None

try:
    from bleak import BleakClient, BleakScanner
except ImportError:
    print("[ERROR] 'bleak' library is missing. Install with: pip install -r requirements.txt")
    BleakClient, BleakScanner = None, None


# Known Lotus Lantern / ELK-BLEDOM GATT UUIDs
SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"
WRITE_CHAR_UUID = "0000fff3-0000-1000-8000-00805f9b34fb"

# Global audio buffer
AUDIO_BUFFER_SIZE = 1024
SAMPLE_RATE = 44100
audio_queue = asyncio.Queue(maxsize=10)


def map_color_channels(r, g, b, order="GBR"):
    """
    Remaps RGB to physical controller channels.
    For GBR (user's strip):
      Channel 1 = Green
      Channel 2 = Blue
      Channel 3 = Red
    """
    r = int(np.clip(r, 0, 255))
    g = int(np.clip(g, 0, 255))
    b = int(np.clip(b, 0, 255))

    order = order.upper()
    if order == "GBR":
        return g, b, r
    elif order == "GRB":
        return g, r, b
    elif order == "BRG":
        return b, r, g
    elif order == "BGR":
        return b, g, r
    elif order == "RBG":
        return r, b, g
    else:  # RGB
        return r, g, b


def build_color_packet(r, g, b, order="GBR"):
    """
    Standard Lotus 9-byte Color packet:
    7E 07 05 03 [Ch1] [Ch2] [Ch3] 10 EF
    """
    ch1, ch2, ch3 = map_color_channels(r, g, b, order)
    return bytes([0x7E, 0x07, 0x05, 0x03, ch1, ch2, ch3, 0x10, 0xEF])


def audio_callback(indata, frames, time_info, status):
    """Callback for sounddevice stream"""
    if status:
        pass
    # indata shape is (frames, channels)
    mono = np.mean(indata, axis=1)
    try:
        audio_queue.put_nowait(mono)
    except asyncio.QueueFull:
        pass


def get_default_wasapi_loopback():
    """Finds default Windows WASAPI Loopback output device"""
    if not sd:
        return None
    try:
        wasapi = sd.query_hostapis()
        wasapi_index = None
        for i, api in enumerate(wasapi):
            if "wasapi" in api["name"].lower():
                wasapi_index = i
                break

        devices = sd.query_devices()
        default_out = sd.default.device[1]  # Default output device
        if default_out < 0 or default_out >= len(devices):
            return None

        # Look for matching loopback device in WASAPI
        for i, dev in enumerate(devices):
            if (
                dev["hostapi"] == wasapi_index
                and dev["max_input_channels"] > 0
                and dev["name"] == devices[default_out]["name"]
            ):
                return i
    except Exception as e:
        print(f"[WARN] Could not automatically locate WASAPI loopback: {e}")
    return None


async def scan_for_lotus_devices():
    """Scan nearby BLE devices matching Lotus / ELK prefixes"""
    print("[*] Scanning for Lotus Lantern / ELK-BLEDOM devices (5 seconds)...")
    devices = await BleakScanner.discover(timeout=5.0)
    found = []
    for d in devices:
        name = d.name or "Unknown"
        if any(prefix in name.lower() for prefix in ["elk", "lotus", "melk", "led", "triones"]):
            found.append(d)
            print(f"    -> Found: {name} [{d.address}] (RSSI: {d.rssi} dBm)")
    return found


async def stream_audio_to_lights(client, args):
    """Main audio processing and BLE streaming loop"""
    # Moving average energy history
    energy_history = []
    history_len = 35
    last_beat_time = 0
    cooldown_sec = 0.14
    hue_shift = 0.0
    pulse_level = 0.0

    print("[*] Audio loop active. Playing Spotify or system sound will react on your LEDs.")
    print(f"[*] Wire configuration: {args.color_order}")

    while True:
        try:
            mono_chunk = await audio_queue.get()
            # Fast Fourier Transform (FFT)
            fft_vals = np.abs(np.fft.rfft(mono_chunk * np.hanning(len(mono_chunk))))
            
            # Sub-bass & Bass region (bins 1 to 6, ~40Hz - 250Hz)
            bass_energy = float(np.mean(fft_vals[1:7])) if len(fft_vals) > 7 else 0.0
            
            # Update moving average
            energy_history.append(bass_energy)
            if len(energy_history) > history_len:
                energy_history.pop(0)

            avg_energy = float(np.mean(energy_history)) if energy_history else 0.01
            threshold = avg_energy * (1.6 - (args.sensitivity * 0.25))

            now = time.time()
            is_beat = False

            if bass_energy > threshold and (now - last_beat_time) > cooldown_sec:
                is_beat = True
                last_beat_time = now
                pulse_level = 1.0
                hue_shift = (hue_shift + 45.0) % 360.0
            else:
                pulse_level *= 0.85  # Exponential decay

            # Calculate color from HSV
            level = max(0.1, min(1.0, (bass_energy * 0.5) + (pulse_level * 0.5)))
            r, g, b = hsv_to_rgb(hue_shift / 360.0, 0.9, level * args.brightness)

            packet = build_color_packet(r, g, b, order=args.color_order)
            await client.write_gatt_char(WRITE_CHAR_UUID, packet, response=False)

            # Limit rate to ~20 FPS (every 50ms)
            await asyncio.sleep(0.048)

        except asyncio.CancelledError:
            break
        except Exception as e:
            # BLE packet write hiccup, continue
            await asyncio.sleep(0.05)


def hsv_to_rgb(h, s, v):
    """Helper to convert HSV to 0-255 RGB"""
    import colorsys
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


async def main():
    parser = argparse.ArgumentParser(description="Spotus Lantern Native PC Bridge")
    parser.add_argument("--address", type=str, help="BLE MAC Address of LED strip")
    parser.add_argument("--color-order", type=str, default="GBR", help="Wire order (default: GBR)")
    parser.add_argument("--brightness", type=float, default=1.0, help="Master brightness 0.1 to 1.0")
    parser.add_argument("--sensitivity", type=float, default=1.0, help="Beat sensitivity 0.5 to 2.0")
    parser.add_argument("--device-index", type=int, default=None, help="Audio input device index")
    args = parser.parse_args()

    # Step 1: Discover or pick BLE device
    target_address = args.address
    if not target_address:
        devices = await scan_for_lotus_devices()
        if not devices:
            print("[!] No Lotus Lantern devices detected nearby. Ensure LEDs are powered on and phone app is closed.")
            return
        target_address = devices[0].address
        print(f"[*] Auto-selected target: {devices[0].name} ({target_address})")

    # Step 2: Configure Audio Stream
    dev_index = args.device_index or get_default_wasapi_loopback()
    print(f"[*] Starting soundcard audio capture on device index: {dev_index}")

    stream = sd.InputStream(
        device=dev_index,
        channels=2,
        samplerate=SAMPLE_RATE,
        blocksize=AUDIO_BUFFER_SIZE,
        callback=audio_callback,
    )

    # Step 3: Connect to BLE and run
    print(f"[*] Connecting to Bluetooth device {target_address}...")
    async with BleakClient(target_address) as client:
        print("[+] Connected to Lotus Lantern LED strip!")
        # Turn ON
        await client.write_gatt_char(
            WRITE_CHAR_UUID,
            bytes([0x7E, 0x04, 0x04, 0x01, 0xFF, 0xFF, 0xFF, 0x00, 0xEF]),
            response=False,
        )

        with stream:
            await stream_audio_to_lights(client, args)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Exiting Spotus Lantern Bridge.")
