"""MinerU Full-Stack Web Application Backend.

Provides document upload, parsing orchestration with MinerU, live result viewing,
and export generation.
"""

from __future__ import annotations

import io
import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import mineru
from mineru.parser.writer import FileBasedDataWriter

# Base directories
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
STORAGE_DIR = BASE_DIR / "storage"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="MinerU Web Studio",
    description="High-Precision Document to Markdown & LaTeX Studio",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Assets
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    """Serve the main Web UI page."""
    html_file = TEMPLATES_DIR / "index.html"
    if not html_file.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    return HTMLResponse(content=html_file.read_text(encoding="utf-8"))


@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    """Check backend health and hardware acceleration info."""
    device = "cpu"
    gpu_name = ""
    try:
        import torch

        if torch.cuda.is_available():
            device = "cuda"
            gpu_name = torch.cuda.get_device_name(0)
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
    except ImportError:
        pass

    return {
        "status": "online",
        "device": device,
        "gpu_name": gpu_name,
        "mineru_version": getattr(mineru, "__version__", "4.0.0"),
    }


@app.post("/api/parse")
async def parse_document(
    file: UploadFile = File(...),
    tier: str = Form("standard"),
    page_range: str = Form(""),
) -> dict[str, Any]:
    """Upload and parse a document using MinerU locally on the backend."""
    task_id = str(uuid.uuid4())[:12]
    task_dir = STORAGE_DIR / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    filename = file.filename or "uploaded_document"
    input_file_path = task_dir / filename

    # Save uploaded file
    try:
        with open(input_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {exc}")

    output_dir = task_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Normalize tier parameter
        selected_tier = tier.lower().strip()
        if selected_tier not in ("flash", "basic", "standard", "advanced"):
            selected_tier = "standard"

        import asyncio

        # Execute MinerU parsing locally in a background worker thread
        parse_result = await asyncio.to_thread(
            mineru.parse,
            input_file_path,
            tier=selected_tier,
            page_range=page_range.strip() if page_range else "",
        )

        # Save artifacts to output directory
        writer = FileBasedDataWriter(str(output_dir))
        parse_result.save(writer)

        markdown_text = parse_result.markdown()
        middle_json_data = parse_result.to_dict()

        # Discover extracted images / figures
        images_list = []
        for root, _, files in os.walk(output_dir):
            for f in files:
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")) and not f.startswith("."):
                    rel_path = Path(root).relative_to(output_dir) / f
                    url_path = f"/api/assets/{task_id}/{rel_path.as_posix()}"
                    images_list.append({"name": f, "url": url_path})

        return {
            "task_id": task_id,
            "filename": filename,
            "tier": selected_tier,
            "markdown": markdown_text,
            "middle_json": middle_json_data,
            "images": images_list,
        }

    except Exception as exc:
        # Clean up failed task folder
        shutil.rmtree(task_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Parsing error: {exc}")


@app.get("/api/assets/{task_id}/{file_path:path}")
async def get_extracted_asset(task_id: str, file_path: str) -> FileResponse:
    """Serve extracted images and media assets for a given parse task."""
    asset_file = STORAGE_DIR / task_id / "output" / file_path
    if not asset_file.exists() or not asset_file.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(str(asset_file))


@app.get("/api/download/{task_id}/zip")
async def download_bundle_zip(task_id: str, filename: str | None = None) -> StreamingResponse:
    """Package task outputs (markdown, middle_json, images) into a downloadable ZIP named after the input file."""
    task_dir = STORAGE_DIR / task_id
    output_dir = task_dir / "output"
    if not output_dir.exists() or not output_dir.is_dir():
        raise HTTPException(status_code=404, detail="Task output not found")

    # Determine original filename stem
    stem_name = "mineru_output"
    if filename and filename.strip():
        stem_name = Path(filename.strip()).stem
    else:
        # Search for original uploaded file in task_dir
        input_files = [f for f in task_dir.iterdir() if f.is_file()]
        if input_files:
            stem_name = input_files[0].stem

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for root, _, files in os.walk(output_dir):
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(output_dir)
                zip_file.write(full_path, arcname=str(rel_path))

    zip_buffer.seek(0)
    from urllib.parse import quote
    zip_filename = f"{stem_name}.zip"
    encoded_filename = quote(zip_filename)

    # ASCII-safe fallback for HTTP header (RFC 6266 / RFC 5987)
    ascii_fallback = zip_filename.encode("ascii", "ignore").decode("ascii").replace('"', "").strip()
    if not ascii_fallback or ascii_fallback == ".zip":
        ascii_fallback = "parsed_document.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded_filename}'
        },
    )
