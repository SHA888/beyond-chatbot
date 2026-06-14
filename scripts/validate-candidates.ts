import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

/**
 * Candidate-edge validator
 * Loads candidates from seed.yaml and llm.yaml, validates them, and outputs clean.yaml
 * Validates: known IDs, valid types, no self-loops, no duplicates
 */

const VALID_TYPES = new Set([
  'prerequisite',
  'descendant-of',
  'historical-influence',
  'substrate-of',
  'uses',
  'composes'
]);

interface Edge {
  source: string;
  target: string;
  type: string;
  confidence?: number;
  notes?: string;
  provenance?: string;
}

interface ValidationStats {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  selfLoops: number;
  unknownNodes: number;
  invalidTypes: number;
}

interface ValidationReport {
  timestamp: string;
  summary: ValidationStats;
  sourceBreakdown: {
    seed: ValidationStats;
    llm: ValidationStats;
  };
  issues: Array<{
    edge: Edge;
    source: string;
    reason: string;
  }>;
}

function loadNodeIds(nodeYamlPath: string): Set<string> {
  const content = fs.readFileSync(nodeYamlPath, 'utf-8');
  const data = yaml.load(content) as unknown;

  if (!data || typeof data !== 'object' || !('nodes' in data)) {
    throw new Error(`Invalid ai-nodes.yaml structure: missing 'nodes' field at ${nodeYamlPath}`);
  }

  const nodes = (data as { nodes: unknown }).nodes;
  if (!Array.isArray(nodes)) {
    throw new Error(`Invalid ai-nodes.yaml structure: 'nodes' must be an array at ${nodeYamlPath}`);
  }

  return new Set(nodes.filter((node): node is { id: string } =>
    typeof node === 'object' && node !== null && 'id' in node && typeof node.id === 'string'
  ).map(node => node.id));
}

function loadCandidates(
  seedPath: string,
  llmPath: string
): { seed: Edge[]; llm: Edge[] } {
  const seedContent = fs.readFileSync(seedPath, 'utf-8');
  const seedData = yaml.load(seedContent) as { edges: Edge[] };
  const seedEdges = seedData.edges || [];

  const llmContent = fs.readFileSync(llmPath, 'utf-8');
  const llmData = yaml.load(llmContent) as { edges: Edge[] };
  const llmEdges = llmData.edges || [];

  return { seed: seedEdges, llm: llmEdges };
}

