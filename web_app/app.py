"""MinerU Full-Stack Web Application Backend.

Provides document upload, parsing orchestration with MinerU, live result viewing,
export generation, and automated batch folder processing.
"""

from __future__ import annotations

import asyncio
import io
import os
import shutil
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import mineru
from batch_convert import create_zip_archive, find_documents, process_single_document
from mineru.parser.writer import FileBasedDataWriter

# Base directories
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
STORAGE_DIR = BASE_DIR / "storage"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="MinerU Web Studio",
    description="High-Precision Document to Markdown & LaTeX Studio with Batch Processing",
    version="1.1.0",
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

# In-memory Batch Tasks Store
batch_tasks: dict[str, dict[str, Any]] = {}


class BatchScanRequest(BaseModel):
    input_dir: str
    output_dir: str
    recursive: bool = False


class BatchStartRequest(BaseModel):
    input_dir: str
    output_dir: str
    tier: str = "standard"
    ocr_mode: str = "auto"
    page_range: str = ""
    recursive: bool = False
    skip_existing: bool = False
    create_zip: bool = True
    create_master_zip: bool = True


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


# ==========================================
# Single Document Parsing Endpoints
# ==========================================


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

    stem_name = "mineru_output"
    if filename and filename.strip():
        stem_name = Path(filename.strip()).stem
    else:
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


# ==========================================
# Batch Folder Automation Endpoints
# ==========================================


@app.post("/api/batch/scan")
async def scan_batch_directory(req: BatchScanRequest) -> dict[str, Any]:
    """Scan input folder for PDF and supported document files, validating directories."""
    input_str = req.input_dir.strip().strip('"').strip("'")
    output_str = req.output_dir.strip().strip('"').strip("'")

    if not input_str:
        raise HTTPException(status_code=400, detail="Input directory path cannot be empty.")

    input_path = Path(input_str).expanduser().resolve()
    if not input_path.exists() or not input_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Input folder does not exist or is not a directory: {input_path}")

    docs = find_documents(input_path, recursive=req.recursive)

    doc_items = []
    for d in docs:
        try:
            sz = d.stat().st_size
        except Exception:
            sz = 0
        try:
            rel_path_str = str(d.relative_to(input_path))
        except Exception:
            rel_path_str = d.name
        doc_items.append({
            "name": d.name,
            "rel_path": rel_path_str,
            "path": str(d),
            "size_bytes": sz,
            "extension": d.suffix.lower(),
        })

    return {
        "input_dir": str(input_path),
        "output_dir": output_str if output_str else str(input_path / "output_md"),
        "total_documents": len(doc_items),
        "documents": doc_items,
    }


