import json
import os
import sys
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.table import Table

from cli_anything.superr.core.workflow import (
    create_workflow,
    list_workflows,
    load_workflow,
    save_workflow,
    validate_workflow,
)
from cli_anything.superr.core.nodes import add_node, list_nodes, remove_node
from cli_anything.superr.core.edges import add_edge, list_edges, remove_edge
from cli_anything.superr.core.codegen import generate_code
from cli_anything.superr.core.integrations import (
    add_integration,
    list_integrations,
    get_integration,
    remove_integration,
    INTEGRATION_TYPES,
)

console = Console()


@click.group()
@click.version_option(version="0.1.0")
def cli():
    """Superr CLI - Workflow automation from the command line."""
    pass


@cli.command("workflows-create")
@click.argument("name", required=False)
@click.option("--description", "-d", default="")
@click.option("--output", "-o", type=click.Path(), default=".")
def workflows_create(name: Optional[str], description: str, output: str):
    """Create a new workflow."""
    if not name:
        name = click.prompt("Workflow name", type=str)

    workflow = create_workflow(name, description or "")
    filename = f"{name.lower().replace(' ', '-')}.json"
    filepath = Path(output) / filename
    save_workflow(workflow, str(filepath))
    console.print(f"[green]Created workflow:[/green] {filepath}")


@cli.command("workflows-list")
@click.option("--directory", "-d", type=click.Path(exists=True), default=".")
def workflows_list(directory: str):
    """List workflow files in directory."""
    workflows = list_workflows(directory)

    if not workflows:
        console.print("[yellow]No workflows found[/yellow]")
        return

    table = Table(title="Workflows")
    table.add_column("Name")
    table.add_column("File")
    table.add_column("Nodes")
    table.add_column("Edges")

    for wf in workflows:
        table.add_row(
            wf.get("name", "Unnamed"),
            wf.get("file", ""),
            str(len(wf.get("nodes", []))),
            str(len(wf.get("edges", []))),
        )

    console.print(table)


@cli.command("workflows-show")
@click.argument("file", type=click.Path(exists=True))
@click.option("--json", "as_json", is_flag=True)
def workflows_show(file: str, as_json: bool):
    """Display workflow in formatted output."""
    workflow = load_workflow(file)

    if as_json:
        console.print_json(json.dumps(workflow, indent=2))
    else:
        console.print(f"[bold]{workflow.get('name', 'Unnamed')}[/bold]")
        console.print(f"Description: {workflow.get('description', 'N/A')}")
        console.print(f"Nodes: {len(workflow.get('nodes', []))}")
        console.print(f"Edges: {len(workflow.get('edges', []))}")


@cli.command("workflows-validate")
@click.argument("file", type=click.Path(exists=True))
@click.option("--json", "as_json", is_flag=True)
def workflows_validate(file: str, as_json: bool):
    """Validate workflow against schema."""
    result = validate_workflow(file)

    if result["valid"]:
        console.print("[green]✓ Workflow is valid[/green]")
    else:
        console.print("[red]✗ Workflow is invalid[/red]")
        for error in result.get("errors", []):
            console.print(f"  [red]{error}[/red]")

    if as_json:
        console.print_json(json.dumps(result))


@cli.group()
def nodes():
    """Node operations."""
    pass


@nodes.command(name="add")
@click.argument("workflow", type=click.Path(exists=True))
@click.argument("node_type")
@click.argument("node_id", required=False)
@click.option("--label", "-l", help="Node label")
@click.option("--description", "-d", help="Node description")
@click.option("--config", "-c", type=str, help="Node config as JSON string")
@click.option("--integration", "-i", help="Integration ID to use for this node")
def nodes_add(workflow: str, node_type: str, node_id: Optional[str], label: Optional[str], description: Optional[str], config: Optional[str], integration: Optional[str]):
    """Add a node to workflow.
    
    NODE_TYPE: Node type (e.g., webhook, send-email, http-request, slack, etc.)
    """
    wf = load_workflow(workflow)
    node_config = json.loads(config) if config else {}
    
    if integration:
        node_config["integrationId"] = integration
    
    result = add_node(wf, node_type, node_id, label, node_config, description)
    new_node = result["nodes"][-1]
    save_workflow(result, workflow)
    
    action_type = new_node.get("data", {}).get("config", {}).get("actionType", "unknown")
    console.print(f"[green]Added node:[/green] {new_node['id']} ({action_type})")


@nodes.command(name="list")
@click.argument("workflow", type=click.Path(exists=True))
def nodes_list(workflow: str):
    """List all nodes in workflow."""
    wf = load_workflow(workflow)
    node_list = list_nodes(wf)

    table = Table(title="Nodes")
    table.add_column("ID")
    table.add_column("Type")
    table.add_column("Action")
    table.add_column("Integration")

    for node in node_list:
        config = node.get("data", {}).get("config", {})
        action_type = config.get("actionType") or config.get("triggerType", "")
        integration = config.get("integrationId", "-")
        table.add_row(
            node.get("id", ""),
            node.get("type", ""),
            action_type,
            integration,
        )

    console.print(table)


@nodes.command(name="remove")
@click.argument("workflow", type=click.Path(exists=True))
@click.argument("node_id")
def nodes_remove(workflow: str, node_id: str):
    """Remove a node from workflow."""
    wf = load_workflow(workflow)
    result = remove_node(wf, node_id)
    save_workflow(result, workflow)
    console.print(f"[green]Removed node:[/green] {node_id}")


