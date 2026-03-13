"""Edge operations."""
from typing import Any, Dict, List, Optional

from cli_anything.superr.core.workflow import generate_id


def add_edge(
    workflow: Dict[str, Any],
    source: str,
    target: str,
    label: Optional[str] = None,
) -> Dict[str, Any]:
    """Add an edge between two nodes."""
    edge_id = generate_id("e")

    new_edge = {
        "id": edge_id,
        "source": source,
        "target": target,
    }

    if label:
        new_edge["label"] = label

    workflow["edges"] = workflow.get("edges", [])
    workflow["edges"].append(new_edge)

    return workflow


def remove_edge(workflow: Dict[str, Any], edge_id: str) -> Dict[str, Any]:
    """Remove an edge from workflow."""
    edges = workflow.get("edges", [])
    workflow["edges"] = [e for e in edges if e.get("id") != edge_id]
    return workflow


def list_edges(workflow: Dict[str, Any]) -> List[Dict[str, Any]]:
    """List all edges in workflow."""
    return workflow.get("edges", [])


def get_edge(workflow: Dict[str, Any], edge_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific edge by ID."""
    for edge in workflow.get("edges", []):
        if edge.get("id") == edge_id:
            return edge
    return None


def get_node_edges(workflow: Dict[str, Any], node_id: str) -> List[Dict[str, Any]]:
    """Get all edges connected to a node."""
    edges = workflow.get("edges", [])
    return [e for e in edges if e.get("source") == node_id or e.get("target") == node_id]


def get_outgoing_edges(workflow: Dict[str, Any], node_id: str) -> List[Dict[str, Any]]:
    """Get all edges starting from a node."""
    edges = workflow.get("edges", [])
    return [e for e in edges if e.get("source") == node_id]


def get_incoming_edges(workflow: Dict[str, Any], node_id: str) -> List[Dict[str, Any]]:
    """Get all edges ending at a node."""
    edges = workflow.get("edges", [])
    return [e for e in edges if e.get("target") == node_id]
