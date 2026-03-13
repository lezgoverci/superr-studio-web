# Superr CLI

A command-line interface for Superr Workflow Builder. Create, edit, validate, and generate code from workflow definitions.

## Installation

```bash
pip install -e .
```

## Usage

### Quick Start

```bash
# Enter interactive REPL mode (default)
superr

# List workflows in current directory
superr workflows list

# Create a new workflow
superr workflows create "My Workflow"

# Validate a workflow file
superr workflows validate workflow.json

# Generate code from workflow
superr codegen workflow.json

# Run a workflow
superr run workflow.json
```

### Commands

#### Workflow Management

- `workflows list` - List workflow files in current directory
- `workflows create <name>` - Create a new workflow from template
- `workflows show <file>` - Display workflow JSON in formatted output
- `workflows validate <file>` - Validate workflow against schema
- `workflows new` - Create workflow interactively

#### Node Operations

- `nodes add <workflow> <node-type> <node-id>` - Add a node to workflow
- `nodes remove <workflow> <node-id>` - Remove a node from workflow
- `nodes list <workflow>` - List all nodes in workflow

#### Edge Operations

- `edges add <workflow> <source> <target>` - Add edge between nodes
- `edges remove <workflow> <edge-id>` - Remove edge from workflow
- `edges list <workflow>` - List all edges in workflow

#### Execution

- `codegen <file>` - Generate TypeScript code from workflow
- `run <file>` - Execute workflow (generates and runs code)

#### REPL Mode

Run `superr` without subcommands to enter interactive REPL:

```
superr> help
superr> load workflow.json
superr> add node trigger webhook
suprem> add edge webhook-1 http-request-1
superr> validate
superr> generate
superr> quit
```

### JSON Output

All commands support `--json` flag for machine-readable output:

```bash
superr workflows list --json
superr workflows validate workflow.json --json
```

### Configuration

Create `superr.json` in your project root:

```json
{
  "workflowsDir": "./workflows",
  "outputDir": "./generated"
}
```

## Workflow File Format

Superr workflows use ReactFlow-compatible JSON:

```json
{
  "name": "My Workflow",
  "description": "A sample workflow",
  "nodes": [
    {
      "id": "webhook-1",
      "type": "trigger",
      "position": { "x": 0, "y": 0 },
      "data": {
        "label": "Webhook Trigger",
        "type": "trigger",
        "config": { "method": "POST", "path": "/webhook" }
      }
    }
  ],
  "edges": [
    {
      "id": "e1-2",
      "source": "webhook-1",
      "target": "http-request-1"
    }
  ]
}
```

## Available Node Types

- **Trigger**: Webhook, Schedule, Manual
- **Actions**: HTTP Request, Database Query, Condition
- **AI**: Generate Text, Generate Image
- **Integrations**: Send Email, Send Slack Message, Create Ticket, and more

See `lib/step-registry.ts` for full list of 39+ supported actions.

## Examples

### Create and Edit Workflow

```bash
# Create new workflow
superr workflows create "Email Processor"

# Add nodes
superr nodes add workflow.json trigger webhook
superr nodes add workflow.json action "Send Email"

# Add edge
superr edges add workflow.json webhook-1 send-email-1

# Validate
superr workflows validate workflow.json

# Generate code
superr codegen workflow.json -o generated/
```

### REPL Workflow

```bash
$ superr
superr> create "New Workflow"
superr> add node trigger webhook
superr> add node action "HTTP Request"
superr> add edge trigger-1 http-1
superr> validate
superr> generate -o output/
superr> quit
```

## Development

```bash
# Install in development mode
pip install -e .

# Run tests
pytest cli_anything/superr/tests/

# Format code
black cli_anything/superr/
```
