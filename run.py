"""
Application Runner - AnimeStream Aggregator
Launch with: python run.py
"""
import sys
import os
import socket
import threading
import time
import webbrowser
import uvicorn

# Ensure utf-8 encoding for standard output on Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def get_lan_ip() -> str:
    """Detect local LAN IP for local network access (Wi-Fi/Ethernet)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def find_available_port(start_port=8000, max_attempts=20) -> int:
    """Find next open port if 8000 is occupied."""
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port

def launch_browser(url: str):
    """Automatically open default web browser once server is ready."""
    time.sleep(1.2)
    try:
        webbrowser.open(url)
    except Exception:
        pass

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()

    lan_ip = get_lan_ip()
    port = find_available_port(start_port=8000)

    local_url = f"http://localhost:{port}"
    lan_url = f"http://{lan_ip}:{port}" if lan_ip != "127.0.0.1" else None

    print("=" * 65)
    print("🎬  AnimeStream Aggregator - Servidor Local Iniciado")
    print("=" * 65)
    print(f" ▶  En este ordenador:        {local_url}")
    if lan_url:
        print(f" ▶  En Smart TV / Móvil:       {lan_url}")
    print(f" ▶  Documentación API:        {local_url}/docs")
    print("-" * 65)
    print(" Presiona Ctrl + C en esta consola para detener el servidor.")
    print("=" * 65)

    # Auto-open browser
    threading.Thread(target=launch_browser, args=(local_url,), daemon=True).start()

    is_frozen = getattr(sys, "frozen", False)
    if is_frozen:
        # In packaged .exe: run app directly without reload watcher
        from backend.app.main import app
        uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
    else:
        # In development mode: enable hot-reloading
        uvicorn.run("backend.app.main:app", host="0.0.0.0", port=port, reload=True)
