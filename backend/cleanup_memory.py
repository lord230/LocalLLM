import json
from pathlib import Path
import re

memory_path = Path("f:/LLM/backend/memory.json")
if not memory_path.exists():
    print("Memory file not found")
    exit()

with open(memory_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

profile = data.get("profile", [])
old_count = len(profile)

junk_phrases = ["inquiring", "asking about", "wants to know", "seeking information", "has not shared", "unable to recall"]

def clean_fact(text):
    # Remove prompt artifacts
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace("[PROFILE]", "").replace("[VECTOR]", "").replace("|", "").strip()
    return text

cleaned_profile = []
seen = set()

for fact in profile:
    fact = clean_fact(fact)
    if not fact or len(fact) < 4:
        continue
    
    # Check for junk
    lower_fact = fact.lower()
    if any(junk in lower_fact for junk in junk_phrases):
        continue
        
    # Simple de-duplication
    if lower_fact in seen:
        continue
        
    cleaned_profile.append(fact)
    seen.add(lower_fact)

data["profile"] = cleaned_profile
new_count = len(cleaned_profile)

with open(memory_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)

print(f"Cleanup complete. Reduced profile from {old_count} to {new_count} entries.")
