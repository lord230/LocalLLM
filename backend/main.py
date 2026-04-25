

import asyncio
import base64
import io
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import List, Optional

import httpx
import psutil
from fastapi import FastAPI, File, HTTPException, BackgroundTasks, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from model_manager import model_manager, MODEL_REGISTRY, update_models_dir

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="LocalLLM Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoadModelRequest(BaseModel):
    model_id: str


class GenerateRequest(BaseModel):
    messages: List[dict]
    max_tokens: int = 2048
    model_id: Optional[str] = None
    file_context: Optional[str] = None
    file_name: Optional[str] = None
    is_image: bool = False


class DownloadRequest(BaseModel):
    model_id: str


class ConfigUpdate(BaseModel):
    models_dir: str

from typing import List, Optional, Union

class SettingsUpdate(BaseModel):
    memory: Optional[Union[dict, str]] = None
    profile: Optional[dict] = None
    gemini_api_key: Optional[str] = None

class FeedbackRequest(BaseModel):
    query: str
    response: str
    rating: int

@app.get("/status")
async def status():
    return {
        "status": "online",
        "active_model": model_manager.active_model_id,
        "is_loading": model_manager.is_loading,
        "is_loaded": model_manager.is_loaded
    }

@app.post("/feedback")
async def post_feedback(request: FeedbackRequest):
    model_manager.add_feedback(request.query, request.response, request.rating)
    return {"status": "feedback_received"}

@app.get("/embedding_status")
async def get_embedding_status():
    return model_manager.memory.get_embedding_status()


@app.get("/memory_status")
async def get_memory_status():
    return {"is_extracting": model_manager.memory.is_extracting}

@app.post("/recap_memory")
async def recap_memory(request: Request):
    data = await request.json()
    messages = data.get("messages", [])
    if not messages:
        return {"status": "no messages provided"}
    threading.Thread(target=model_manager.recap_chat_memory, args=(messages,), daemon=True).start()
    return {"status": "recap_started"}


@app.get("/memory_snapshot")
async def memory_snapshot():
    return model_manager.memory.get_four_layer_snapshot()


ALLOWED_TYPES = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}
MAX_FILE_BYTES = 20 * 1024 * 1024


def _extract_pdf_text(data: bytes) -> str:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        pages = []
        for page in doc:
            pages.append(page.get_text())
        doc.close()
        return "\n\n".join(pages).strip()
    except ImportError:
        raise HTTPException(status_code=500, detail="PyMuPDF not installed. Run: pip install pymupdf")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF extraction failed: {e}")


def _extract_image_b64(data: bytes, content_type: str) -> str:
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        max_dim = 1280
        if max(img.size) > max_dim:
            ratio = max_dim / max(img.size)
            img = img.resize((int(img.width * ratio), int(img.height * ratio)))
        buf = io.BytesIO()
        fmt = "JPEG" if content_type == "image/jpeg" else "PNG"
        img.save(buf, format=fmt)
        b64 = base64.b64encode(buf.getvalue()).decode()
        return f"data:{content_type};base64,{b64}"
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image processing failed: {e}")


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content_type = (file.content_type or "").split(";")[0].strip().lower()

    ext = Path(file.filename or "").suffix.lower()
    ext_type_map = {
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".csv": "text/csv",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    if content_type not in ALLOWED_TYPES and ext in ext_type_map:
        content_type = ext_type_map[ext]

    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {content_type or ext}")

    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB).")

    filename = file.filename or "upload"
    is_image = content_type.startswith("image/")

    if content_type == "application/pdf":
        text = _extract_pdf_text(data)
        char_count = len(text)
        return {
            "filename": filename,
            "type": "pdf",
            "content_type": content_type,
            "text": text,
            "char_count": char_count,
            "is_image": False,
        }

    elif is_image:
        b64_uri = _extract_image_b64(data, content_type)
        return {
            "filename": filename,
            "type": "image",
            "content_type": content_type,
            "text": b64_uri,
            "char_count": 0,
            "is_image": True,
        }

    else:
        try:
            text = data.decode("utf-8", errors="replace")
        except Exception:
            text = data.decode("latin-1", errors="replace")
        char_count = len(text)
        return {
            "filename": filename,
            "type": "text",
            "content_type": content_type,
            "text": text,
            "char_count": char_count,
            "is_image": False,
        }


