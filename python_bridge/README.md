# Spotus Lantern &bull; Native Desktop Audio Bridge

A standalone Python service for syncing Lotus Lantern / ELK-BLEDOM LED strips with your PC sound card output (WASAPI Loopback) directly in the background.

## Prerequisites
- Python 3.10+
- Bluetooth Low Energy (BLE) radio enabled on your PC
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
