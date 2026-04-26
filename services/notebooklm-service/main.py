import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel


DEFAULT_NOTEBOOKLM_SRC = Path("/Users/cruzr/tools/notebooklm/notebooklm-py/src")


def ensure_notebooklm_import() -> None:
    configured_src = os.environ.get("NOTEBOOKLM_PY_SRC", "").strip()

    candidate_paths = [
        Path(configured_src) if configured_src else None,
        DEFAULT_NOTEBOOKLM_SRC,
    ]

    for candidate in candidate_paths:
        if candidate and candidate.exists():
            candidate_str = str(candidate)
            if candidate_str not in sys.path:
                sys.path.insert(0, candidate_str)


ensure_notebooklm_import()

from notebooklm import NotebookLMClient


SERVICE_TOKEN = os.environ.get("NOTEBOOKLM_SERVICE_TOKEN", "").strip() or (
    "" if os.environ.get("ENVIRONMENT") == "production" else "dev-notebooklm-token"
)


class ProvisionRequest(BaseModel):
    memberId: str
    title: str
    templateKey: str


class UrlSourceRequest(BaseModel):
    url: str


class TextSourceRequest(BaseModel):
    title: str
    content: str


def require_auth(authorization: str = Header(default="")) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="NOTEBOOKLM_SERVICE_TOKEN is not configured.",
        )

    expected = f"Bearer {SERVICE_TOKEN}"
    if authorization.strip() != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )


@asynccontextmanager
async def notebook_client():
    client = await NotebookLMClient.from_storage()
    async with client as connected_client:
        yield connected_client


async def serialize_notebook_state(client: NotebookLMClient, notebook_id: str) -> dict[str, Any]:
    notebook = await client.notebooks.get(notebook_id)
    description = await client.notebooks.get_description(notebook_id)
    sources = await client.sources.list(notebook_id)

    return {
        "id": notebook.id,
        "title": getattr(notebook, "title", None),
        "status": "ready",
        "summary": getattr(description, "summary", None),
        "sourceCount": len(sources),
    }


app = FastAPI(title="Platform NotebookLM Service")


@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/notebooks/provision", dependencies=[Depends(require_auth)])
async def provision_notebook(payload: ProvisionRequest) -> dict[str, Any]:
    async with notebook_client() as client:
        notebook = await client.notebooks.create(payload.title)
        return await serialize_notebook_state(client, notebook.id)


@app.get("/internal/notebooks/{notebook_id}", dependencies=[Depends(require_auth)])
async def get_notebook(notebook_id: str) -> dict[str, Any]:
    async with notebook_client() as client:
        return await serialize_notebook_state(client, notebook_id)


@app.post(
    "/internal/notebooks/{notebook_id}/sources/url",
    dependencies=[Depends(require_auth)],
)
async def add_url_source(notebook_id: str, payload: UrlSourceRequest) -> dict[str, Any]:
    async with notebook_client() as client:
        source = await client.sources.add_url(notebook_id, payload.url)
        return {
            "id": source.id,
            "title": getattr(source, "title", None),
            "type": str(getattr(source, "kind", "url")),
            "url": getattr(source, "url", payload.url),
        }


@app.post(
    "/internal/notebooks/{notebook_id}/sources/text",
    dependencies=[Depends(require_auth)],
)
async def add_text_source(
    notebook_id: str, payload: TextSourceRequest
) -> dict[str, Any]:
    async with notebook_client() as client:
        source = await client.sources.add_text(
            notebook_id, payload.title, payload.content
        )
        return {
            "id": source.id,
            "title": getattr(source, "title", payload.title),
            "type": str(getattr(source, "kind", "text")),
            "url": getattr(source, "url", None),
        }
