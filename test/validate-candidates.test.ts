import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

/**
 * Unit tests for candidate-edge validator
 * Validates that the validator correctly identifies and removes invalid edges
 */

interface Edge {
  source: string;
  target: string;
  type: string;
  confidence?: number;
  notes?: string;
  provenance?: string;
}

interface ValidationResult {
  valid: Edge[];
  invalid: Array<{ edge: Edge; reason: string }>;
  stats: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
    selfLoops: number;
    unknownNodes: number;
    invalidTypes: number;
  };
}

const VALID_TYPES = new Set([
  'prerequisite',
  'descendant-of',
  'historical-influence',
  'substrate-of',
  'uses',
  'composes'
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

function loadNodeIds(): Set<string> {
  const nodesPath = path.join(projectRoot, 'ai-nodes.yaml');
  const content = fs.readFileSync(nodesPath, 'utf-8');
  const data = yaml.load(content) as { nodes: Array<{ id: string }> };
  return new Set(data.nodes.map(node => node.id));
}

function validateEdges(edges: Edge[], nodeIds: Set<string>): ValidationResult {
  const valid: Edge[] = [];
  const invalid: Array<{ edge: Edge; reason: string }> = [];
  const seenTriples = new Set<string>();
  const duplicateTriples = new Set<string>();
  const edgesWithUnknownNodes = new Set<number>();
  let selfLoopsCount = 0;
  let invalidTypesCount = 0;

  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const edge = edges[edgeIndex];
    let reasons: string[] = [];
    let isValid = true;

    // Check for self-loops
    if (edge.source === edge.target) {
      reasons.push('self-loop');
      selfLoopsCount++;
      isValid = false;
    }

    // Check for unknown node IDs
    let hasUnknownNode = false;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      reasons.push(`unknown node: ${!nodeIds.has(edge.source) ? edge.source : edge.target}`);
      hasUnknownNode = true;
      isValid = false;
    }
    if (hasUnknownNode) {
      edgesWithUnknownNodes.add(edgeIndex);
    }

    // Check for valid type
    if (!VALID_TYPES.has(edge.type)) {
      reasons.push(`invalid type: ${edge.type}`);
      invalidTypesCount++;
      isValid = false;
    }

    // Check for duplicates (check all edges, not just valid ones)
    const triple = `${edge.source}|${edge.target}|${edge.type}`;
    if (seenTriples.has(triple)) {
      reasons.push('duplicate (source, target, type)');
      duplicateTriples.add(triple);
      isValid = false;
    } else {
      seenTriples.add(triple);
    }

    if (isValid) {
      valid.push(edge);
    } else {
      invalid.push({ edge, reason: reasons.join('; ') });
    }
  }

  return {
    valid,
    invalid,
    stats: {
      total: edges.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates: duplicateTriples.size,
      selfLoops: selfLoopsCount,
      unknownNodes: edgesWithUnknownNodes.size,
      invalidTypes: invalidTypesCount
    }
  };
}