async def _execute_batch_job(batch_id: str) -> None:
    """Async background worker for processing batch items."""
    task_info = batch_tasks.get(batch_id)
    if not task_info:
        return

    task_info["status"] = "running"
    task_info["start_time"] = time.time()
    output_path = Path(task_info["output_dir"]).resolve()
    output_path.mkdir(parents=True, exist_ok=True)

    docs: list[dict[str, Any]] = task_info["documents"]
    total = len(docs)

    def log(msg: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = f"[{timestamp}] {msg}"
        task_info["logs"].append(entry)
        if len(task_info["logs"]) > 200:
            task_info["logs"] = task_info["logs"][-200:]

    log(f"Starting batch conversion of {total} document(s)...")

    for idx, doc_entry in enumerate(docs):
        if task_info.get("cancelled", False):
            log("🛑 Batch conversion cancelled by user.")
            task_info["status"] = "cancelled"
            break

        doc_path = Path(doc_entry["path"])
        doc_entry["status"] = "processing"
        task_info["current_file"] = doc_entry["name"]
        task_info["current_index"] = idx + 1

        log(f"[{idx+1}/{total}] Processing: {doc_entry['name']}...")

        # Run conversion in a thread to keep FastAPI event loop responsive
        res = await asyncio.to_thread(
            process_single_document,
            doc_path,
            output_path,
            input_base_dir=input_path,
            tier=task_info["tier"],
            ocr_mode=task_info["ocr_mode"],
            page_range=task_info["page_range"],
            create_zip=task_info["create_zip"],
            skip_existing=task_info["skip_existing"],
        )

        doc_entry["status"] = res["status"]
        doc_entry["pages"] = res.get("pages", 0)
        doc_entry["elapsed_seconds"] = res.get("elapsed_seconds", 0)
        doc_entry["error"] = res.get("error", "")
        doc_entry["output_dir"] = res.get("output_dir", "")
        doc_entry["md_file"] = res.get("md_file", "")
        doc_entry["zip_file"] = res.get("zip_file", "")

        if res["status"] == "success":
            task_info["successful"] += 1
            log(f"✅ Success: {doc_entry['name']} ({res.get('pages', 0)} pages in {res.get('elapsed_seconds', 0)}s)")
        elif res["status"] == "skipped":
            task_info["skipped"] += 1
            log(f"⏭️ Skipped (already exists): {doc_entry['name']}")
        else:
            task_info["failed"] += 1
            log(f"❌ Failed: {doc_entry['name']} - {res.get('error', 'Unknown error')}")

        task_info["progress_percent"] = int(((idx + 1) / total) * 100)

    # Master ZIP packaging
    if task_info["status"] != "cancelled" and task_info["create_master_zip"]:
        if task_info["successful"] > 0 or task_info["skipped"] > 0:
            log("📦 Packaging Master ZIP containing all math + JSON + MD + media...")
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            master_zip_file = output_path / f"all_converted_documents_{timestamp_str}.zip"
            await asyncio.to_thread(create_zip_archive, output_path, master_zip_file)
            task_info["master_zip"] = str(master_zip_file)
            log(f"🎉 Master ZIP created: {master_zip_file.name}")

    if task_info["status"] != "cancelled":
        task_info["status"] = "completed"
        total_time = time.time() - task_info["start_time"]
        log(
            f"🏁 Batch conversion finished in {total_time:.1f}s. "
            f"Success: {task_info['successful']}, Skipped: {task_info['skipped']}, Failed: {task_info['failed']}"
        )


@app.post("/api/batch/start")
async def start_batch_conversion(req: BatchStartRequest) -> dict[str, Any]:
    """Start an automated background batch document conversion task."""
    input_str = req.input_dir.strip().strip('"').strip("'")
    output_str = req.output_dir.strip().strip('"').strip("'")

    if not input_str:
        raise HTTPException(status_code=400, detail="Input directory path required.")

    input_path = Path(input_str).expanduser().resolve()
    if not input_path.exists() or not input_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Input directory does not exist: {input_path}")

    if not output_str:
        output_path = input_path / "output_md"
    else:
        output_path = Path(output_str).expanduser().resolve()

    output_path.mkdir(parents=True, exist_ok=True)

    docs = find_documents(input_path, recursive=req.recursive)
    if not docs:
        raise HTTPException(status_code=400, detail="No supported documents found in the specified directory.")

    batch_id = str(uuid.uuid4())[:12]
    doc_entries = []
    for d in docs:
        doc_entries.append({
            "name": d.name,
            "path": str(d),
            "size_bytes": d.stat().st_size if d.exists() else 0,
            "status": "pending",
            "pages": 0,
            "elapsed_seconds": 0,
            "error": "",
            "output_dir": "",
            "md_file": "",
            "zip_file": "",
        })

    batch_tasks[batch_id] = {
        "batch_id": batch_id,
        "input_dir": str(input_path),
        "output_dir": str(output_path),
        "tier": req.tier,
        "ocr_mode": req.ocr_mode,
        "page_range": req.page_range,
        "create_zip": req.create_zip,
        "create_master_zip": req.create_master_zip,
        "skip_existing": req.skip_existing,
        "status": "pending",
        "progress_percent": 0,
        "current_file": "",
        "current_index": 0,
        "total": len(docs),
        "successful": 0,
        "failed": 0,
        "skipped": 0,
        "cancelled": False,
        "start_time": time.time(),
        "logs": [],
        "documents": doc_entries,
        "master_zip": None,
    }

    # Launch background task
    asyncio.create_task(_execute_batch_job(batch_id))

    return {
        "batch_id": batch_id,
        "status": "started",
        "total": len(docs),
        "input_dir": str(input_path),
        "output_dir": str(output_path),
    }


@app.get("/api/batch/status/{batch_id}")
async def get_batch_status(batch_id: str) -> dict[str, Any]:
    """Retrieve live status, progress, and document records for a batch job."""
    task_info = batch_tasks.get(batch_id)
    if not task_info:
        raise HTTPException(status_code=404, detail="Batch task not found.")
    return task_info


@app.post("/api/batch/cancel/{batch_id}")
async def cancel_batch_task(batch_id: str) -> dict[str, Any]:
    """Cancel an ongoing batch conversion job."""
    task_info = batch_tasks.get(batch_id)
    if not task_info:
        raise HTTPException(status_code=404, detail="Batch task not found.")

    task_info["cancelled"] = True
    task_info["status"] = "cancelling"
    return {"batch_id": batch_id, "status": "cancelling"}


@app.get("/api/batch/download/{batch_id}/zip")
async def download_master_batch_zip(batch_id: str) -> FileResponse:
    """Download the master ZIP containing all converted documents, math, json, md, and media."""
    task_info = batch_tasks.get(batch_id)
    if not task_info:
        raise HTTPException(status_code=404, detail="Batch task not found.")

    master_zip = task_info.get("master_zip")
    if not master_zip or not Path(master_zip).exists():
        # Dynamically create if not already saved
        output_path = Path(task_info["output_dir"])
        if not output_path.exists():
            raise HTTPException(status_code=404, detail="Output directory not found.")
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_zip = output_path / f"all_converted_documents_{timestamp_str}.zip"
        create_zip_archive(output_path, temp_zip)
        master_zip = str(temp_zip)
        task_info["master_zip"] = master_zip

    zip_file_path = Path(master_zip)
    return FileResponse(
        str(zip_file_path),
        media_type="application/zip",
        filename=zip_file_path.name,
    )