@cli.group()
def edges():
    """Edge operations."""
    pass


@edges.command(name="add")
@click.argument("workflow", type=click.Path(exists=True))
@click.argument("source")
@click.argument("target")
@click.option("--label", "-l", help="Edge label")
def edges_add(workflow: str, source: str, target: str, label: Optional[str]):
    """Add an edge between nodes."""
    wf = load_workflow(workflow)
    result = add_edge(wf, source, target, label)
    new_edge = result["edges"][-1]
    save_workflow(result, workflow)
    console.print(f"[green]Added edge:[/green] {new_edge['id']}")


@edges.command(name="list")
@click.argument("workflow", type=click.Path(exists=True))
def edges_list(workflow: str):
    """List all edges in workflow."""
    wf = load_workflow(workflow)
    edge_list = list_edges(wf)

    table = Table(title="Edges")
    table.add_column("ID")
    table.add_column("Source")
    table.add_column("Target")
    table.add_column("Label")

    for edge in edge_list:
        table.add_row(
            edge.get("id", ""),
            edge.get("source", ""),
            edge.get("target", ""),
            edge.get("label", ""),
        )

    console.print(table)


@edges.command(name="remove")
@click.argument("workflow", type=click.Path(exists=True))
@click.argument("edge_id")
def edges_remove(workflow: str, edge_id: str):
    """Remove an edge from workflow."""
    wf = load_workflow(workflow)
    result = remove_edge(wf, edge_id)
    save_workflow(result, workflow)
    console.print(f"[green]Removed edge:[/green] {edge_id}")


@cli.group()
def integrations():
    """Integration management (offline credentials)."""
    pass


@integrations.command(name="list")
@click.option("--directory", "-d", type=click.Path(exists=True), default=".")
def integrations_list(directory: str):
    """List all integrations."""
    ints = list_integrations(directory)

    if not ints:
        console.print("[yellow]No integrations found[/yellow]")
        console.print("[dim]Use 'superr integrations add' to add credentials[/dim]")
        return

    table = Table(title="Integrations")
    table.add_column("ID")
    table.add_column("Name")
    table.add_column("Type")

    for i in ints:
        table.add_row(i.get("id", ""), i.get("name", ""), i.get("type", ""))

    console.print(table)


@integrations.command(name="add")
@click.argument("name")
@click.argument("integration_type")
@click.option("--config", "-c", type=str, required=True, help="Integration config as JSON string")
@click.option("--directory", "-d", type=click.Path(), default=".")
def integrations_add(name: str, integration_type: str, config: str, directory: str):
    """Add an integration.
    
    NAME: A friendly name for this integration
    INTEGRATION_TYPE: Type (resend, slack, linear, github, stripe, etc.)
    """
    if integration_type not in INTEGRATION_TYPES:
        console.print(f"[yellow]Warning:[/yellow] Unknown integration type '{integration_type}'")
        console.print(f"[dim]Known types: {', '.join(INTEGRATION_TYPES)}[/dim]")
    
    try:
        config_dict = json.loads(config)
    except json.JSONDecodeError:
        console.print("[red]Error:[/red] Config must be valid JSON")
        return
    
    result = add_integration(name, integration_type, config_dict, directory)
    console.print(f"[green]Added integration:[/green] {result['id']} ({result['type']})")


@integrations.command(name="remove")
@click.argument("integration_id")
@click.option("--directory", "-d", type=click.Path(exists=True), default=".")
def integrations_remove(integration_id: str, directory: str):
    """Remove an integration."""
    if remove_integration(integration_id, directory):
        console.print(f"[green]Removed integration:[/green] {integration_id}")
    else:
        console.print(f"[red]Integration not found:[/red] {integration_id}")


@cli.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--output", "-o", type=click.Path(), help="Output directory")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def codegen(file: str, output: Optional[str], as_json: bool):
    """Generate TypeScript code from workflow."""
    workflow = load_workflow(file)
    result = generate_code(workflow)

    if as_json:
        console.print_json(json.dumps({"code": result}))
    elif output:
        output_path = Path(output) / "workflow.ts"
        output_path.write_text(result)
        console.print(f"[green]Generated code:[/green] {output_path}")
    else:
        console.print(result)


@cli.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def run(file: str, as_json: bool):
    """Execute a workflow (generates and runs code)."""
    console.print(f"[yellow]Running workflow:[/yellow] {file}")
    console.print("[yellow]Note: Full execution requires a backend server.[/yellow]")
    console.print("[yellow]Use 'superr codegen' to generate code only.[/yellow]")

    workflow = load_workflow(file)
    result = generate_code(workflow)

    if as_json:
        console.print_json(json.dumps({"generated_code": result}))


@cli.command()
@click.option("--directory", "-d", type=click.Path(exists=True), default=".")
def repl(directory: str):
    """Enter interactive REPL mode."""
    from cli_anything.superr.utils.repl import run_repl
    run_repl(directory)


def main():
    if len(sys.argv) == 1:
        from cli_anything.superr.utils.repl import run_repl
        run_repl(".")
    else:
        cli()


if __name__ == "__main__":
    main()