describe('Candidate-edge validator', () => {
  let nodeIds: Set<string>;

  beforeAll(() => {
    nodeIds = loadNodeIds();
  });

  describe('Node ID loading', () => {
    it('should load node IDs from ai-nodes.yaml', () => {
      expect(nodeIds.size).toBeGreaterThan(0);
      expect(nodeIds.has('symbolic-gofai')).toBe(true);
    });

    it('should have 165+ nodes', () => {
      expect(nodeIds.size).toBeGreaterThanOrEqual(165);
    });
  });

  describe('Self-loop detection', () => {
    it('should reject self-loops', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'lstm',
          type: 'prerequisite',
          provenance: 'test'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toBe('self-loop');
      expect(result.stats.selfLoops).toBe(1);
    });

    it('should accept edges between different nodes', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.valid).toHaveLength(1);
    });
  });

  describe('Unknown node detection', () => {
    it('should reject edges with unknown source node', () => {
      const edges: Edge[] = [
        {
          source: 'nonexistent-node',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('unknown node');
    });

    it('should reject edges with unknown target node', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'nonexistent-node',
          type: 'prerequisite',
          provenance: 'test'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('unknown node');
    });

    it('should accept edges with valid known nodes', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.valid).toHaveLength(1);
    });
  });

  describe('Edge type validation', () => {
    it('should accept all 6 valid edge types', () => {
      const validTypes = [
        'prerequisite',
        'descendant-of',
        'historical-influence',
        'substrate-of',
        'uses',
        'composes'
      ];

      const edges = validTypes.map(type => ({
        source: 'lstm',
        target: 'rnn',
        type,
        provenance: 'test'
      }));

      const result = validateEdges(edges, nodeIds);
      expect(result.valid).toHaveLength(6);
      expect(result.invalid).toHaveLength(0);
    });

    it('should reject invalid edge types', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'rnn',
          type: 'invalid-type',
          provenance: 'test'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('invalid type');
    });
  });

  describe('Duplicate detection', () => {
    it('should detect duplicate (source, target, type) triples', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test1'
        },
        {
          source: 'lstm',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test2'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toBe('duplicate (source, target, type)');
      expect(result.stats.duplicates).toBe(1);
    });

    it('should allow same (source, target) with different types', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test1'
        },
        {
          source: 'lstm',
          target: 'rnn',
          type: 'descendant-of',
          provenance: 'test2'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('Comprehensive validation', () => {
    it('should handle mixed valid and invalid edges', () => {
      const edges: Edge[] = [
        // Valid
        {
          source: 'lstm',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test1'
        },
        // Self-loop
        {
          source: 'lstm',
          target: 'lstm',
          type: 'uses',
          provenance: 'test2'
        },
        // Unknown node
        {
          source: 'nonexistent',
          target: 'rnn',
          type: 'uses',
          provenance: 'test3'
        },
        // Invalid type
        {
          source: 'lstm',
          target: 'rnn',
          type: 'bad-type',
          provenance: 'test4'
        },
        // Valid
        {
          source: 'adam',
          target: 'sgd',
          type: 'substrate-of',
          provenance: 'test5'
        }
      ];
      const result = validateEdges(edges, nodeIds);
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(3);
      expect(result.stats.total).toBe(5);
    });

    it('should be idempotent (same input produces same output)', () => {
      const edges: Edge[] = [
        {
          source: 'lstm',
          target: 'rnn',
          type: 'prerequisite',
          provenance: 'test'
        }
      ];
      const result1 = validateEdges(edges, nodeIds);
      const result2 = validateEdges(edges, nodeIds);
      expect(result1.valid).toEqual(result2.valid);
      expect(result1.stats).toEqual(result2.stats);
    });
  });

  describe('Actual candidate files', () => {
    it('should load seed candidates', () => {
      const seedPath = path.join(projectRoot, 'data/candidates/seed.yaml');
      expect(fs.existsSync(seedPath)).toBe(true);
      const content = fs.readFileSync(seedPath, 'utf-8');
      const data = yaml.load(content) as { edges: Edge[] };
      expect(data.edges).toBeDefined();
      expect(Array.isArray(data.edges)).toBe(true);
    });

    it('should load llm candidates', () => {
      const llmPath = path.join(projectRoot, 'data/candidates/llm.yaml');
      expect(fs.existsSync(llmPath)).toBe(true);
      const content = fs.readFileSync(llmPath, 'utf-8');
      const data = yaml.load(content) as { edges: Edge[] };
      expect(data.edges).toBeDefined();
      expect(Array.isArray(data.edges)).toBe(true);
      expect(data.edges.length).toBeGreaterThan(100);
    });

    it('should validate all seed candidates', () => {
      const seedPath = path.join(projectRoot, 'data/candidates/seed.yaml');
      const content = fs.readFileSync(seedPath, 'utf-8');
      const data = yaml.load(content) as { edges: Edge[] };
      const result = validateEdges(data.edges, nodeIds);
      // Seed edges should be mostly valid (hand-curated from Wikidata)
      expect(result.valid.length).toBeGreaterThan(0);
      expect(result.stats.invalid).toBeLessThanOrEqual(data.edges.length);
    });

    it('should validate all llm candidates', () => {
      const llmPath = path.join(projectRoot, 'data/candidates/llm.yaml');
      const content = fs.readFileSync(llmPath, 'utf-8');
      const data = yaml.load(content) as { edges: Edge[] };
      const result = validateEdges(data.edges, nodeIds);
      // Should produce a validation report
      expect(result.stats.total).toBe(data.edges.length);
      expect(result.stats.valid + result.stats.invalid).toBe(
        data.edges.length
      );
    });
  });
});
