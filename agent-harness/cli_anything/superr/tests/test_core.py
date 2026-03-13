"""Unit tests for core workflow operations."""
import json
import os
import tempfile
import pytest

from cli_anything.superr.core.workflow import (
    create_workflow,
    load_workflow,
    save_workflow,
    list_workflows,
    validate_workflow,
    generate_id,
    get_next_node_position,
)
from cli_anything.superr.core.nodes import (
    add_node,
    remove_node,
    list_nodes,
    get_node,
    update_node,
)
from cli_anything.superr.core.edges import (
    add_edge,
    remove_edge,
    list_edges,
    get_edge,
    get_node_edges,
    get_outgoing_edges,
    get_incoming_edges,
)
from cli_anything.superr.core.codegen import generate_code, generate_node_handler
from cli_anything.superr.utils.schema import validate_workflow_schema, validate_node


class TestWorkflow:
    """Tests for workflow operations."""

    def test_create_workflow(self):
        wf = create_workflow("Test Workflow", "A test")
        assert wf["name"] == "Test Workflow"
        assert wf["description"] == "A test"
        assert wf["nodes"] == []
        assert wf["edges"] == []

    def test_create_workflow_defaults(self):
        wf = create_workflow("Test")
        assert wf["name"] == "Test"
        assert wf["description"] == ""

    def test_save_and_load_workflow(self):
        wf = create_workflow("Test", "Description")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            temp_path = f.name

        try:
            save_workflow(wf, temp_path)
            loaded = load_workflow(temp_path)
            assert loaded["name"] == "Test"
            assert loaded["description"] == "Description"
        finally:
            os.unlink(temp_path)

    def test_list_workflows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            wf1 = create_workflow("Workflow 1")
            wf2 = create_workflow("Workflow 2")
            save_workflow(wf1, os.path.join(tmpdir, "workflow-1.json"))
            save_workflow(wf2, os.path.join(tmpdir, "workflow-2.json"))

            workflows = list_workflows(tmpdir)
            assert len(workflows) == 2

    def test_generate_id(self):
        id1 = generate_id("node")
        id2 = generate_id("node")
        assert id1.startswith("node")
        assert id2.startswith("node")
        assert id1 != id2

    def test_get_next_node_position_empty(self):
        wf = create_workflow("Test")
        pos = get_next_node_position(wf)
        assert pos == {"x": 0, "y": 0}

    def test_get_next_node_position_with_nodes(self):
        wf = create_workflow("Test")
        wf["nodes"] = [
            {"id": "n1", "position": {"x": 0, "y": 0}},
            {"id": "n2", "position": {"x": 10, "y": 100}},
        ]
        pos = get_next_node_position(wf)
        assert pos["y"] == 250


