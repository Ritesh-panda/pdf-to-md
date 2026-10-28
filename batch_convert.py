#!/usr/bin/env python3
"""MinerU Batch Document to Markdown & LaTeX Converter.

Automates conversion of all PDF/document files in an input directory to
structured Markdown, LaTeX math, Middle JSON schemas, and extracted media images,
with automatic ZIP archive generation.

Usage:
    python batch_convert.py -i "C:/path/to/pdfs" -o "C:/path/to/output" --zip
    python batch_convert.py --input-dir "./demo/pdfs" --output-dir "./output" --tier standard --zip
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

# Configure UTF-8 encoding for Windows terminals
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".xlsx",
    ".xls",
    ".epub",
    ".html",
    ".htm",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}


def find_documents(input_dir: Path, recursive: bool = False) -> list[Path]:
    """Find all supported documents in the input directory."""
    if not input_dir.exists() or not input_dir.is_dir():
        return []

    pattern = "**/*" if recursive else "*"
    doc_paths: list[Path] = []

    for path in sorted(input_dir.glob(pattern)):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS and not path.name.startswith("."):
            doc_paths.append(path)

    return doc_paths


def create_zip_archive(source_dir: Path, target_zip_path: Path) -> Path:
    """Create a ZIP archive from the contents of source_dir."""
    target_zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(source_dir):
            for file in files:
                file_path = Path(root) / file
                # Don't zip the zip itself if it's placed inside source_dir
                if file_path.resolve() == target_zip_path.resolve():
                    continue
                rel_path = file_path.relative_to(source_dir)
                zipf.write(file_path, arcname=str(rel_path))
    return target_zip_path


def process_single_document(
    doc_path: Path,
    output_base_dir: Path,
    *,
    input_base_dir: Path | None = None,
    tier: str = "standard",
    ocr_mode: str = "auto",
    page_range: str = "",
    create_zip: bool = True,
    skip_existing: bool = False,
    progress_callback: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Process a single document with MinerU and save all artifacts."""
    doc_stem = doc_path.stem
    if input_base_dir:
        try:
            rel_parent = doc_path.resolve().relative_to(input_base_dir.resolve()).parent
            doc_output_dir = output_base_dir / rel_parent / doc_stem
        except ValueError:
            doc_output_dir = output_base_dir / doc_stem
    else:
        doc_output_dir = output_base_dir / doc_stem

    expected_md = doc_output_dir / f"{doc_stem}.md"

    if skip_existing and expected_md.exists() and expected_md.stat().st_size > 0:
        if progress_callback:
            progress_callback(f"⏭️ Skipping already processed: {doc_path.name}")
        return {
            "status": "skipped",
            "file": str(doc_path),
            "name": doc_path.name,
            "output_dir": str(doc_output_dir),
            "md_file": str(expected_md),
        }

    doc_output_dir.mkdir(parents=True, exist_ok=True)

    start_time = time.time()
    try:
        import mineru
        from mineru.parser.writer import FileBasedDataWriter

        if progress_callback:
            progress_callback(f"⚙️ Parsing: {doc_path.name} (Tier: {tier})...")

        parse_result = mineru.parse(
            doc_path,
            tier=tier,
            ocr_mode=ocr_mode,
            page_range=page_range if page_range else "",
        )

        # 1. Save standard MinerU artifacts (markdown.md, middle_json.json, structured_content.json, images/)
        writer = FileBasedDataWriter(str(doc_output_dir))
        parse_result.save(writer)

        # 2. Also ensure a named <doc_stem>.md is present for easy direct discovery
        named_md = doc_output_dir / f"{doc_stem}.md"
        standard_md = doc_output_dir / "markdown.md"
        if standard_md.exists() and not named_md.exists():
            import shutil
            shutil.copy2(standard_md, named_md)

        # Also copy the root markdown directly into doc_output_dir if needed
        markdown_text = parse_result.markdown()
        if not named_md.exists():
            named_md.write_text(markdown_text, encoding="utf-8")

        # 3. Create document ZIP containing all math + JSON + MD + media
        zip_path = None
        if create_zip:
            zip_file = doc_output_dir / f"{doc_stem}.zip"
            create_zip_archive(doc_output_dir, zip_file)
            zip_path = str(zip_file)

        elapsed = time.time() - start_time
        num_pages = len(getattr(parse_result, "pages", []))

        if progress_callback:
            progress_callback(
                f"✅ Done: {doc_path.name} ({num_pages} pages in {elapsed:.1f}s) -> {doc_output_dir}"
            )

        return {
            "status": "success",
            "file": str(doc_path),
            "name": doc_path.name,
            "pages": num_pages,
            "elapsed_seconds": round(elapsed, 2),
            "output_dir": str(doc_output_dir),
            "md_file": str(named_md),
            "zip_file": zip_path,
        }

    except Exception as exc:
        elapsed = time.time() - start_time
        if progress_callback:
            progress_callback(f"❌ Error processing {doc_path.name}: {exc}")
        return {
            "status": "error",
            "file": str(doc_path),
            "name": doc_path.name,
            "error": str(exc),
            "elapsed_seconds": round(elapsed, 2),
        }


