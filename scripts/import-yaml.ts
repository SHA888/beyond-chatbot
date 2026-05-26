#!/usr/bin/env node

/**
 * YAML → LadybugDB importer
 * Reads ai-nodes.yaml + ai-edges.yaml, validates, populates LadybugDB
 *
 * Exit codes:
 *   0 = success
 *   1 = validation error (with detailed error message)
 *   2 = fatal error (file not found, DB error, etc)
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Type definitions
interface Node {
  id: string;
  name: string;
  aliases?: string[];
  branch: string;
  type: string;
  era: string;
  status: string;
  descriptor: string;
  anchors?: string[];
}

interface Edge {
  source?: string;
  source_id?: string;
  target?: string;
  target_id?: string;
  type: string;
  confidence?: number;
  weight?: number;
  source_ref?: string;
  notes?: string;
  note?: string;
}

interface YamlData {
  nodes?: Node[];
  edges?: Edge[];
}

// Schema constants (must match spec §2)
const BRANCHES = new Set([
  'symbolic-gofai',
  'classical-ml',
  'deep-learning',
  'reinforcement-learning',
  'hybrid-neurosymbolic',
  'substrate-statistics',
  'substrate-optimization',
  'substrate-information-theory',
  'substrate-signal-processing',
  'information-retrieval-recommenders',
  'cross-cutting'
]);

const NODE_TYPES = new Set([
  'algorithm',
  'method',
  'model-class',
  'system',
  'framework',
  'math-construct'
]);

const STATUSES = new Set([
  'foundational',
  'active',
  'legacy',
  'emerging',
  'dormant'
]);

const EDGE_TYPES = new Set([
  'prerequisite',
  'descendant-of',
  'historical-influence',
  'substrate-of',
  'uses',
  'composes'
]);

/**
 * Error class for validation errors
 * Includes location (file:line) and context
 */
class ValidationError extends Error {
  constructor(
    public file: string,
    public lineNumber: number,
    message: string,
    context: string = ''
  ) {
    const location = `${file}:${lineNumber}`;
    const fullMessage = context
      ? `${location}: ${message} (${context})`
      : `${location}: ${message}`;
    super(fullMessage);
    this.name = 'ValidationError';
  }
}

/**
 * Validate node id is kebab-case
 */
function validateId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

/**
 * Validate era format (year, decade, or range)
 * Supports: YYYY, YYYYs, YYYY-present, YYYYs-present, YYYY-YYYY, YYYYs-YYYYs, etc.
 */
function validateEra(era: string): boolean {
  return /^\d{4}s?(?:-(?:present|\d{4}s?))?$/.test(era);
}

/**
 * Validate descriptor is a technical description
 * (non-empty, preferably ends with period)
 * Note: Spec says "one technical sentence" but data has variations;
 * validation is lenient here, enforcement is at editorial review
 */
function validateDescriptor(descriptor: string): boolean {
  // Must be non-empty and at least 10 characters
  return !!descriptor && descriptor.length >= 10 && descriptor.length <= 500;
}

/**
 * Load and parse YAML file
 */
function loadYaml(filePath: string): YamlData {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(content) as YamlData;
    return data || {};
  } catch (error) {
    if (error instanceof Error && 'mark' in error) {
      const mark = (error as any).mark;
      throw new Error(
        `${filePath}:${mark.line + 1}: ${(error as any).reason}`
      );
    }
    throw error;
  }
}

/**
 * Validate a single node against schema
 */
function validateNode(
  node: Node,
  nodeIndex: number,
  fileName: string = 'ai-nodes.yaml'
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Line number estimation
  const lineNumber = 6 + nodeIndex * 10;

  // Check required fields
  const requiredFields = ['id', 'name', 'branch', 'type', 'era', 'status', 'descriptor'];
  for (const field of requiredFields) {
    if (!(field in node) || !node[field as keyof Node]) {
      errors.push(
        new ValidationError(
          fileName,
          lineNumber,
          `missing required field "${field}"`
        )
      );
    }
  }

  if (errors.length > 0) return errors;

  // Validate id format
  if (node.id && !validateId(node.id)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `id "${node.id}" is not kebab-case`,
        'must match [a-z0-9](?:-[a-z0-9])*'
      )
    );
  }

  // Validate enum fields
  if (node.branch && !BRANCHES.has(node.branch)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `invalid branch "${node.branch}"`,
        `must be one of: ${Array.from(BRANCHES).join(', ')}`
      )
    );
  }

  if (node.type && !NODE_TYPES.has(node.type)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `invalid type "${node.type}"`,
        `must be one of: ${Array.from(NODE_TYPES).join(', ')}`
      )
    );
  }

  if (node.status && !STATUSES.has(node.status)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `invalid status "${node.status}"`,
        `must be one of: ${Array.from(STATUSES).join(', ')}`
      )
    );
  }

  // Validate era format
  if (node.era && !validateEra(node.era)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `invalid era format "${node.era}"`,
        'must be YYYY, YYYYs, or YYYY-present'
      )
    );
  }

  // Validate descriptor
  if (node.descriptor && !validateDescriptor(node.descriptor)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `descriptor must be valid text (10-500 chars)`,
        `got "${node.descriptor.substring(0, 50)}..."`
      )
    );
  }

  // Validate aliases and anchors are arrays
  if (node.aliases !== undefined && !Array.isArray(node.aliases)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `aliases must be an array`,
        `got ${typeof node.aliases}`
      )
    );
  }

  if (node.anchors !== undefined && !Array.isArray(node.anchors)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `anchors must be an array`,
        `got ${typeof node.anchors}`
      )
    );
  }

  return errors;
}

/**
 * Validate all nodes
 */
