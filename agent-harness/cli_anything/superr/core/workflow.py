"""Core workflow operations."""
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_NODE_POSITION = {"x": 0, "y": 0}


def create_workflow(name: str, description: str = "") -> Dict[str, Any]:
    """Create a new workflow with default structure."""
    return {
        "name": name,
        "description": description,
        "nodes": [],
        "edges": [],
    }


def load_workflow(filepath: str) -> Dict[str, Any]:
    """Load workflow from JSON file."""
    with open(filepath, "r") as f:
        return json.load(f)


def save_workflow(workflow: Dict[str, Any], filepath: str) -> None:
    """Save workflow to JSON file."""
    with open(filepath, "w") as f:
        json.dump(workflow, f, indent=2)


def list_workflows(directory: str = ".") -> List[Dict[str, Any]]:
    """List all workflow files in directory."""
    workflows = []
    path = Path(directory)

    for file in path.glob("*.json"):
        try:
            with open(file, "r") as f:
                wf = json.load(f)
                if "nodes" in wf or "edges" in wf:
                    wf["file"] = file.name
                    workflows.append(wf)
        except (json.JSONDecodeError, IOError):
            continue

    return workflows


def validate_workflow(filepath: str) -> Dict[str, Any]:
    """Validate workflow against schema."""
    from cli_anything.superr.utils.schema import validate_workflow_schema

    try:
        workflow = load_workflow(filepath)
    except json.JSONDecodeError as e:
        return {"valid": False, "errors": [f"Invalid JSON: {str(e)}"]}
    except IOError as e:
        return {"valid": False, "errors": [f"IO Error: {str(e)}"]}

    return validate_workflow_schema(workflow)


def generate_id(prefix: str = "") -> str:
    """Generate a unique ID."""
    uid = uuid.uuid4().hex[:8]
    return f"{prefix}{uid}" if prefix else uid


def get_next_node_position(workflow: Dict[str, Any]) -> Dict[str, int]:
    """Calculate next node position based on existing nodes."""
    nodes = workflow.get("nodes", [])
    if not nodes:
        return DEFAULT_NODE_POSITION.copy()

    max_y = max((n.get("position", {}).get("y", 0) for n in nodes), default=0)
    return {"x": 0, "y": max_y + 150}
