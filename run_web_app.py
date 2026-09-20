"""Launcher script for MinerU Web Studio.

Run with:
    python run_web_app.py
"""

import sys
import uvicorn

# Configure UTF-8 encoding for Windows terminals
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def main():
    host = "127.0.0.1"
    port = 8000
    print("=" * 60)
    print(f"Starting MinerU Web Studio on http://{host}:{port}")
    print("Drag & drop documents from your browser to parse locally.")
    print("=" * 60)
    uvicorn.run("web_app.app:app", host=host, port=port, reload=True)

if __name__ == "__main__":
    main()
