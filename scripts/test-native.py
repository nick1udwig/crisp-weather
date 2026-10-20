import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = {
    "forecast": ["forecast"],
    "weather": ["weather"],
    "request": ["weather_request"],
    "config": ["config"],
    "dial": [],
}
with tempfile.TemporaryDirectory(prefix="crisp-native-") as output:
    for name, sources in CASES.items():
        binary = str(Path(output) / name)
        subprocess.run([os.environ.get("CC", "cc"), "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
                        "-Itests/native", "-o", binary, f"tests/native/{name}_test.c",
                        *(f"src/c/{source}.c" for source in sources)], cwd=ROOT, check=True)
        subprocess.run([binary], check=True)
        print(f"Native {name}: passed", flush=True)