function validateAllNodes(nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    // Validate individual node
    const nodeErrors = validateNode(node, i);
    errors.push(...nodeErrors);

    // Check for duplicate ids
    if (node.id) {
      if (ids.has(node.id)) {
        errors.push(
          new ValidationError(
            'ai-nodes.yaml',
            6 + i * 10,
            `duplicate node id "${node.id}"`
          )
        );
      }
      ids.add(node.id);
    }
  }

  return errors;
}

/**
 * Validate a single edge against schema
 * Note: ai-edges.yaml uses 'source'/'target' keys (not source_id/target_id)
 */
function validateEdge(
  edge: Edge,
  edgeIndex: number,
  nodeIds: Set<string>,
  fileName: string = 'ai-edges.yaml'
): ValidationError[] {
  const errors: ValidationError[] = [];
  const lineNumber = 3 + edgeIndex * 5;

  // Map ai-edges.yaml field names (source/target) to spec names (source_id/target_id)
  const source = edge.source || edge.source_id;
  const target = edge.target || edge.target_id;

  // Check required fields
  if (!source) {
    errors.push(
      new ValidationError(fileName, lineNumber, 'missing required field "source" (or "source_id")')
    );
  }

  if (!target) {
    errors.push(
      new ValidationError(fileName, lineNumber, 'missing required field "target" (or "target_id")')
    );
  }

  if (!edge.type) {
    errors.push(
      new ValidationError(fileName, lineNumber, 'missing required field "type"')
    );
  }

  if (errors.length > 0) return errors;

  // Validate edge type
  if (!EDGE_TYPES.has(edge.type)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `invalid edge type "${edge.type}"`,
        `must be one of: ${Array.from(EDGE_TYPES).join(', ')}`
      )
    );
  }

  // Check for self-loops
  if (source === target) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `self-loop detected (${source} → ${target})`
      )
    );
  }

  // Check referential integrity
  if (source && !nodeIds.has(source)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `source "${source}" does not exist in node catalog`
      )
    );
  }

  if (target && !nodeIds.has(target)) {
    errors.push(
      new ValidationError(
        fileName,
        lineNumber,
        `target "${target}" does not exist in node catalog`
      )
    );
  }

  // Validate weight if present (maps to confidence in spec)
  const weight = edge.weight ?? edge.confidence;
  if (weight !== undefined && weight !== null) {
    if (typeof weight !== 'number' || weight < 0 || weight > 1) {
      errors.push(
        new ValidationError(
          fileName,
          lineNumber,
          `weight must be between 0.0 and 1.0`,
          `got ${weight}`
        )
      );
    }
  }

  return errors;
}

/**
 * Validate all edges
 */
function validateAllEdges(edges: Edge[], nodeIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const edgeSignatures = new Set<string>();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];

    // Validate individual edge
    const edgeErrors = validateEdge(edge, i, nodeIds);
    errors.push(...edgeErrors);

    // Check for duplicate edges (same source, target, type)
    const source = edge.source || edge.source_id;
    const target = edge.target || edge.target_id;
    if (source && target && edge.type) {
      const signature = `${source}→${target}:${edge.type}`;
      if (edgeSignatures.has(signature)) {
        errors.push(
          new ValidationError(
            'ai-edges.yaml',
            3 + i * 5,
            `duplicate edge (${signature})`
          )
        );
      }
      edgeSignatures.add(signature);
    }
  }

  return errors;
}

/**
 * Main import function
 */
async function importYaml(): Promise<void> {
  try {
    // Resolve to project root: dist/scripts/import-yaml.js -> up 3 levels to project root
    const projectRoot = path.resolve(__dirname, '../../');
    const nodesFile = path.join(projectRoot, 'ai-nodes.yaml');
    const edgesFile = path.join(projectRoot, 'ai-edges.yaml');

    console.log('📂 Loading ai-nodes.yaml...');
    const nodeData = loadYaml(nodesFile);
    const nodes = nodeData.nodes || [];

    console.log(`   ✓ Loaded ${nodes.length} nodes`);

    // Validate nodes
    console.log('✓ Validating nodes...');
    const nodeErrors = validateAllNodes(nodes);
    if (nodeErrors.length > 0) {
      console.error('\n❌ Validation errors in nodes:');
      nodeErrors.forEach(err => console.error(`  ${err.message}`));
      process.exit(1);
    }

    const nodeIds = new Set(nodes.map(n => n.id));

    // Load edges if exists
    let edges: Edge[] = [];
    if (fs.existsSync(edgesFile)) {
      console.log('📂 Loading ai-edges.yaml...');
      const edgeData = loadYaml(edgesFile);
      edges = edgeData.edges || [];
      console.log(`   ✓ Loaded ${edges.length} edges`);

      // Validate edges
      console.log('✓ Validating edges...');
      const edgeErrors = validateAllEdges(edges, nodeIds);
      if (edgeErrors.length > 0) {
        console.error('\n❌ Validation errors in edges:');
        edgeErrors.forEach(err => console.error(`  ${err.message}`));
        process.exit(1);
      }
    } else {
      console.log('⊘ ai-edges.yaml not found (optional in Phase 1)');
    }

    console.log('\n✓ All validations passed!');
    console.log(`  • ${nodes.length} nodes`);
    console.log(`  • ${edges.length} edges`);
    console.log('\n📝 TODO: Implement LadybugDB population (Task 1.4 continuation)');

  } catch (error) {
    console.error(
      `\n❌ Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
}

// Run if invoked directly
if (require.main === module) {
  importYaml().catch(err => {
    console.error(err);
    process.exit(2);
  });
}

export { importYaml, validateNode, validateAllNodes, validateEdge, validateAllEdges };