@app.get("/models")
async def list_models():
    models = []
    for mid, meta in MODEL_REGISTRY.items():
        filename = meta.get("filename")
        model_path = model_manager.models_dir / filename if filename else None
        mmproj_filename = meta.get("mmproj_filename")
        mmproj_path = model_manager.models_dir / mmproj_filename if mmproj_filename else None
        
        models.append({
            "id": meta["id"],
            "name": meta["name"],
            "provider": meta.get("provider", "local"),
            "filename": filename,
            "vramGB": meta["vramGB"],
            "downloaded": model_path.exists() if model_path else True,
            "size_bytes": model_path.stat().st_size if model_path and model_path.exists() else 0,
            "active": mid == model_manager.active_model_id,
            "vision": meta.get("vision", False),
            "mmproj_filename": mmproj_filename,
            "mmproj_ready": mmproj_path.exists() if mmproj_path else None,
        })
    return {"models": models}



@app.post("/load_model")
async def load_model(req: LoadModelRequest):
    if req.model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {req.model_id}")

    meta = MODEL_REGISTRY[req.model_id]
    filename = meta.get("filename")
    
    if filename:
        model_path = model_manager.models_dir / filename
        if not model_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Model not downloaded yet. Download it first.",
            )

    if model_manager.is_loading:
        raise HTTPException(status_code=409, detail="Another model is currently loading.")

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, model_manager.load, req.model_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "loaded", "model_id": req.model_id}


@app.post("/unload_model")
async def unload_model():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, model_manager.unload)
    return {"status": "unloaded"}


@app.post("/flush")
async def flush():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, model_manager.unload)
    return {"status": "flushed"}


@app.post("/generate")
async def generate(req: GenerateRequest):
    if not model_manager.is_loaded:
        raise HTTPException(status_code=400, detail="No model loaded.")

    if model_manager.is_loading:
        raise HTTPException(status_code=409, detail="Model is still loading.")

    async def token_generator():
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _stream_to_queue():
            try:
                full_response = ""
                user_msg = next((m["content"] for m in reversed(req.messages) if m["role"] == "user"), "")

                active_meta = MODEL_REGISTRY.get(model_manager.active_model_id or "", {})
                is_gemini = active_meta.get("provider") == "google"
                is_vision_local = active_meta.get("vision", False) and not is_gemini

                api_messages = list(req.messages)

                if req.file_context:
                    if req.is_image:
                        if is_gemini:
                            last_user_idx = max(
                                (j for j, mm in enumerate(api_messages) if mm["role"] == "user"), default=-1
                            )
                            api_messages = [
                                {**m, "_image_b64": req.file_context, "_file_name": req.file_name or "image"}
                                if i == last_user_idx else m
                                for i, m in enumerate(api_messages)
                            ]
                        elif is_vision_local:
                            last_user_idx = max(
                                (j for j, mm in enumerate(api_messages) if mm["role"] == "user"), default=-1
                            )
                            api_messages = [
                                {**m, "_image_b64": req.file_context, "_file_name": req.file_name or "image"}
                                if i == last_user_idx else m
                                for i, m in enumerate(api_messages)
                            ]
                        else:
                            for i in range(len(api_messages) - 1, -1, -1):
                                if api_messages[i]["role"] == "user":
                                    api_messages[i] = {
                                        **api_messages[i],
                                        "content": f"[System note: The user attached an image ({req.file_name or 'image'}), but the currently loaded model does not support image input. Politely let the user know they should load the Llama 3.2 11B Vision model or switch to Gemini for image analysis.]\n\n{api_messages[i]['content']}"
                                    }
                                    break
                    else:
                        for i in range(len(api_messages) - 1, -1, -1):
                            if api_messages[i]["role"] == "user":
                                api_messages[i] = {
                                    **api_messages[i],
                                    "content": f"<document name=\"{req.file_name or 'file'}\">\n{req.file_context[:6000]}\n</document>\n\n{api_messages[i]['content']}"
                                }
                                break

                for tok in model_manager.generate_stream(api_messages, req.max_tokens):
                    if tok.startswith("__METADATA__:TOKEN_COUNT:"):
                        count = tok.split(":")[-1]
                        asyncio.run_coroutine_threadsafe(queue.put(("metadata", {"token_count": int(count)})), loop)
                    else:
                        full_response += tok
                        asyncio.run_coroutine_threadsafe(queue.put(("token", tok)), loop)

                if full_response:
                    full_history = req.messages.copy()
                    full_history.append({"role": "assistant", "content": full_response})
                    model_manager.auto_extract_memory(full_history)
                    if user_msg:
                        model_manager.memory.record_session_message("user", user_msg)
                    model_manager.memory.record_session_message("assistant", full_response)

                asyncio.run_coroutine_threadsafe(queue.put(("done", None)), loop)
            except Exception as e:
                asyncio.run_coroutine_threadsafe(queue.put(("error", str(e))), loop)

        import threading
        t = threading.Thread(target=_stream_to_queue, daemon=True)
        t.start()

        while True:
            kind, data = await queue.get()
            if kind == "metadata":
                yield {"event": "token_usage", "data": json.dumps(data)}
            elif kind == "token":
                yield {"event": "token", "data": json.dumps({"token": data})}
            elif kind == "done":
                yield {"event": "done", "data": json.dumps({"done": True})}
                break

            elif kind == "error":
                yield {"event": "error", "data": json.dumps({"error": data})}
                break

    return EventSourceResponse(token_generator())


