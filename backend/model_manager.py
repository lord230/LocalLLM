

import os
import sys
import gc
import threading
import logging
import json
import time
import httpx
from google import genai
from pathlib import Path
from typing import Optional, Dict, Any, Union, List
from llama_cpp import Llama
from memory import MemorySystem, MEMORY_SUMMARY_PROMPT, CONSOLIDATION_PROMPT

logger = logging.getLogger(__name__)

if os.name == 'nt':
    try:
        import sysconfig as _sc
        _site = _sc.get_path('purelib')
        _nvidia_pkgs = ["cuda_runtime", "cublas", "cuda_nvrtc"]
        for _pkg in _nvidia_pkgs:
            _bin = os.path.join(_site, "nvidia", _pkg, "bin")
            if os.path.isdir(_bin):
                os.add_dll_directory(_bin)
        _llama_lib = os.path.join(_site, "llama_cpp", "lib")
        if os.path.isdir(_llama_lib):
            os.add_dll_directory(_llama_lib)
    except Exception as _e:
        print(f"[WARNING] Could not register CUDA DLL dirs: {_e}")

if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

SETTINGS_FILE = BASE_DIR / "settings.json"

def load_settings():
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load settings: {e}")
    return {}

def save_settings(settings):
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f, indent=4)
        global _config
        _config = settings
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")

def get_setting(key: str, default: Any = None) -> Any:
    return _config.get(key, default)

_config = load_settings()
_initial_models_dir = _config.get("models_dir")
if _initial_models_dir:
    MODELS_DIR = Path(_initial_models_dir)
else:
    MODELS_DIR = BASE_DIR / "models"

MEMORY_FILE = BASE_DIR / "memory.json"
CACHE_DIR = MODELS_DIR / "cache"

def update_models_dir(new_path: str):
    global MODELS_DIR, CACHE_DIR
    path = Path(new_path)
    try:
        path.mkdir(parents=True, exist_ok=True)
        MODELS_DIR = path
        CACHE_DIR = path / "cache"
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        settings = load_settings()
        settings["models_dir"] = str(path)
        save_settings(settings)
        os.environ["HF_HOME"] = str(CACHE_DIR / "huggingface")
        os.environ["XDG_CACHE_HOME"] = str(CACHE_DIR)
        logger.info(f"Models directory updated to: {path}")
        return True
    except Exception as e:
        logger.error(f"Failed to update models directory: {e}")
        return False

MODELS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
os.environ["HF_HOME"] = str(CACHE_DIR / "huggingface")
os.environ["XDG_CACHE_HOME"] = str(CACHE_DIR)

GGUF_MODELS = [
    {"id": "llama3-8b",           "name": "Llama 3.1 8B",          "provider": "local", "type": "general", "vision": False, "filename": "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",      "url": "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",      "vramGB": 5.5, "n_gpu_layers": 99, "context_size": 8192},
    {"id": "qwen2.5-14b-instruct", "name": "Qwen 2.5 14B Instruct", "provider": "local", "type": "general", "vision": False, "filename": "Qwen2.5-14B-Instruct-Q4_K_M.gguf",             "url": "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",             "vramGB": 9.5, "n_gpu_layers": 33, "context_size": 8192},
    {"id": "qwen2.5-14b-coder",   "name": "Qwen 2.5 14B Coder",    "provider": "local", "type": "coder",   "vision": False, "filename": "Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf",        "url": "https://huggingface.co/bartowski/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf",        "vramGB": 9.5, "n_gpu_layers": 99, "context_size": 8192},
    {"id": "qwen2.5-7b-coder",    "name": "Qwen 2.5 7B Coder",     "provider": "local", "type": "coder",   "vision": False, "filename": "qwen2.5-coder-7b-instruct-q4_k_m.gguf",       "url": "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",       "vramGB": 4.8, "n_gpu_layers": 99, "context_size": 8192},
    {
        "id": "llava-1.5-7b",
        "name": "LLaVA 1.5 7B",
        "provider": "local",
        "type": "general",
        "vision": True,
        "filename": "ggml-model-q4_k.gguf",
        "url": "https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/ggml-model-q4_k.gguf",
        "mmproj_filename": "mmproj-model-f16.gguf",
        "mmproj_url": "https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/mmproj-model-f16.gguf",
        "vramGB": 5.0,
        "n_gpu_layers": 99,
        "context_size": 4096,
    },
]