def run_batch_conversion(
    input_dir: str | Path,
    output_dir: str | Path,
    *,
    tier: str = "standard",
    ocr_mode: str = "auto",
    page_range: str = "",
    create_zip: bool = True,
    create_master_zip: bool = True,
    recursive: bool = False,
    skip_existing: bool = False,
    progress_callback: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Execute batch document conversion and bundling for a directory."""
    input_path = Path(input_dir).resolve()
    output_path = Path(output_dir).resolve()
    output_path.mkdir(parents=True, exist_ok=True)

    if progress_callback:
        progress_callback(f"🔍 Scanning input directory: {input_path}")

    docs = find_documents(input_path, recursive=recursive)
    total_docs = len(docs)

    if total_docs == 0:
        if progress_callback:
            progress_callback(f"⚠️ No supported documents found in {input_path}")
        return {
            "total": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "results": [],
            "master_zip": None,
        }

    if progress_callback:
        progress_callback(f"📋 Found {total_docs} document(s) to process. Saving to: {output_path}")

    results = []
    successful_count = 0
    failed_count = 0
    skipped_count = 0

    batch_start_time = time.time()

    for idx, doc in enumerate(docs, start=1):
        if progress_callback:
            progress_callback(f"\n[{idx}/{total_docs}] ----------------------------------------")

        res = process_single_document(
            doc,
            output_path,
            input_base_dir=input_path,
            tier=tier,
            ocr_mode=ocr_mode,
            page_range=page_range,
            create_zip=create_zip,
            skip_existing=skip_existing,
            progress_callback=progress_callback,
        )
        results.append(res)

        if res["status"] == "success":
            successful_count += 1
        elif res["status"] == "skipped":
            skipped_count += 1
        else:
            failed_count += 1

    # Create Master ZIP of all converted files
    master_zip_path = None
    if create_master_zip and (successful_count > 0 or skipped_count > 0):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        master_zip_file = output_path / f"all_converted_documents_{timestamp}.zip"
        if progress_callback:
            progress_callback(f"\n📦 Creating Master ZIP containing all math + JSON + MD + media...")
        create_zip_archive(output_path, master_zip_file)
        master_zip_path = str(master_zip_file)
        if progress_callback:
            progress_callback(f"🎉 Master ZIP saved: {master_zip_file}")

    total_time = time.time() - batch_start_time

    summary = {
        "total": total_docs,
        "successful": successful_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "total_elapsed_seconds": round(total_time, 2),
        "output_directory": str(output_path),
        "master_zip": master_zip_path,
        "results": results,
    }

    if progress_callback:
        progress_callback("\n" + "=" * 60)
        progress_callback(f"📊 BATCH CONVERSION SUMMARY:")
        progress_callback(f"  • Total Documents:   {total_docs}")
        progress_callback(f"  • Successfully Done: {successful_count}")
        progress_callback(f"  • Skipped:           {skipped_count}")
        progress_callback(f"  • Failed:            {failed_count}")
        progress_callback(f"  • Total Time:        {total_time:.2f}s")
        progress_callback(f"  • Output Directory:  {output_path}")
        if master_zip_path:
            progress_callback(f"  • Master ZIP:        {master_zip_path}")
        progress_callback("=" * 60)

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="MinerU Batch Document Converter — Convert a folder of PDFs to Markdown, Math, JSON, and Media with ZIP bundling."
    )
    parser.add_argument(
        "-i",
        "--input-dir",
        type=str,
        required=True,
        help="Path to directory containing input PDF/document files.",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=str,
        required=True,
        help="Path to directory where converted Markdown, JSON, Media, and ZIPs will be stored.",
    )
    parser.add_argument(
        "-t",
        "--tier",
        type=str,
        default="standard",
        choices=["flash", "basic", "standard", "advanced"],
        help="MinerU extraction tier: 'standard' (full AI OCR + layout + math) or 'flash' (ultra-fast native).",
    )
    parser.add_argument(
        "--ocr-mode",
        type=str,
        default="auto",
        choices=["auto", "txt", "ocr"],
        help="OCR mode for PDF parsing.",
    )
    parser.add_argument(
        "--page-range",
        type=str,
        default="",
        help="Page range to extract (e.g., '1-5', 'all', 'r1'). Default is all pages.",
    )
    parser.add_argument(
        "-z",
        "--zip",
        action="store_true",
        default=True,
        help="Enable automatic ZIP archive creation (enabled by default).",
    )
    parser.add_argument(
        "--no-zip",
        action="store_true",
        help="Disable automatic ZIP archive creation.",
    )
    parser.add_argument(
        "-r",
        "--recursive",
        action="store_true",
        help="Search subdirectories recursively for documents.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip documents that have already been converted in the output folder.",
    )

    if len(sys.argv) == 1:
        print("=" * 60)
        print(" MinerU Batch Document Converter (Interactive Mode)")
        print("=" * 60)
        print("Tip: To use the visual browser interface instead, run: run_app.bat\n")
        try:
            inp = input("📁 Enter input folder path (containing PDFs) [or Enter/q to exit]: ").strip().strip('"').strip("'")
            if not inp or inp.lower() in ("q", "quit", "exit"):
                print("Exiting.")
                return
            out = input("📁 Enter output folder path [Default: ./output]: ").strip().strip('"').strip("'")
            if not out:
                out = "./output"
            sys.argv.extend(["-i", inp, "-o", out])
        except (KeyboardInterrupt, EOFError):
            print("\nCancelled.")
            return

    args = parser.parse_args()

    # Zip is enabled unless --no-zip is specified
    create_zip = not args.no_zip

    run_batch_conversion(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        tier=args.tier,
        ocr_mode=args.ocr_mode,
        page_range=args.page_range,
        create_zip=create_zip,
        create_master_zip=create_zip,
        recursive=args.recursive,
        skip_existing=args.skip_existing,
        progress_callback=lambda msg: print(msg, flush=True),
    )


if __name__ == "__main__":
    main()