class TestNodes:
    """Tests for node operations."""

    def test_add_node_trigger(self):
        wf = create_workflow("Test")
        result = add_node(wf, "webhook", "webhook-1", "Webhook Trigger")
        assert len(result["nodes"]) == 1
        node = result["nodes"][0]
        assert node["id"] == "webhook-1"
        assert node["data"]["type"] == "trigger"
        assert node["data"]["label"] == "Webhook Trigger"

    def test_add_node_action(self):
        wf = create_workflow("Test")
        result = add_node(wf, "http-request", "http-1")
        assert len(result["nodes"]) == 1
        assert result["nodes"][0]["data"]["type"] == "action"

    def test_add_node_generates_id(self):
        wf = create_workflow("Test")
        result = add_node(wf, "http")
        assert result["nodes"][0]["id"].startswith("http")

    def test_remove_node(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "webhook-1")
        add_node(wf, "http", "http-1")
        result = remove_node(wf, "webhook-1")
        assert len(result["nodes"]) == 1
        assert result["nodes"][0]["id"] == "http-1"

    def test_remove_node_removes_connected_edges(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        add_edge(wf, "n1", "n2")
        result = remove_node(wf, "n1")
        assert len(result["edges"]) == 0
        assert len(result["nodes"]) == 1

    def test_list_nodes(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        nodes = list_nodes(wf)
        assert len(nodes) == 2

    def test_get_node(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        node = get_node(wf, "n1")
        assert node is not None
        assert node["id"] == "n1"

    def test_get_node_not_found(self):
        wf = create_workflow("Test")
        node = get_node(wf, "nonexistent")
        assert node is None


class TestEdges:
    """Tests for edge operations."""

    def test_add_edge(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        result = add_edge(wf, "n1", "n2")
        assert len(result["edges"]) == 1
        edge = result["edges"][0]
        assert edge["source"] == "n1"
        assert edge["target"] == "n2"

    def test_add_edge_with_label(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        result = add_edge(wf, "n1", "n2", "On success")
        assert result["edges"][0]["label"] == "On success"

    def test_remove_edge(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        add_edge(wf, "n1", "n2")
        result = remove_edge(wf, wf["edges"][0]["id"])
        assert len(result["edges"]) == 0

    def test_list_edges(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        add_node(wf, "email", "n3")
        add_edge(wf, "n1", "n2")
        add_edge(wf, "n2", "n3")
        edges = list_edges(wf)
        assert len(edges) == 2

    def test_get_node_edges(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        add_node(wf, "email", "n3")
        add_edge(wf, "n1", "n2")
        add_edge(wf, "n1", "n3")
        edges = get_node_edges(wf, "n1")
        assert len(edges) == 2

    def test_get_outgoing_edges(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        add_node(wf, "email", "n3")
        add_edge(wf, "n1", "n2")
        add_edge(wf, "n1", "n3")
        edges = get_outgoing_edges(wf, "n1")
        assert len(edges) == 2

    def test_get_incoming_edges(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        add_node(wf, "email", "n3")
        add_edge(wf, "n1", "n3")
        add_edge(wf, "n2", "n3")
        edges = get_incoming_edges(wf, "n3")
        assert len(edges) == 2


class TestSchema:
    """Tests for schema validation."""

    def test_validate_valid_workflow(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        add_node(wf, "http", "n2")
        add_edge(wf, "n1", "n2")
        result = validate_workflow_schema(wf)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_validate_missing_nodes(self):
        wf = {"edges": []}
        result = validate_workflow_schema(wf)
        assert result["valid"] is False

    def test_validate_missing_edges(self):
        wf = {"nodes": []}
        result = validate_workflow_schema(wf)
        assert result["valid"] is False

    def test_validate_invalid_edge_reference(self):
        wf = create_workflow("Test")
        add_node(wf, "webhook", "n1")
        wf["edges"].append({"id": "e1", "source": "n1", "target": "nonexistent"})
        result = validate_workflow_schema(wf)
        assert result["valid"] is False
        assert any("nonexistent" in e for e in result["errors"])

    def test_validate_node(self):
        node = {
            "id": "n1",
            "data": {"label": "Test", "type": "trigger"},
        }
        result = validate_node(node)
        assert result["valid"] is True

    def test_validate_node_missing_id(self):
        node = {"data": {"label": "Test", "type": "trigger"}}
        result = validate_node(node)
        assert result["valid"] is False


class TestCodegen:
    """Tests for code generation."""

    def test_generate_code(self):
        wf = create_workflow("Test Workflow", "A test workflow")
        add_node(wf, "webhook", "trigger-1", "Webhook")
        add_node(wf, "http-request", "http-1", "HTTP Request")
        add_edge(wf, "trigger-1", "http-1")

        code = generate_code(wf)
        assert "Test Workflow" in code
        assert "executeWorkflow" in code
        assert "trigger-1" in code

    def test_generate_code_empty_workflow(self):
        wf = create_workflow("Empty")
        code = generate_code(wf)
        assert "executeWorkflow" in code

    def test_generate_node_handler(self):
        node = {
            "id": "n1",
            "data": {"label": "HTTP Request", "type": "action", "config": {}},
        }
        code = generate_node_handler(node)
        assert "handleN1" in code
        assert "HTTP Request" in code