function validateEdges(
  edges: Edge[],
  nodeIds: Set<string>
): {
  valid: Edge[];
  invalid: Array<{ edge: Edge; reason: string }>;
  stats: ValidationStats;
} {
  const valid: Edge[] = [];
  const invalid: Array<{ edge: Edge; reason: string }> = [];
  const seenTriples = new Set<string>();
  const edgesWithUnknownNodes = new Set<number>(); // Track which edges have unknown nodes
  const stats: ValidationStats = {
    total: edges.length,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    selfLoops: 0,
    unknownNodes: 0,
    invalidTypes: 0
  };

  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const edge = edges[edgeIndex];
    let reasons: string[] = [];
    let isValid = true;

    // Check for self-loops
    if (edge.source === edge.target) {
      reasons.push('self-loop');
      stats.selfLoops++;
      isValid = false;
    }

    // Check for unknown node IDs
    let hasUnknownNode = false;
    if (!nodeIds.has(edge.source)) {
      reasons.push(`unknown source: ${edge.source}`);
      hasUnknownNode = true;
      isValid = false;
    }
    if (!nodeIds.has(edge.target)) {
      reasons.push(`unknown target: ${edge.target}`);
      hasUnknownNode = true;
      isValid = false;
    }
    if (hasUnknownNode) {
      edgesWithUnknownNodes.add(edgeIndex);
    }

    // Check for valid type
    if (!VALID_TYPES.has(edge.type)) {
      reasons.push(`invalid type: ${edge.type}`);
      stats.invalidTypes++;
      isValid = false;
    }

    // Check for duplicates (check all edges, not just valid ones)
    const triple = `${edge.source}|${edge.target}|${edge.type}`;
    if (seenTriples.has(triple)) {
      reasons.push('duplicate (source, target, type)');
      stats.duplicates++;
      isValid = false;
    } else {
      seenTriples.add(triple);
    }

    if (isValid) {
      valid.push(edge);
      stats.valid++;
    } else {
      invalid.push({ edge, reason: reasons.join('; ') });
      stats.invalid++;
    }
  }

  // Count unique edges with unknown nodes (not per-field)
  stats.unknownNodes = edgesWithUnknownNodes.size;

  return { valid, invalid, stats };
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '../../');
  const nodesYamlPath = path.join(projectRoot, 'ai-nodes.yaml');
  const seedCandidatesPath = path.join(projectRoot, 'data/candidates/seed.yaml');
  const llmCandidatesPath = path.join(projectRoot, 'data/candidates/llm.yaml');
  const cleanCandidatesPath = path.join(projectRoot, 'data/candidates/clean.yaml');
  const reportPath = path.join(projectRoot, 'data/candidates/validation-report.json');

  try {
    console.log('Loading node IDs from ai-nodes.yaml...');
    const nodeIds = loadNodeIds(nodesYamlPath);
    console.log(`✓ Loaded ${nodeIds.size} node IDs`);

    console.log('\nLoading candidates from seed.yaml and llm.yaml...');
    const { seed: seedEdges, llm: llmEdges } = loadCandidates(
      seedCandidatesPath,
      llmCandidatesPath
    );
    console.log(`✓ Loaded ${seedEdges.length} seed candidates`);
    console.log(`✓ Loaded ${llmEdges.length} LLM candidates`);

    console.log('\nValidating candidates...');
    const seedResult = validateEdges(seedEdges, nodeIds);
    console.log(
      `Seed: ${seedResult.stats.valid} valid, ${seedResult.stats.invalid} invalid`
    );

    const llmResult = validateEdges(llmEdges, nodeIds);
    console.log(
      `LLM: ${llmResult.stats.valid} valid, ${llmResult.stats.invalid} invalid`
    );

    const allValidEdges = [...seedResult.valid, ...llmResult.valid];
    const allInvalidEdges = [...seedResult.invalid, ...llmResult.invalid];

    console.log(
      `\nTotal: ${allValidEdges.length} valid, ${allInvalidEdges.length} invalid`
    );

    // Write clean candidates
    console.log(`\nWriting clean candidates to ${cleanCandidatesPath}...`);
    const cleanOutput = {
      edges: allValidEdges.sort((a, b) => {
        if (a.source !== b.source) return a.source.localeCompare(b.source);
        if (a.target !== b.target) return a.target.localeCompare(b.target);
        return a.type.localeCompare(b.type);
      })
    };
    fs.writeFileSync(cleanCandidatesPath, yaml.dump(cleanOutput, { lineWidth: 120 }));
    console.log(`✓ Wrote ${allValidEdges.length} clean edges`);

    // Write validation report
    console.log(`Writing validation report to ${reportPath}...`);
    const report: ValidationReport = {
      timestamp: new Date().toISOString(),
      summary: {
        total: seedEdges.length + llmEdges.length,
        valid: allValidEdges.length,
        invalid: allInvalidEdges.length,
        duplicates: seedResult.stats.duplicates + llmResult.stats.duplicates,
        selfLoops: seedResult.stats.selfLoops + llmResult.stats.selfLoops,
        unknownNodes: seedResult.stats.unknownNodes + llmResult.stats.unknownNodes,
        invalidTypes: seedResult.stats.invalidTypes + llmResult.stats.invalidTypes
      },
      sourceBreakdown: {
        seed: seedResult.stats,
        llm: llmResult.stats
      },
      issues: [
        ...seedResult.invalid.map(item => ({
          edge: item.edge,
          source: 'seed',
          reason: item.reason
        })),
        ...llmResult.invalid.map(item => ({
          edge: item.edge,
          source: 'llm',
          reason: item.reason
        }))
      ].sort((a, b) => {
        if (a.source !== b.source) return a.source.localeCompare(b.source);
        if (a.edge.source !== b.edge.source)
          return a.edge.source.localeCompare(b.edge.source);
        return a.edge.target.localeCompare(b.edge.target);
      })
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`✓ Wrote validation report with ${report.issues.length} issues`);

    console.log('\n✓ Validation complete!');
    console.log(
      `  Valid edges: ${allValidEdges.length}/${seedEdges.length + llmEdges.length}`
    );
    if (allInvalidEdges.length > 0) {
      console.log(`  Issues by type:`);
      console.log(
        `    - Self-loops: ${report.summary.selfLoops}`
      );
      console.log(
        `    - Unknown nodes: ${report.summary.unknownNodes}`
      );
      console.log(
        `    - Invalid types: ${report.summary.invalidTypes}`
      );
      console.log(
        `    - Duplicates: ${report.summary.duplicates}`
      );
    }
  } catch (error) {
    console.error('✗ Validation failed:', error);
    process.exit(1);
  }
}

main();
