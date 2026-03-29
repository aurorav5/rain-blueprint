"""Backend dev server launcher — loads project root .env, sets backend as CWD."""
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
project_root = backend_dir.parent

# Load .env from project root before importing app
from dotenv import load_dotenv
load_dotenv(project_root / ".env", override=True)

os.chdir(str(backend_dir))
sys.path.insert(0, str(backend_dir))

import uvicorn
uvicorn.run(
    "app.main:app",
    host="0.0.0.0",
    port=8000,
)
