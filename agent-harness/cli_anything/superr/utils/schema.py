"""Schema validation utilities."""
from typing import Any, Dict, List

try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False


WORKFLOW_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["nodes", "edges"],
    "properties": {
        "name": {
            "type": "string",
            "minLength": 1,
        },
        "description": {
            "type": "string",
        },
        "nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "data"],
                "properties": {
                    "id": {"type": "string"},
                    "type": {"type": "string"},
                    "position": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                        },
                    },
                    "data": {
                        "type": "object",
                        "required": ["label", "type"],
                        "properties": {
                            "label": {"type": "string"},
                            "description": {"type": "string"},
                            "type": {"type": "string", "enum": ["trigger", "action"]},
                            "config": {"type": "object"},
                            "enabled": {"type": "boolean"},
                        },
                    },
                },
            },
        },
        "edges": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "source", "target"],
                "properties": {
                    "id": {"type": "string"},
                    "source": {"type": "string"},
                    "target": {"type": "string"},
                    "type": {"type": "string"},
                    "label": {"type": "string"},
                },
            },
        },
    },
}


def validate_workflow_schema(workflow: Dict[str, Any]) -> Dict[str, Any]:
    """Validate workflow against schema."""
    errors: List[str] = []

    if not isinstance(workflow, dict):
        return {"valid": False, "errors": ["Workflow must be an object"]}

    if "nodes" not in workflow:
        errors.append("Missing required field: nodes")

    if "edges" not in workflow:
        errors.append("Missing required field: edges")

    if errors:
        return {"valid": False, "errors": errors}

    if HAS_JSONSCHEMA:
        try:
            jsonschema.validate(workflow, WORKFLOW_SCHEMA)
        except jsonschema.ValidationError as e:
            errors.append(str(e.message))
        except jsonschema.SchemaError as e:
            errors.append(f"Schema error: {e.message}")

    node_ids = {n.get("id") for n in workflow.get("nodes", []) if n.get("id")}

    for edge in workflow.get("edges", []):
        source = edge.get("source")
        target = edge.get("target")

        if source not in node_ids:
            errors.append(f"Edge '{edge.get('id')}' references unknown source node: {source}")

        if target not in node_ids:
            errors.append(f"Edge '{edge.get('id')}' references unknown target node: {target}")

    if errors:
        return {"valid": False, "errors": errors}

    return {"valid": True, "errors": []}


def validate_node(node: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a single node."""
    errors: List[str] = []

    if not isinstance(node, dict):
        return {"valid": False, "errors": ["Node must be an object"]}

    required = ["id", "data"]
    for field in required:
        if field not in node:
            errors.append(f"Missing required field: {field}")

    data = node.get("data", {})
    if not isinstance(data, dict):
        errors.append("Node data must be an object")
    elif "label" not in data:
        errors.append("Missing required field in node data: label")
    elif "type" not in data:
        errors.append("Missing required field in node data: type")

    if errors:
        return {"valid": False, "errors": errors}

    return {"valid": True, "errors": []}
