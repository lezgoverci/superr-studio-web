"""Code generation from workflow definitions."""
import json
from typing import Any, Dict


def generate_code(workflow: Dict[str, Any]) -> str:
    """Generate TypeScript code from workflow definition."""
    nodes = workflow.get("nodes", [])
    edges = workflow.get("edges", [])
    name = workflow.get("name", "Workflow")

    code = f"""// Auto-generated from workflow: {name}
// DO NOT EDIT MANUALLY

import {{ WorkflowRunner }} from "@superr/superr";

interface NodeConfig {{
  [key: string]: unknown;
}}

interface WorkflowNode {{
  id: string;
  type: string;
  label: string;
  config: NodeConfig;
}}

interface WorkflowEdge {{
  id: string;
  source: string;
  target: string;
  label?: string;
}}

const workflowName = "{name}";
const workflowDescription = "{workflow.get('description', '')}";

const nodes: WorkflowNode[] = {json.dumps(nodes, indent=2)};

const edges: WorkflowEdge[] = {json.dumps(edges, indent=2)};

async function executeWorkflow(input: Record<string, unknown> = {{}}) {{
  const runner = new WorkflowRunner({{ name: workflowName }});
  
  // Build execution graph from edges
  const graph = new Map<string, string[]>();
  for (const edge of edges) {{
    const targets = graph.get(edge.source) || [];
    targets.push(edge.target);
    graph.set(edge.source, targets);
  }}
  
  // Execute nodes in topological order (simplified)
  const executed = new Set<string>();
  
  async function executeNode(nodeId: string): Promise<unknown> {{
    if (executed.has(nodeId)) return undefined;
    executed.add(nodeId);
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {{
      throw new Error(`Node not found: ${{nodeId}}`);
    }}
    
    console.log(`Executing node: ${{node.label}}`);
    
    const nodeEdges = edges.filter(e => e.source === nodeId);
    const results: Record<string, unknown> = {{}};
    
    for (const edge of nodeEdges) {{
      const childResult = await executeNode(edge.target);
      results[edge.target] = childResult;
    }}
    
    return results;
  }}
  
  // Find trigger nodes (nodes with no incoming edges)
  const targets = new Set(edges.map(e => e.target));
  const triggers = nodes.filter(n => !targets.has(n.id));
  
  // Execute all triggers
  let output: Record<string, unknown> = {{}};
  for (const trigger of triggers) {{
    const result = await executeNode(trigger.id);
    output[trigger.id] = result;
  }}
  
  return output;
}}

// Export for use
export {{ executeWorkflow, workflowName, nodes, edges }};

// Run if executed directly
if (require.main === module) {{
  executeWorkflow().then(console.log).catch(console.error);
}}
"""

    return code


def generate_node_handler(node: Dict[str, Any]) -> str:
    """Generate handler code for a single node."""
    node_type = node.get("data", {}).get("type", "action")
    node_id = node.get("id", "unknown")
    label = node.get("data", {}).get("label", "Node")
    config = node.get("data", {}).get("config", {})

    return f"""// Handler for node: {label} ({node_id})
async function handle{node_id.replace('-', '_').title()}(input: Record<string, unknown>): Promise<unknown> {{
  // Node type: {node_type}
  // Config: {json.dumps(config, indent=4)}
  
  // TODO: Implement node handler
  console.log('Handling node: {label}');
  
  return {{ success: true, nodeId: '{node_id}' }};
}}
"""


def generate_step_imports(nodes: list) -> list:
    """Generate import statements for step functions."""
    imports = []
    seen = set()

    for node in nodes:
        action_type = node.get("data", {}).get("config", {}).get("actionType", "")
        if action_type and action_type not in seen:
            seen.add(action_type)
            step_name = action_type.replace("/", "_").replace("-", "_")
            imports.append(
                f"import {{ {step_name} }} from '@/steps/{step_name}';"
            )

    return imports
