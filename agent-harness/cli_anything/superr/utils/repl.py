"""REPL (Read-Eval-Print Loop) for interactive workflow editing."""
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from cli_anything.superr.core import workflow, nodes, edges, codegen
from cli_anything.superr.utils.schema import validate_workflow_schema


class ReplState:
    """State for REPL session."""

    def __init__(self, directory: str = "."):
        self.directory = directory
        self.current_workflow: Optional[Dict[str, Any]] = None
        self.current_file: Optional[str] = None

    def help(self) -> str:
        """Return help text."""
        return """
Superr REPL Commands:
  help                     Show this help message
  load <file>              Load workflow from file
  save [file]              Save current workflow to file
  create <name>            Create new workflow
  show                     Display current workflow
  validate                 Validate current workflow
  add node <type> [id]     Add node to workflow
  remove node <id>         Remove node from workflow
  add edge <source> <target> [label]  Add edge between nodes
  remove edge <id>         Remove edge from workflow
  list nodes               List all nodes
  list edges               List all edges
  generate                 Generate TypeScript code
  quit/exit                Exit REPL
"""


def run_repl(directory: str = "."):
    """Run the interactive REPL."""
    state = ReplState(directory)

    print("Superr CLI v0.1.0 - Interactive REPL")
    print("Type 'help' for available commands.")
    print()

    while True:
        try:
            prompt = "superr"
            if state.current_workflow:
                name = state.current_workflow.get("name", "Untitled")
                prompt = f"superr:{name[:15]}"

            user_input = input(f"{prompt}> ").strip()

            if not user_input:
                continue

            result = process_input(user_input, state)
            if result:
                print(result)

        except KeyboardInterrupt:
            print("\nUse 'quit' to exit.")
        except EOFError:
            print("\nGoodbye!")
            break


def process_input(user_input: str, state: ReplState) -> Optional[str]:
    """Process user input and return output."""
    parts = user_input.split()
    command = parts[0].lower()
    args = parts[1:]

    if command in ("quit", "exit"):
        print("Goodbye!")
        sys.exit(0)

    if command == "help":
        return state.help()

    if command == "load":
        if not args:
            return "Usage: load <file>"
        filepath = os.path.join(state.directory, args[0])
        if not os.path.exists(filepath):
            return f"File not found: {args[0]}"
        state.current_workflow = workflow.load_workflow(filepath)
        state.current_file = args[0]
        return f"Loaded: {args[0]}"

    if command == "save":
        if not state.current_workflow:
            return "No workflow loaded. Use 'load' or 'create' first."
        filename = args[0] if args else state.current_file
        if not filename:
            return "Usage: save [filename]"
        filepath = os.path.join(state.directory, filename)
        workflow.save_workflow(state.current_workflow, filepath)
        state.current_file = filename
        return f"Saved: {filename}"

    if command == "create":
        if not args:
            return "Usage: create <name>"
        name = " ".join(args)
        state.current_workflow = workflow.create_workflow(name)
        state.current_file = None
        return f"Created workflow: {name}"

    if command == "show":
        if not state.current_workflow:
            return "No workflow loaded. Use 'load' or 'create' first."
        return json.dumps(state.current_workflow, indent=2)

    if command == "validate":
        if not state.current_workflow:
            return "No workflow loaded. Use 'load' or 'create' first."
        errors = validate_workflow_schema(state.current_workflow)
        if errors.get("valid"):
            return "✓ Workflow is valid"
        return "✗ Validation errors:\n" + "\n".join(f"  - {e}" for e in errors.get("errors", []))

    if command == "list":
        if not state.current_workflow:
            return "No workflow loaded. Use 'load' or 'create' first."
        if not args or args[0] == "nodes":
            node_list = nodes.list_nodes(state.current_workflow)
            if not node_list:
                return "No nodes in workflow"
            output = ["Nodes:"]
            for n in node_list:
                output.append(f"  {n.get('id')}: {n.get('data', {}).get('label', 'Unnamed')}")
            return "\n".join(output)
        elif args[0] == "edges":
            edge_list = edges.list_edges(state.current_workflow)
            if not edge_list:
                return "No edges in workflow"
            output = ["Edges:"]
            for e in edge_list:
                label = f" ({e.get('label', '')})" if e.get("label") else ""
                output.append(f"  {e.get('id')}: {e.get('source')} -> {e.get('target')}{label}")
            return "\n".join(output)

    if command == "add":
        if not state.current_workflow:
            return "No workflow loaded. Use 'load' or 'create' first."
        if not args:
            return "Usage: add node <type> [id]"

        if args[0] == "node":
            node_type = args[1] if len(args) > 1 else "action"
            node_id = args[2] if len(args) > 2 else None
            state.current_workflow = nodes.add_node(state.current_workflow, node_type, node_id)
            return f"Added node"

        if args[0] == "edge":
            if len(args) < 3:
                return "Usage: add edge <source> <target> [label]"
            source = args[1]
            target = args[2]
            label = args[3] if len(args) > 3 else None
            state.current_workflow = edges.add_edge(state.current_workflow, source, target, label)
            return f"Added edge: {source} -> {target}"

    if command == "remove":
        if not state.current_workflow:
            return "No workflow loaded. Use 'load' or 'create' first."
        if not args:
            return "Usage: remove node <id> OR remove edge <id>"

        if args[0] == "node":
            if len(args) < 2:
                return "Usage: remove node <id>"
            state.current_workflow = nodes.remove_node(state.current_workflow, args[1])
            return f"Removed node: {args[1]}"

        if args[0] == "edge":
            if len(args) < 2:
                return "Usage: remove edge <id>"
            state.current_workflow = edges.remove_edge(state.current_workflow, args[1])
            return f"Removed edge: {args[1]}"

    if command == "generate":
        if not state.current_workflow:
            return "No workflow loaded. Use 'load' or 'create' first."
        code = codegen.generate_code(state.current_workflow)
        return code

    return f"Unknown command: {command}. Type 'help' for available commands."
