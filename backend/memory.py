import os
import json
import time
import threading
import logging
import httpx
import gc
import re
import numpy as np
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from llama_cpp import Llama

logger = logging.getLogger(__name__)

EMBED_MODEL_FILENAME = "all-minilm-l6-v2-q8_0.gguf"
EMBED_MODEL_URL = "https://huggingface.co/fartboner/all-MiniLM-L6-v2-Q8_0-GGUF/resolve/main/all-minilm-l6-v2-q8_0.gguf"

MEMORY_SUMMARY_PROMPT = (
    "<|system|>\n"
    "You are a master of contextual memory. TASK: Create a high-density, concise summary of the shared developments in this chat segment.\n"
    "\n"
    "<GOALS>\n"
    "1. IDENTITY: Explicitly mention core identity facts (Name, Job, Location, Age, Projects) first.\n"
    "2. PROGRESS: Capture specific project tasks, coding choices, or technical goals.\n"
    "3. IMPORTANCE: Rate the overall significance of this info from 1 to 10 (10 being critical).\n"
    "4. COMMANDS: If the user explicitly asks to 'forget' or 'clear memory', output '[ACTION: CLEAR]' or '[ACTION: FORGET: <topic>]' as the summary.\n"
    "</GOALS>\n"
    "\n"
    "<RULES>\n"
    "- Output Format: '[IMPORTANCE: X] Summary text...'\n"
    "- If it's a correction of old memory, use '[IMPORTANCE: 10] UPDATE: ...'\n"
    "- Output a SINGLE paragraph (max 3-4 sentences).\n"
    "- Use third-person (e.g., 'User shared they live in Kolkata').\n"
    "- If NO meaningful info was shared, output 'NONE'.\n"
    "</RULES><|user|>\n"
    "{conversation_history}\n<|assistant|>\n"

    
)

CONSOLIDATION_PROMPT = (
    "<|system|>\n"
    "You are a memory consolidation expert. Review the user's profile facts and create a definitive interaction narrative.\n"
    "\n"
    "<GOALS>\n"
    "1. Identity Consistency: Prioritize the MOST RECENT information. If the user corrected a fact (e.g., 'I actually live in X, not Y'), remove the old fact and keep the new one.\n"
    "2. Deduplication: Merge overlapping roles, projects, or locations into single, rich sentences.\n"
    "3. Conciseness: Aim for 4-5 high-density sentences total.\n"
    "</GOALS>\n"
    "\n"
    "Output ONLY the new list, one fact per line, starting with '-'.<|user|>\n"
    "{raw_list}\n<|assistant|>\n"
)