@app.post("/download_model")
async def download_model(req: DownloadRequest):
    if req.model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {req.model_id}")

    meta = MODEL_REGISTRY[req.model_id]
    if meta.get("provider") == "google":
        return {"status": "already_downloaded", "model_id": req.model_id}

    filename = meta.get("filename")
    model_path = model_manager.models_dir / filename
    mmproj_filename = meta.get("mmproj_filename")
    mmproj_url = meta.get("mmproj_url")
    mmproj_path = model_manager.models_dir / mmproj_filename if mmproj_filename else None

    main_already_done = model_path.exists()
    mmproj_already_done = (not mmproj_path) or mmproj_path.exists()

    if main_already_done and mmproj_already_done:
        return {"status": "already_downloaded", "model_id": req.model_id}

    async def _download_file(url: str, dest: Path, label: str):
        tmp_path = dest.with_suffix(".tmp")
        from model_manager import get_setting
        hf_token = get_setting("hf_token", "")
        headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
        async with httpx.AsyncClient(timeout=None, follow_redirects=True, headers=headers) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                total = int(response.headers.get("content-length", 0))
                downloaded = 0
                start_time = time.time()
                with open(tmp_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
                        downloaded += len(chunk)
                        elapsed = time.time() - start_time
                        speed = downloaded / elapsed if elapsed > 0 else 0
                        pct = (downloaded / total * 100) if total > 0 else 0
                        yield {
                            "event": "progress",
                            "data": json.dumps({
                                "downloaded": downloaded, "total": total,
                                "percent": round(pct, 1),
                                "speed_mbps": round(speed / 1e6, 2),
                                "filename": dest.name,
                                "label": label,
                            }),
                        }
            tmp_path.rename(dest)

    async def download_generator():
        try:
            if not main_already_done:
                async for event in _download_file(meta["url"], model_path, "Main model"):
                    yield event

            if mmproj_path and not mmproj_already_done and mmproj_url:
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "downloaded": 0, "total": 0, "percent": 0, "speed_mbps": 0,
                        "filename": mmproj_filename, "label": "Vision encoder",
                    }),
                }
                async for event in _download_file(mmproj_url, mmproj_path, "Vision encoder"):
                    yield event

            yield {
                "event": "done",
                "data": json.dumps({"status": "downloaded", "model_id": req.model_id, "filename": filename}),
            }
        except Exception as e:
            for p in [model_path.with_suffix(".tmp"), mmproj_path.with_suffix(".tmp") if mmproj_path else None]:
                if p and p.exists():
                    try: p.unlink()
                    except: pass
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(download_generator())


@app.get("/config")
async def get_config():
    return {
        "models_dir": str(model_manager.models_dir),
    }


@app.post("/config")
async def set_config(req: ConfigUpdate):
    success = update_models_dir(req.models_dir)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update models directory or directory is not writable.")
    return {"status": "ok", "models_dir": str(model_manager.models_dir)}


class SettingsUpdate(BaseModel):
    memory: Optional[Union[dict, str]] = None
    profile: Optional[dict] = None
    gemini_api_key: Optional[str] = None
    assistant_name: Optional[str] = None
    hf_token: Optional[str] = None


@app.get("/settings")
async def get_settings():
    from model_manager import load_settings
    return load_settings()


@app.post("/settings")
async def update_settings(req: SettingsUpdate):
    from model_manager import load_settings, save_settings, model_manager
    settings = load_settings()
    if req.memory is not None:
        settings["memory"] = req.memory
    if req.profile is not None:
        settings["profile"] = req.profile
    if req.gemini_api_key is not None:
        settings["gemini_api_key"] = req.gemini_api_key
    if req.hf_token is not None:
        settings["hf_token"] = req.hf_token

    if req.assistant_name is not None:
        settings["assistant_name"] = req.assistant_name
        memory = model_manager.memory._load_memory()
        memory["assistant_name"] = req.assistant_name
        model_manager.memory._save_memory(memory)
        
    save_settings(settings)
    return {"status": "ok", "settings": settings}


@app.get("/system_stats")
async def system_stats():
    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    return {
        "cpu_percent": cpu,
        "ram_used_gb": round(mem.used / 1e9, 2),
        "ram_total_gb": round(mem.total / 1e9, 2),
        "ram_percent": mem.percent,
    }


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="LocalLLM Backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
