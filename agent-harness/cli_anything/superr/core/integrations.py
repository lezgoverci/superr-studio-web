"""Integration management for offline mode."""
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional


INTEGRATIONS_FILE = ".superr-integrations.json"


def get_integrations_file(directory: str = ".") -> str:
    """Get path to integrations file."""
    return os.path.join(directory, INTEGRATIONS_FILE)


def load_integrations(directory: str = ".") -> Dict[str, Any]:
    """Load integrations from file."""
    filepath = get_integrations_file(directory)
    if not os.path.exists(filepath):
        return {}
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_integrations(integrations: Dict[str, Any], directory: str = ".") -> None:
    """Save integrations to file."""
    filepath = get_integrations_file(directory)
    with open(filepath, "w") as f:
        json.dump(integrations, f, indent=2)


def add_integration(
    name: str,
    integration_type: str,
    config: Dict[str, str],
    directory: str = ".",
) -> Dict[str, Any]:
    """Add an integration."""
    import uuid
    integration_id = f"int_{uuid.uuid4().hex[:8]}"
    
    integrations = load_integrations(directory)
    integrations[integration_id] = {
        "id": integration_id,
        "name": name,
        "type": integration_type,
        "config": config,
    }
    save_integrations(integrations, directory)
    
    return integrations[integration_id]


def list_integrations(directory: str = ".") -> List[Dict[str, Any]]:
    """List all integrations."""
    integrations = load_integrations(directory)
    return list(integrations.values())


def get_integration(integration_id: str, directory: str = ".") -> Optional[Dict[str, Any]]:
    """Get an integration by ID."""
    integrations = load_integrations(directory)
    return integrations.get(integration_id)


def remove_integration(integration_id: str, directory: str = ".") -> bool:
    """Remove an integration."""
    integrations = load_integrations(directory)
    if integration_id in integrations:
        del integrations[integration_id]
        save_integrations(integrations, directory)
        return True
    return False


INTEGRATION_TYPES = [
    "resend",
    "slack",
    "linear",
    "github",
    "stripe",
    "clerk",
    "firecrawl",
    "ai-gateway",
    "perplexity",
    "blob",
    "webflow",
    "fal",
    "v0",
    "bash",
    "code",
    "vercel",
    "database",
]