class MemorySystem:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, base_dir: Path, models_dir: Path):
        if hasattr(self, "_initialized") and self._initialized: return
        self.base_dir = base_dir
        self.models_dir = models_dir
        self.profile_file = base_dir / "profile.json"
        self.vectors_file = base_dir / "vectors.json"
        self.legacy_file = base_dir / "memory.json"
        
        self._embed_model = None
        self._embed_lock = threading.RLock()
        self._downloading_embed = False
        self.is_extracting = False

        self._session_start: float = time.time()
        self._session_message_count: int = 0
        self._session_token_count: int = 0
        self._rolling_summary: str = ""
        self._active_topics: List[str] = []
        self._recent_store_events: List[Dict] = []
        self._summary_lock = threading.Lock()
        
        self._initialized = True
        logger.info(f"MemorySystem initialized at {self.base_dir}")

    def _load_memory(self) -> dict:
        default_mem = {
            "profile": [], 
            "vectors": [], 
            "feedback": [], 
            "style_rules": {}, 
            "assistant_name": "Antigravity",
            "user_name": "",
            "onboarding_step": 0
        }
        
        if self.legacy_file.exists() and not self.profile_file.exists():
            try:
                logger.info("Migrating legacy memory.json to split files...")
                with open(self.legacy_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._save_memory(data)
                self.legacy_file.replace(self.legacy_file.with_suffix(".json.bak"))
                logger.info("Legacy memory migration complete.")
            except Exception as e:
                logger.error(f"Migration failed: {e}")

        merged = default_mem.copy()
        
        if self.profile_file.exists():
            try:
                with open(self.profile_file, "r", encoding="utf-8") as f:
                    merged.update(json.load(f))
            except: pass
            
        if self.vectors_file.exists():
            try:
                with open(self.vectors_file, "r", encoding="utf-8") as f:
                    merged.update(json.load(f))
            except: pass
            
        return merged

    def _save_memory(self, memory: dict):
        profile_keys = ["profile", "assistant_name", "user_name", "onboarding_step", "style_rules"]
        vectors_keys = ["vectors", "feedback"]
        
        try:
            p_data = {k: memory.get(k) for k in profile_keys if k in memory}
            with open(self.profile_file, "w", encoding="utf-8") as f:
                json.dump(p_data, f, indent=4, ensure_ascii=False)
                
            v_data = {k: memory.get(k) for k in vectors_keys if k in memory}
            with open(self.vectors_file, "w", encoding="utf-8") as f:
                json.dump(v_data, f, indent=4, ensure_ascii=False)
        except Exception as e: 
            logger.error(f"Save memory split failed: {e}")

    def _ensure_embedding_model(self):
        if self._embed_model is not None or self._downloading_embed: return
        with self._embed_lock:
            if self._embed_model is not None: return
            path = self.models_dir / EMBED_MODEL_FILENAME
            if path.exists() and path.stat().st_size > 10 * 1024 * 1024:
                try:
                    self._embed_model = Llama(model_path=str(path), n_gpu_layers=0, n_ctx=512, embedding=True, verbose=False)
                    logger.info("Embedding model loaded.")
                    return
                except Exception as e:
                    logger.warning(f"Failed to load existing embedding model: {e}")
                    try: path.unlink()
                    except: pass
            
            self._downloading_embed = True
            threading.Thread(target=self._download_embedding_model, args=(EMBED_MODEL_URL, path), daemon=True).start()

    def _download_embedding_model(self, url: str, path: Path):
        tmp_path = path.with_suffix(".tmp")
        try:
            logger.info(f"Downloading embedding model from {url}...")
            path.parent.mkdir(parents=True, exist_ok=True)
            
            with httpx.stream("GET", url, follow_redirects=True, timeout=None) as response:
                response.raise_for_status()
                with open(tmp_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192):
                        f.write(chunk)
            
            tmp_path.replace(path)
            logger.info("Embedding model download complete.")
            
            with self._embed_lock:
                self._embed_model = Llama(model_path=str(path), n_gpu_layers=0, n_ctx=512, embedding=True, verbose=False)
        except Exception as e:
            logger.error(f"Failed to download embedding model: {e}")
            if tmp_path.exists(): tmp_path.unlink()
        finally:
            self._downloading_embed = False

    def _sanitize_text(self, text: str) -> str:
        text = re.sub(r'<[^>]+>', '', text)
        for token in ['[INST]', '[/INST]', '<s>', '</s>', '<pad>', '[PAD]']:
            text = text.replace(token, '')
        text = re.sub(r'(\s*[<>\[\]/]+\s*){3,}', ' ', text)
        text = re.sub(r'\s{2,}', ' ', text).strip()
        return text

    def process_extracted_facts(self, raw_output: str) -> bool:
        if not raw_output or "NONE" in raw_output.upper(): return
        
        raw_output = self._sanitize_text(raw_output)
        if not raw_output or "NONE" in raw_output.upper(): return

        importance = 0
        summary = raw_output
        importance_match = re.search(r"\[IMPORTANCE:\s*(\d+)\]", raw_output, re.IGNORECASE)
        if importance_match:
            importance = int(importance_match.group(1))
            summary = raw_output.replace(importance_match.group(0), "").strip()
            
        if len(summary) < 10: return
        
        if "[ACTION: CLEAR]" in raw_output.upper():
            logger.info("ACTION: CLEAR detected. Wiping all memory.")
            memory = self._load_memory()
            memory["profile"] = []
            memory["vectors"] = []
            self._save_memory(memory)
            print("Memory updated: ALL MEMORY CLEARED per user request.")
            return True

        forget_match = re.search(r"\[ACTION: FORGET:\s*(.+?)\]", raw_output, re.IGNORECASE)
        if forget_match:
            topic = forget_match.group(1).strip()
            logger.info(f"ACTION: FORGET detected for topic: {topic}. Scrubbing memory.")
            return False

        critical_markers = ["is named", "user is a", "lives in", "project", "interested in"]
        is_critical = any(m in summary.lower() for m in critical_markers)
        
        if importance < 4 and not is_critical:
            logger.info(f"Discarding low-importance memory (Score: {importance})")
            return False

        self._add_to_vectors(summary)
        
        memory = self._load_memory()
        mirrored_new = False
        
        facts_to_mirror = []
        
        if not memory.get("user_name"):
            name_match = re.search(r"(?:user(?:'s)?\s+is\s+named\s+|my\s+name\s+is\s+|user\s+name\s+is\s+)([\w\s]+)", summary, re.IGNORECASE)
            if name_match:
                detected_name = name_match.group(1).strip().split()[0]
                if len(detected_name) > 1:
                    memory["user_name"] = detected_name
                    if memory.get("onboarding_step", 0) == 0:
                        memory["onboarding_step"] = 1
                    logger.info(f"Auto-detected user name from summary: {detected_name}")

        identity_patterns = [
            r"user\s+is\s+a\s+([\w\s\-]+(?:\.))",
            r"user\s+lives\s+in\s+([\w\s\-]+(?:\.))",
            r"user(?:'s)?\s+favorite\s+[\w\s]+\s+is\s+([\w\s\-]+(?:\.))" 
        ]
        
        for pattern in identity_patterns:
            matches = re.findall(pattern, summary, re.IGNORECASE)
            for m in matches:
                fact = f"User {summary[summary.find(m)-len('is a '):summary.find(m)+len(m)]}".strip()
                pass 

        sentences = [s.strip() for s in re.split(r'[.!?]', summary) if s.strip()]
        profile_markers = [
            "is a", "is an", "lives in", "is named", "works at", 
            "favorite", "born in", "friend", "best friend", "knows", "hobby",
            "interested in", "belongs to", "studies", "prefers", "hates", "likes", "dislikes", "project"
        ]
        
        for s in sentences:
            if any(marker in s.lower() for marker in profile_markers):
                if not self._is_semantic_duplicate(s, memory.get("profile", []), threshold=0.85):
                    memory["profile"].append(s)
                    logger.info(f"Mirrored identity fact to profile: {s}")
                    mirrored_new = True

        self._save_memory(memory)
        if mirrored_new:
            print(f"Memory updated: Mirrored new identity facts to profile.")
        return mirrored_new
        
    def consolidate_profile(self, clean_list_str: str):
        if not clean_list_str or "NONE" in clean_list_str.upper(): return
        
        new_profile = []
        for line in clean_list_str.split("\n"):
            line = line.strip()
            if line.startswith("-"):
                fact = self._sanitize_text(line[1:].strip())
                if len(fact) > 5:
                    new_profile.append(fact)
        
        if new_profile:
            memory = self._load_memory()
            memory["profile"] = new_profile
            self._save_memory(memory)
            logger.info(f"Consolidated profile to {len(new_profile)} items.")
            print(f"Memory updated: Profile consolidated to {len(new_profile)} high-density facts.")

    def _is_semantic_duplicate(self, new_fact: str, existing_list: List[str], threshold: float = 0.85) -> bool:
        if not existing_list: return False
        self._ensure_embedding_model()
        if not self._embed_model: return False
        
        try:
            new_emb = np.array(self._embed_model.embed(new_fact))
            norm_new = np.linalg.norm(new_emb)
            if norm_new == 0: return False
            
            for exist in existing_list:
                if new_fact.lower() in exist.lower() or exist.lower() in new_fact.lower(): return True
                
                exist_emb = np.array(self._embed_model.embed(exist))
                norm_exist = np.linalg.norm(exist_emb)
                if norm_exist == 0: continue
                
                sim = np.dot(new_emb, exist_emb) / (norm_new * norm_exist)
                if sim > threshold: return True
        except: pass
        return False

    def _add_to_profile(self, fact: str):
        memory = self._load_memory()
        profile = memory.get("profile", [])
        
        if self._is_semantic_duplicate(fact, profile):
            return
            
        profile.append(fact)
        memory["profile"] = profile
        self._save_memory(memory)
        logger.info(f"Added to profile: {fact}")

    def _add_to_vectors(self, text: str, metadata: dict = None):
        self._ensure_embedding_model()
        if not self._embed_model: return
        
        memory = self._load_memory()
        vectors = memory.get("vectors", [])
        if any(v.get("text") == text for v in vectors): return
        
        try:
            embedding = self._embed_model.embed(text)
            entry = {
                "text": text,
                "embedding": embedding,
                "timestamp": time.time()
            }
            if metadata:
                entry.update(metadata)
            vectors.append(entry)
            memory["vectors"] = vectors
            self._save_memory(memory)
            logger.info(f"Added to long-term memory: {text[:60]}...")
        except Exception as e:
            logger.error(f"Vector add failed: {e}")

    def store_message_embedding(self, role: str, content: str, session_id: str = ""):
        content = self._sanitize_text(content)
        if not content or len(content) < 20: return
        text = f"{role.capitalize()}: {content}"
        self._add_to_vectors(text, metadata={"role": role, "session": session_id})

    def retrieve_context(self, query: str, top_k: int = 5) -> str:
        self._ensure_embedding_model()
        if not self._embed_model: return ""
        
        memory = self._load_memory()
        vectors = memory.get("vectors", [])
        if not vectors: return ""
        
        try:
            query_emb = self._embed_model.embed(query)
            similarities = []
            a = np.array(query_emb)
            norm_a = np.linalg.norm(a)
            
            for v in vectors:
                b = np.array(v["embedding"])
                norm_b = np.linalg.norm(b)
                if norm_a == 0 or norm_b == 0: continue
                sim = np.dot(a, b) / (norm_a * norm_b)
                similarities.append((sim, v["text"]))
            
            results = sorted([s for s in similarities if s[0] > 0.60], key=lambda x: x[0], reverse=True)
            return "\n".join([r[1] for r in results[:top_k]])
        except Exception as e:
            logger.error(f"Retrieval failed: {e}")
            return ""

    def auto_extract_memory(self, history: List[dict]):
        def _bg():
            try:
                self.is_extracting = True
                self.process_chat_for_memory(history)
            finally:
                self.is_extracting = False

        threading.Thread(target=_bg, daemon=True).start()

    def update_profile(self, new_profile_list: List[str]):
        memory = self._load_memory()
        memory["profile"] = new_profile_list
        self._save_memory(memory)
        print("Memory updated: Profile updated directly from settings.")

    def get_settings(self) -> dict:
        memory = self._load_memory()
        return {
            "assistant_name": memory.get("assistant_name", "Antigravity"),
            "user_name": memory.get("user_name", ""),
            "onboarding_step": memory.get("onboarding_step", 0),
            "profile": memory.get("profile", [])
        }

    def update_settings(self, updates: dict):
        memory = self._load_memory()
        for k, v in updates.items():
            if k in memory: memory[k] = v
        self._save_memory(memory)

    def clear_all_memory(self):
        memory = self._load_memory()
        memory["profile"] = []
        memory["vectors"] = []
        self._save_memory(memory)
        print("Memory updated: ALL MEMORY CLEARED per user request.")

    def add_feedback(self, query: str, response: str, rating: int):
        memory = self._load_memory()
        memory["feedback"].append({
            "query": query, "response": response, "rating": rating, "timestamp": time.time()
        })
        self._save_memory(memory)

    def get_embedding_status(self) -> dict:
        return {
            "status": "downloading" if self._downloading_embed else ("loaded" if self._embed_model else "idle"),
            "loaded": self._embed_model is not None,
            "downloading": self._downloading_embed
        }

    def record_session_message(self, role: str, content: str, token_count: int = 0):
        with self._summary_lock:
            self._session_message_count += 1
            self._session_token_count += token_count

            words = re.findall(r'\b[a-zA-Z]{5,}\b', content.lower())
            stopwords = {'about', 'above', 'after', 'again', 'could', 'every', 'first',
                         'there', 'these', 'their', 'there', 'would', 'which', 'where',
                         'being', 'doing', 'other', 'should', 'those', 'while', 'because',
                         'before', 'still', 'under', 'using', 'youre', 'maybe', 'really',
                         'think', 'right', 'going', 'something', 'actually', 'please', 'model'}
            keywords = [w for w in words if w not in stopwords]
            for kw in keywords[:4]:
                if kw not in self._active_topics:
                    self._active_topics.insert(0, kw)
            self._active_topics = self._active_topics[:8]

            if role == "user" and content.strip():
                snippet = content.strip()[:120]
                if self._rolling_summary:
                    trimmed = self._rolling_summary[-280:]
                    self._rolling_summary = trimmed + f" → {snippet}"
                else:
                    self._rolling_summary = snippet
                if len(self._rolling_summary) > 500:
                    self._rolling_summary = "..." + self._rolling_summary[-497:]

    def record_store_event(self, fact: str):
        with self._summary_lock:
            self._recent_store_events.append({"fact": fact[:120], "ts": time.time()})
            self._recent_store_events = self._recent_store_events[-5:]

    def get_four_layer_snapshot(self) -> dict:
        memory = self._load_memory()

        now = time.time()
        session_age_sec = int(now - self._session_start)
        session_age_min = session_age_sec // 60
        local_time = datetime.now().strftime("%H:%M")
        local_date = datetime.now().strftime("%a, %d %b %Y")

        session_metadata = {
            "time": local_time,
            "date": local_date,
            "session_age_min": session_age_min,
            "session_age_sec": session_age_sec,
        }

        profile = memory.get("profile", [])
        user_name = memory.get("user_name", "")
        assistant_name = memory.get("assistant_name", "Antigravity")

        with self._summary_lock:
            fresh_events = [e for e in self._recent_store_events if now - e["ts"] < 10.0]
            self._recent_store_events = fresh_events

        user_memory = {
            "user_name": user_name,
            "assistant_name": assistant_name,
            "facts": profile,
            "fact_count": len(profile),
            "is_extracting": self.is_extracting,
            "recent_store_events": fresh_events,
        }

        with self._summary_lock:
            summary_text = self._rolling_summary
            active_topics = list(self._active_topics)

        recent_summary = {
            "text": summary_text or "No conversation yet.",
            "active_topics": active_topics[:5],
        }

        with self._summary_lock:
            msg_count = self._session_message_count
            token_count = self._session_token_count

        current_session = {
            "message_count": msg_count,
            "token_count": token_count,
            "session_age_min": session_age_min,
        }

        return {
            "session_metadata": session_metadata,
            "user_memory": user_memory,
            "recent_summary": recent_summary,
            "current_session": current_session,
        }

memory_system: Optional[MemorySystem] = None

def init_memory(base_dir: Path, models_dir: Path) -> MemorySystem:
    global memory_system
    if memory_system is None:
        memory_system = MemorySystem(base_dir, models_dir)
    return memory_system
