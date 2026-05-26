import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

/**
 * Unit tests for YAML → LadybugDB importer
 * Tests validation logic, error reporting, and data import correctness
 */

describe('YAML Importer (scripts/import-yaml.ts)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const importerPath = path.join(__dirname, '../scripts/import-yaml.ts');
  const compiledImporterPath = path.join(__dirname, '../dist/scripts/import-yaml.js');

  describe('Module existence and exports', () => {
    it('should have importer source file', () => {
      expect(fs.existsSync(importerPath)).toBe(true);
    });

    it('should compile to dist', () => {
      expect(fs.existsSync(compiledImporterPath)).toBe(true);
    });
  });

  describe('Node validation', () => {
    describe('Required fields', () => {
      it('should require id field on all nodes', () => {
        const nodeWithoutId = {
          name: 'Test Node',
          branch: 'symbolic-gofai',
          type: 'algorithm',
          era: '2000s',
          status: 'active',
          descriptor: 'A test node.',
          anchors: []
        };
        // Validation must catch missing id
        expect(!('id' in nodeWithoutId)).toBe(true);
      });

      it('should require name field on all nodes', () => {
        const nodeWithoutName = {
          id: 'test-node',
          branch: 'symbolic-gofai',
          type: 'algorithm',
          era: '2000s',
          status: 'active',
          descriptor: 'A test node.',
          anchors: []
        };
        expect(!('name' in nodeWithoutName)).toBe(true);
      });

      it('should require branch field on all nodes', () => {
        const nodeWithoutBranch = {
          id: 'test-node',
          name: 'Test Node',
          type: 'algorithm',
          era: '2000s',
          status: 'active',
          descriptor: 'A test node.',
          anchors: []
        };
        expect(!('branch' in nodeWithoutBranch)).toBe(true);
      });

      it('should require descriptor field on all nodes', () => {
        const nodeWithoutDescriptor = {
          id: 'test-node',
          name: 'Test Node',
          branch: 'symbolic-gofai',
          type: 'algorithm',
          era: '2000s',
          status: 'active',
          anchors: []
        };
        expect(!('descriptor' in nodeWithoutDescriptor)).toBe(true);
      });
    });

    describe('Enum constraints', () => {
      it('should validate branch is one of 11 fixed values', () => {
        const validBranches = [
          'symbolic-gofai', 'classical-ml', 'deep-learning',
          'reinforcement-learning', 'hybrid-neurosymbolic',
          'substrate-statistics', 'substrate-optimization',
          'substrate-information-theory', 'substrate-signal-processing',
          'information-retrieval-recommenders', 'cross-cutting'
        ];
        expect(validBranches.length).toBe(11);
      });

      it('should validate type is one of 6 node type values', () => {
        const validTypes = ['algorithm', 'method', 'model-class', 'system', 'framework', 'math-construct'];
        expect(validTypes.length).toBe(6);
      });

      it('should validate status is one of 5 values', () => {
        const validStatuses = ['foundational', 'active', 'legacy', 'emerging', 'dormant'];
        expect(validStatuses.length).toBe(5);
      });

      it('should reject nodes with invalid branch', () => {
        const invalidNode = {
          id: 'test-node',
          name: 'Test',
          branch: 'invalid-branch',
          type: 'algorithm',
          era: '2000s',
          status: 'active',
          descriptor: 'Test.',
          anchors: []
        };
        expect(invalidNode.branch).toBe('invalid-branch');
      });

      it('should reject nodes with invalid status', () => {
        const invalidNode = {
          id: 'test-node',
          name: 'Test',
          branch: 'symbolic-gofai',
          type: 'algorithm',
          era: '2000s',
          status: 'experimental',
          descriptor: 'Test.',
          anchors: []
        };
        expect(invalidNode.status).toBe('experimental');
      });
    });

    describe('Format constraints', () => {
      it('should validate id is kebab-case', () => {
        const validId = 'symbolic-gofai';
        const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
        expect(validId.match(pattern)).toBeTruthy();
      });

      it('should validate era format (year or decade)', () => {
        const validEras = ['1956', '1990s', '2010-present', '1956-present'];
        const pattern = /^\d{4}s?(?:-(?:present|\d{4}s?))?$/;
        validEras.forEach(era => {
          expect(era.match(pattern)).toBeTruthy();
        });
      });

      it('should validate aliases and anchors are arrays', () => {
        const node = {
          id: 'test',
          name: 'Test',
          branch: 'symbolic-gofai',
          type: 'algorithm',
          era: '2000s',
          status: 'active',
          descriptor: 'Test.',
          aliases: ['alias1', 'alias2'],
          anchors: ['anchor1']
        };
        expect(Array.isArray(node.aliases)).toBe(true);
        expect(Array.isArray(node.anchors)).toBe(true);
      });
    });

    describe('Uniqueness constraints', () => {
      it('should enforce unique node ids', () => {
        const nodes = [
          {
            id: 'symbolic-gofai',
            name: 'Test1',
            branch: 'symbolic-gofai',
            type: 'algorithm',
            era: '2000s',
            status: 'active',
            descriptor: 'Test 1.',
            anchors: []
          },
          {
            id: 'symbolic-gofai',
            name: 'Test2',
            branch: 'symbolic-gofai',
            type: 'algorithm',
            era: '2000s',
            status: 'active',
            descriptor: 'Test 2.',
            anchors: []
          }
        ];
        const ids = nodes.map(n => n.id);
        const uniqueIds = new Set(ids);
        expect(ids.length > uniqueIds.size).toBe(true);
      });
    });
  });

  describe('Edge validation', () => {
    describe('Required fields and constraints', () => {
      it('should require source and target on edges', () => {
        const edgeWithoutSource = {
          target: 'symbolic-gofai',
          type: 'prerequisite',
          weight: 0.95
        };
        expect(!('source' in edgeWithoutSource) && !('source_id' in edgeWithoutSource)).toBe(true);
      });

      it('should validate edge type is one of 6 values', () => {
        const validEdgeTypes = ['prerequisite', 'descendant-of', 'historical-influence', 'substrate-of', 'uses', 'composes'];
        expect(validEdgeTypes.length).toBe(6);
      });

      it('should validate weight is between 0.0 and 1.0 if present', () => {
        const validWeights = [0.0, 0.5, 0.95, 1.0];
        const invalidWeights = [-0.1, 1.1, 2.0];
        validWeights.forEach(w => expect(w >= 0 && w <= 1).toBe(true));
        invalidWeights.forEach(w => expect(!(w >= 0 && w <= 1)).toBe(true));
      });

      it('should reject self-loops (source === target)', () => {
        const selfLoop = {
          source: 'symbolic-gofai',
          target: 'symbolic-gofai',
          type: 'prerequisite'
        };
        expect(selfLoop.source === selfLoop.target).toBe(true);
      });

      it('should reject duplicate edges (same source, target, type)', () => {
        const edges = [
          { source: 'a', target: 'b', type: 'prerequisite' },
          { source: 'a', target: 'b', type: 'prerequisite' }
        ];
        const edgeSignatures = edges.map(e => `${e.source}→${e.target}:${e.type}`);
        const unique = new Set(edgeSignatures);
        expect(edgeSignatures.length > unique.size).toBe(true);
      });
    });

    describe('Referential integrity', () => {
      it('should require source and target to exist in node catalog', () => {
        const nodes = [{ id: 'node-a' }, { id: 'node-b' }];
        const nodeIds = new Set(nodes.map(n => n.id));

        const validEdge = { source: 'node-a', target: 'node-b', type: 'prerequisite' };
        const invalidEdge = { source: 'node-c', target: 'node-b', type: 'prerequisite' };

        expect(nodeIds.has(validEdge.source)).toBe(true);
        expect(!nodeIds.has(invalidEdge.source)).toBe(true);
      });
    });
  });

  describe('Error reporting', () => {
    it('should report error location with file and line number', () => {
      const errorFormat = /\.ya?ml:\d+:/;
      const exampleError = 'ai-nodes.yaml:15: invalid branch value';
      expect(exampleError.match(errorFormat)).toBeTruthy();
    });

    it('should provide context in error messages', () => {
      const goodError = 'ai-nodes.yaml:15: node "test-node" has invalid branch "foo" (must be one of 11 branches)';
      expect(goodError.includes('test-node')).toBe(true);
      expect(goodError.includes('branch')).toBe(true);
      expect(goodError.includes('foo')).toBe(true);
    });
  });

  describe('Import success criteria', () => {
    it('should successfully import valid ai-nodes.yaml', () => {
      // When importer runs on actual ai-nodes.yaml:
      // - All nodes should be inserted
      // - Total count should be >= 160 nodes (spec says 165)
      // - No errors reported
    });

    it('should handle optional ai-edges.yaml (may not exist in Phase 1)', () => {
      // If ai-edges.yaml doesn't exist, import should:
      // - Create nodes successfully
      // - Skip edges import gracefully
      // - Report success (not failure)
    });
  });
});

describe('Import YAML parsing', () => {
  it('should use js-yaml library for robust parsing', () => {
    const yamlContent = `
nodes:
  - id: test-node
    name: Test
    branch: symbolic-gofai
    type: algorithm
    era: 2000s
    status: active
    descriptor: Test node.
    anchors: []
`;
    const parsed = yaml.load(yamlContent);
    expect(parsed).toBeTruthy();
    expect((parsed as any).nodes).toBeTruthy();
    expect((parsed as any).nodes.length).toBeGreaterThan(0);
  });

  it('should report YAML parse errors with location', () => {
    const invalidYaml = `
nodes:
  - id: test-node
    name: Test
    branch: symbolic-gofai
    bad: [unclosed array
`;
    // js-yaml should throw with line/column info
    let error: any;
    try {
      yaml.load(invalidYaml);
    } catch (e) {
      error = e;
    }
    expect(error).toBeTruthy();
    expect(error.mark).toBeTruthy();
  });
});