GEMINI_MODELS: list = []

MODEL_REGISTRY: Dict[str, Dict] = {m["id"]: m for m in GGUF_MODELS}

GENERAL_SYSTEM_PROMPT = """You are {name} — an adaptive local AI system.
Your personality and style evolve based on USER FEEDBACK (Likes/Dislikes).
Focus on conversational memory, profile awareness, and helpful assistance.
Use memory context naturally as background knowledge — never say "I remember" or "based on your memory". Just know it."""

CODER_SYSTEM_PROMPT = """You are {name} — an expert AI coding assistant.
Focus on high-precision logic, efficient code structure, and technical accuracy.
Keep responses concise, professional, and code-centric. No fluff.
Use memory context naturally as background knowledge — never explicitly announce you are recalling past context."""


class ModelManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized: return
        self._model = None
        self._active_model_id = None
        self._loading = False
        self._model_lock = threading.RLock()
        self._initialized = True
        self.memory = MemorySystem(BASE_DIR, MODELS_DIR)
        
        self._last_activity = time.time()
        self._is_maintaining = False
        self._stop_watchdog = False
        self._watchdog = threading.Thread(target=self._run_idle_watchdog, daemon=True)
        self._watchdog.start()

    def _run_idle_watchdog(self):
        while not self._stop_watchdog:
            try:
                time.sleep(2)
                now = time.time()
                if (now - self._last_activity) >= 4.0 and not self._loading and not self._is_maintaining and self.is_loaded:
                    memory_data = self.memory._load_memory()
                    profile = memory_data.get("profile", [])
                    if len(profile) > 5: 
                        self._is_maintaining = True
                        try:
                            self._compress_profile_memory()
                        finally:
                            self._last_activity = time.time()
                            self._is_maintaining = False
            except Exception as e:
                logger.error(f"Idle watchdog error: {e}")
                time.sleep(5)

    @property
    def models_dir(self) -> Path: return MODELS_DIR

    @property
    def cache_dir(self) -> Path: return CACHE_DIR

    @property
    def active_model_id(self) -> Optional[str]: return self._active_model_id

    @property
    def is_loading(self) -> bool: return self._loading

    @property
    def is_loaded(self) -> bool:
        if self._active_model_id and MODEL_REGISTRY[self._active_model_id].get("provider") == "google":
            return True
        return self._model is not None

    def get_model_info(self) -> Optional[Dict[str, Any]]:
        return MODEL_REGISTRY.get(self._active_model_id) if self._active_model_id else None

    def get_embedding_status(self) -> dict:
        return self.memory.get_embedding_status()

    def auto_extract_memory(self, history: List[Dict[str, str]]):
        self._last_activity = time.time()
        
        if history:
            last_msg = history[-1]["content"].lower()
            if any(cmd in last_msg for cmd in ["clear memory", "forget everything", "erase all memory"]):
                self.memory.clear_all_memory()
                return

        threading.Thread(target=self._run_extraction_pass, args=(history,), daemon=True).start()

    def _run_extraction_pass(self, history: List[Dict[str, str]]):
        meta = self.get_model_info()
        if not meta or not history: return
        
        context_slice = history[-5:]
        history_str = ""
        for msg in context_slice:
            role = "User" if msg["role"] == "user" else "Assistant"
            history_str += f"{role}: {msg['content']}\n"
            
        prompt = MEMORY_SUMMARY_PROMPT.format(conversation_history=history_str)
        
        try:
            if meta.get("provider") == "google":
                # Google GenAI extraction
                api_key = get_setting("gemini_api_key")
                if not api_key: return
                client = genai.Client(api_key=api_key)
                res = client.models.generate_content(model=meta["id"], contents=prompt)
                output = res.text or ""
            else:
                with self._model_lock:
                    if not self._model: return
                    res = self._model.create_completion(prompt=prompt, max_tokens=256, temperature=0.1, stop=["User:", "Assistant:"])
                    output = res["choices"][0]["text"].strip()
            
            mirrored_new = self.memory.process_extracted_facts(output)
            
            session_id = str(int(time.time() // 3600))
            if len(history) >= 2:
                last_user = next((m for m in reversed(history) if m["role"] == "user"), None)
                last_asst = next((m for m in reversed(history) if m["role"] == "assistant"), None)
                if last_user:
                    self.memory.store_message_embedding("user", last_user["content"], session_id)
                if last_asst:
                    self.memory.store_message_embedding("assistant", last_asst["content"], session_id)

            memory_data = self.memory._load_memory()
            profile = memory_data.get("profile", [])
            if mirrored_new or len(profile) > 10:
                self._compress_profile_memory()
                
        except Exception as e:
            logger.error(f"Unified extraction pass failed: {e}")

    def _compress_profile_memory(self):
        memory_data = self.memory._load_memory()
        profile = memory_data.get("profile", [])
        if not profile or len(profile) < 5: return
        
        meta = self.get_model_info()
        if not meta: return
        raw_list = "\n".join([f"- {p}" for p in profile])
        prompt = CONSOLIDATION_PROMPT.format(raw_list=raw_list)
        
        try:
            if meta.get("provider") == "google":
                api_key = get_setting("gemini_api_key")
                if not api_key: return
                client = genai.Client(api_key=api_key)
                res = client.models.generate_content(model=meta["id"], contents=prompt)
                output = res.text or ""
            else:
                with self._model_lock:
                    if not self._model: return
                    res = self._model.create_completion(prompt=prompt, max_tokens=512, temperature=0.1)
                    output = res["choices"][0]["text"].strip()
            
            self.memory.consolidate_profile(output)
            logger.info("Memory consolidation complete via active model.")
                
        except Exception as e:
            logger.error(f"Memory consolidation failed: {e}")

    def add_feedback(self, query: str, response: str, rating: int):
        if self.memory:
            self.memory.add_feedback(query, response, rating)
            logger.info(f"Feedback stored: {rating}")

    def unload(self):
        with self._model_lock:
            if self._model:
                self._model = None
                self._active_model_id = None
                gc.collect()
                try:
                    import torch
                    if torch.cuda.is_available(): torch.cuda.empty_cache()
                except: pass

    def count_tokens(self, messages: list, provider: str, model_id: str) -> int:
        if provider == "google":
            api_key = get_setting("gemini_api_key")
            if not api_key: return 0
            client = genai.Client(api_key=api_key)
            contents = [{"role": ("user" if m["role"] == "user" else "model"), "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
            sys = next((m["content"] for m in messages if m["role"] == "system"), None)
            try:
                res = client.models.count_tokens(model=model_id, contents=contents, config={"system_instruction": sys} if sys else None)
                return res.total_tokens
            except: return 0
        else:
            if not self._model: return 0
            with self._model_lock:
                total = 0
                for m in messages: total += len(self._model.tokenize(f"{m['role']}: {m['content']}".encode('utf-8')))
                return total

    def recap_chat_memory(self, messages: list):
        if not messages: return
        self.auto_extract_memory(messages)

    def prune_messages(self, messages: list, max_tokens: int) -> list:
        meta = self.get_model_info()
        if not meta: return messages
        limit = meta.get("context_size", 4096) - max_tokens - 500
        pruned = [m.copy() for m in messages]
        has_sys = pruned and pruned[0]["role"] == "system"
        while len(pruned) > (2 if has_sys else 1) and self.count_tokens(pruned, meta["provider"], meta["id"]) > limit:
            pruned.pop(1 if has_sys else 0)
        return pruned

    def load(self, model_id: str) -> bool:
        if model_id not in MODEL_REGISTRY: return False
        meta = MODEL_REGISTRY[model_id]
        if meta.get("provider") == "google":
            self.unload()
            self._active_model_id = model_id
            return True
        model_path = MODELS_DIR / meta["filename"]
        if not model_path.exists(): return False
        n_gpu_layers = meta.get("n_gpu_layers", 99)
        try:
            self._loading = True
            with self._model_lock:
                # Vision models need a clip/mmproj chat handler
                if meta.get("vision") and meta.get("mmproj_filename"):
                    mmproj_path = MODELS_DIR / meta["mmproj_filename"]
                    if not mmproj_path.exists():
                        raise FileNotFoundError(f"Vision encoder not found: {mmproj_path.name}. Download it first.")
                    try:
                        from llama_cpp.llama_chat_format import (
                            Llama3VisionAlphaChatHandler,
                            Llava16ChatHandler,
                            Llava15ChatHandler,
                        )
                        model_id_lower = model_id.lower()
                        if "llama3.2" in model_id_lower or "llama-3.2" in model_id_lower:
                            chat_handler = Llama3VisionAlphaChatHandler(
                                clip_model_path=str(mmproj_path), verbose=False
                            )
                        elif "llava-1.5" in model_id_lower or "llava_1.5" in model_id_lower:
                            # LLaVA 1.5 uses the original CLIP-based handler
                            chat_handler = Llava15ChatHandler(
                                clip_model_path=str(mmproj_path), verbose=False
                            )
                        else:
                            # Default to LLaVA 1.6 for everything else
                            chat_handler = Llava16ChatHandler(
                                clip_model_path=str(mmproj_path), verbose=False
                            )
                    except ImportError as ie:
                        raise RuntimeError(f"Vision handler unavailable: {ie}. Update llama-cpp-python.")

                    self._model = Llama(
                        model_path=str(model_path),
                        chat_handler=chat_handler,
                        n_gpu_layers=n_gpu_layers,
                        n_ctx=meta.get("context_size", 4096),
                        n_batch=512,
                        n_threads=8,
                        verbose=False,
                        use_mlock=False,
                        use_mmap=True,
                        embedding=False,
                    )
                else:
                    self._model = Llama(
                        model_path=str(model_path),
                        n_gpu_layers=n_gpu_layers,
                        n_ctx=meta.get("context_size", 8192),
                        n_batch=512,
                        n_threads=8,
                        verbose=False,
                        use_mlock=False,
                        use_mmap=True,
                        embedding=False,
                    )
                self._active_model_id = model_id
                return True
        finally:
            self._loading = False

    def generate_stream(self, messages: list, max_tokens: int = 2048):
        self._last_activity = time.time()
        meta = self.get_model_info()
        memory_data = self.memory._load_memory()
        profile_list = memory_data.get("profile", [])
        rules_dict = memory_data.get("style_rules", {})
        name = memory_data.get("assistant_name", "Antigravity")
        user_name = memory_data.get("user_name", "")
        onboarding_step = memory_data.get("onboarding_step", 0)
        
        # Get relevant context from long-term memory
        query = messages[-1]["content"] if messages else ""
        vector_context = self.memory.retrieve_context(query) if query else ""
        profile_str = "\n".join([f"- {p}" for p in profile_list]) if profile_list else ""

        sorted_rules = sorted(rules_dict.items(), key=lambda x: x[1], reverse=True)
        top_rules = [r[0] for r in sorted_rules if r[1] > 1.0][:5]
        rules_str = "\nLEARNED BEHAVIOR RULES (REINFORCED):\n" + "\n".join([f"- {r}" for r in top_rules]) if top_rules else ""

        onboarding_str = ""
        base_prompt = CODER_SYSTEM_PROMPT if meta and meta.get("type") == "coder" else GENERAL_SYSTEM_PROMPT
        base_prompt = base_prompt.format(name=name)
        combined_sys = f"{base_prompt}\n"
        
        if profile_str or vector_context:
            combined_sys += "\nRelevant user memory:\n"
            if profile_str: combined_sys += f"{profile_str}\n"
            if vector_context: combined_sys += f"{vector_context}\n"
            combined_sys += "\nAnswer naturally and intelligently based on this memory.\n"

        if rules_str: combined_sys += f"{rules_str}\n"
        if onboarding_str: combined_sys += f"{onboarding_str}\n"
        
        processed = [{"role": "system", "content": combined_sys.strip()}]
        for m in messages:
            if m["role"] != "system":
                processed.append(m.copy())
        
        processed = self.prune_messages(processed, max_tokens)
        yield f"__METADATA__:TOKEN_COUNT:{self.count_tokens(processed, meta['provider'], meta['id'])}"

        full_response = ""
        if meta.get("provider") == "google":
            for chunk in self._generate_gemini_stream(processed, max_tokens):
                full_response += chunk
                yield chunk
        else:
            if not self._model: raise RuntimeError("No model loaded")
            with self._model_lock:
                vision_messages = []
                for m in processed:
                    if m.get("_image_b64"):
                        b64_uri = m["_image_b64"]
                        content_parts = [
                            {"type": "image_url", "image_url": {"url": b64_uri}},
                            {"type": "text", "text": m.get("content", "")},
                        ]
                        vision_messages.append({"role": m["role"], "content": content_parts})
                    else:
                        vision_messages.append(m)

                stream = self._model.create_chat_completion(
                    messages=vision_messages,
                    max_tokens=max_tokens,
                    temperature=0.85,
                    top_p=0.95,
                    repeat_penalty=1.1,
                    stream=True,
                )
                for chunk in stream:
                    content = chunk["choices"][0].get("delta", {}).get("content", "")
                    for tag in ["<pad>", "[INST]", "[/INST]", "<SYS>", "</SYS>"]: content = content.replace(tag, "")
                    if content:
                        full_response += content
                        yield content

    def _generate_gemini_stream(self, messages: list, max_tokens: int):
        import base64
        api_key = get_setting("gemini_api_key")
        if not api_key: raise RuntimeError("No API key")
        client = genai.Client(api_key=api_key)
        model_name = self.get_model_info()["id"]
        sys = next((m["content"] for m in messages if m["role"] == "system"), None)

        contents = []
        for m in messages:
            if m["role"] == "system":
                continue
            role = "user" if m["role"] == "user" else "model"
            parts = []

            # Check for attached image (inserted by main.py as _image_b64)
            if m.get("_image_b64"):
                b64_uri: str = m["_image_b64"]
                if b64_uri.startswith("data:"):
                    header, raw_b64 = b64_uri.split(",", 1)
                    mime = header.split(":")[1].split(";")[0]
                else:
                    raw_b64 = b64_uri
                    mime = "image/jpeg"
                parts.append({
                    "inline_data": {
                        "mime_type": mime,
                        "data": raw_b64,
                    }
                })

            if m.get("content"):
                parts.append({"text": m["content"]})

            if parts:
                contents.append({"role": role, "parts": parts})

        try:
            response = client.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config={
                    "system_instruction": sys,
                    "max_output_tokens": max_tokens,
                    "temperature": 0.85,
                    "top_p": 0.95,
                }
            )
            for chunk in response:
                if chunk.text: yield chunk.text
        except Exception as e: raise RuntimeError(f"Gemini error: {e}")


model_manager = ModelManager()
