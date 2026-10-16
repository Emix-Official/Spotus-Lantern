# Spotus Lantern &bull; Native Desktop Audio Bridge

A standalone Python service for syncing Lotus Lantern / ELK-BLEDOM LED strips with your PC sound card output (WASAPI Loopback) directly in the background.

## Prerequisites
- Python 3.10+
- Bluetooth Low Energy (BLE) radio enabled on your PC
- Windows audio output enabled (the bridge uses WASAPI loopback)
- Make sure the **Lotus Lantern mobile app is closed / disconnected** (these BLE controllers only accept 1 connection at a time)

## Installation

```bash
# In the python_bridge directory or project root:
pip install -r python_bridge/requirements.txt
```

## Running the Bridge

Run with default GBR pin mapping (calibrated for your LED strip):

```bash
python python_bridge/bridge.py
```

The bridge does not require Spotify OAuth. Play Spotify Desktop, Spotify Web, or any other audio through the Windows output selected by WASAPI and the bridge will analyze that output.

### Available Options

| Flag | Default | Description |
|---|---|---|
| `--color-order` | `GBR` | Pin ordering (`GBR`, `RGB`, `GRB`, `BRG`, `BGR`, `RBG`) |
| `--sensitivity` | `1.0` | Beat detection sensitivity multiplier (`0.5` to `2.0`) |
| `--brightness` | `1.0` | Master brightness (`0.1` to `1.0`) |
| `--address` | Auto-detect | Manually specify BLE MAC Address of the light strip |
| `--device-index` | Auto-detect | Manually choose WASAPI sound device index |

### Example with Custom Sensitivity:
```bash
python python_bridge/bridge.py --color-order GBR --sensitivity 1.4
```

### Troubleshooting

- **`Thread is configured for Windows GUI but callbacks are not working`**: use a current Bleak installation from `requirements.txt` and launch the script from PowerShell or Command Prompt, not from a GUI-embedded Python console. The bridge runs Windows BLE discovery on a fresh MTA-compatible thread.
- **No BLE devices found**: power on the strip, close the Lotus Lantern phone app, enable Windows Bluetooth, and run the bridge close to the controller. Use `--address` after discovering the device if its advertised name does not contain `ELK`, `Lotus`, `MELK`, `LED`, or `Triones`.
- **No WASAPI loopback device**: list devices with `python -c "import sounddevice as sd; print(sd.query_devices())"` and pass the output device's index with `--device-index`.
