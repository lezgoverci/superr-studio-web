"""Node operations."""
import uuid
from typing import Any, Dict, List, Optional

from cli_anything.superr.core.workflow import generate_id, get_next_node_position


TRIGGER_TYPES = {
    "webhook": {"label": "Webhook Trigger", "type": "trigger", "actionType": "Webhook"},
    "schedule": {"label": "Schedule Trigger", "type": "trigger", "actionType": "Schedule"},
    "manual": {"label": "Manual Trigger", "type": "trigger", "actionType": "Manual"},
    "http": {"label": "HTTP Trigger", "type": "trigger", "actionType": "HTTP"},
}

ACTION_TYPES = {
    "http": {"label": "HTTP Request", "type": "action", "actionType": "HTTP Request"},
    "http-request": {"label": "HTTP Request", "type": "action", "actionType": "HTTP Request"},
    "database": {"label": "Database Query", "type": "action", "actionType": "Database Query"},
    "database-query": {"label": "Database Query", "type": "action", "actionType": "Database Query"},
    "condition": {"label": "Condition", "type": "condition", "actionType": "Condition"},
    "email": {"label": "Send Email", "type": "action", "actionType": "Send Email", "integration": "resend"},
    "send-email": {"label": "Send Email", "type": "action", "actionType": "Send Email", "integration": "resend"},
    "slack": {"label": "Send Slack Message", "type": "action", "actionType": "Send Slack Message", "integration": "slack"},
    "send-slack": {"label": "Send Slack Message", "type": "action", "actionType": "Send Slack Message", "integration": "slack"},
    "ticket": {"label": "Create Ticket", "type": "action", "actionType": "Create Ticket", "integration": "linear"},
    "create-ticket": {"label": "Create Ticket", "type": "action", "actionType": "Create Ticket", "integration": "linear"},
    "find-issues": {"label": "Find Issues", "type": "action", "actionType": "Find Issues", "integration": "linear"},
    "generate-text": {"label": "Generate Text", "type": "action", "actionType": "Generate Text", "integration": "ai-gateway"},
    "generate-image": {"label": "Generate Image", "type": "action", "actionType": "Generate Image", "integration": "ai-gateway"},
    "scrape": {"label": "Scrape URL", "type": "action", "actionType": "Scrape", "integration": "firecrawl"},
    "search": {"label": "Search Web", "type": "action", "actionType": "Search", "integration": "firecrawl"},
    "code": {"label": "Run Custom Code", "type": "action", "actionType": "code/execute", "integration": "code"},
    "execute": {"label": "Run Custom Code", "type": "action", "actionType": "code/execute", "integration": "code"},
    "bash": {"label": "Run Command", "type": "action", "actionType": "bash/run-command", "integration": "bash"},
    "create-issue": {"label": "Create Issue", "type": "action", "actionType": "github/create-issue", "integration": "github"},
    "list-issues": {"label": "List Issues", "type": "action", "actionType": "github/list-issues", "integration": "github"},
    "create-customer": {"label": "Create Customer", "type": "action", "actionType": "stripe/create-customer", "integration": "stripe"},
    "create-invoice": {"label": "Create Invoice", "type": "action", "actionType": "stripe/create-invoice", "integration": "stripe"},
    "get-user": {"label": "Get User", "type": "action", "actionType": "clerk/get-user", "integration": "clerk"},
    "create-user": {"label": "Create User", "type": "action", "actionType": "clerk/create-user", "integration": "clerk"},
    "run-agent": {"label": "Run Agent", "type": "action", "actionType": "ai-agent/run-agent", "integration": "ai-agent"},
}

ALL_NODE_TYPES = {**TRIGGER_TYPES, **ACTION_TYPES}


def add_node(
    workflow: Dict[str, Any],
    node_type: str,
    node_id: Optional[str] = None,
    label: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    description: Optional[str] = None,
) -> Dict[str, Any]:
    """Add a node to workflow."""
    node_type_lower = node_type.lower().replace(" ", "-")

    if node_type_lower in TRIGGER_TYPES:
        type_info = TRIGGER_TYPES[node_type_lower]
    elif node_type_lower in ACTION_TYPES:
        type_info = ACTION_TYPES[node_type_lower]
    else:
        type_info = {"label": label or node_type, "type": "action", "actionType": node_type}

    if not node_id:
        prefix = node_type_lower.split("-")[0][:4]
        node_id = generate_id(prefix)

    if not label:
        label = type_info.get("label", node_type)

    position = get_next_node_position(workflow)

    node_config = config or {}
    if "actionType" not in node_config and "triggerType" not in node_config:
        if type_info.get("type") == "trigger":
            node_config["triggerType"] = type_info.get("actionType", type_info.get("label"))
        else:
            node_config["actionType"] = type_info.get("actionType", type_info.get("label"))

    new_node = {
        "id": node_id,
        "type": type_info.get("type", "action"),
        "position": position,
        "data": {
            "label": label,
            "description": description or f"{label} node",
            "type": type_info.get("type", "action"),
            "config": node_config,
            "status": "idle",
            "enabled": True,
        },
    }

    workflow["nodes"] = workflow.get("nodes", [])
    workflow["nodes"].append(new_node)

    return workflow


def remove_node(workflow: Dict[str, Any], node_id: str) -> Dict[str, Any]:
    """Remove a node from workflow."""
    nodes = workflow.get("nodes", [])
    workflow["nodes"] = [n for n in nodes if n.get("id") != node_id]

    edges = workflow.get("edges", [])
    workflow["edges"] = [
        e for e in edges if e.get("source") != node_id and e.get("target") != node_id
    ]

    return workflow


def list_nodes(workflow: Dict[str, Any]) -> List[Dict[str, Any]]:
    """List all nodes in workflow."""
    return workflow.get("nodes", [])


def get_node(workflow: Dict[str, Any], node_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific node by ID."""
    for node in workflow.get("nodes", []):
        if node.get("id") == node_id:
            return node
    return None


def update_node(
    workflow: Dict[str, Any], node_id: str, updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update a node's data."""
    nodes = workflow.get("nodes", [])
    for node in nodes:
        if node.get("id") == node_id:
            node.update(updates)
            break
    return workflow
