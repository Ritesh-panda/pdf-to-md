"""Launcher script for MinerU Web Studio.

Run with:
    python run_web_app.py
"""

import sys
import threading
import time
import webbrowser
import uvicorn

# Configure UTF-8 encoding for Windows terminals
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def _open_browser_delayed(url: str):
    time.sleep(1.2)
    webbrowser.open(url)

def main():
    host = "127.0.0.1"
    port = 8000
    url = f"http://{host}:{port}"
    print("=" * 60)
    print(f"Starting MinerU Web Studio on {url}")
    print("Drag & drop documents from your browser to parse locally.")
    print("=" * 60)
    threading.Thread(target=_open_browser_delayed, args=(url,), daemon=True).start()
    uvicorn.run("web_app.app:app", host=host, port=port, reload=True)

if __name__ == "__main__":
    main()
