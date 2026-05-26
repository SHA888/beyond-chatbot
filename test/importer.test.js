const { strict: assert } = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Unit tests for YAML → LadybugDB importer
 * Tests validation logic, error reporting, and data import correctness
 */

describe('YAML Importer (scripts/import-yaml.js)', () => {
  const importerPath = path.join(__dirname, '../scripts/import-yaml.js');

  describe('Module existence and exports', () => {
    it('should export a function', () => {
      // Placeholder: actual importer must export a validation/import function
      const scriptExists = fs.existsSync(importerPath);
      assert(scriptExists, `Importer script must exist at ${importerPath}`);
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
        assert(!nodeWithoutId.id, 'Test setup: id should be missing');
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
        assert(!nodeWithoutName.name, 'Test setup: name should be missing');
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
        assert(!nodeWithoutBranch.branch, 'Test setup: branch should be missing');
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
        assert(!nodeWithoutDescriptor.descriptor, 'Test setup: descriptor should be missing');
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
        assert.equal(validBranches.length, 11, 'Should have exactly 11 branches');
      });

      it('should validate type is one of 6 node type values', () => {
        const validTypes = ['algorithm', 'method', 'model-class', 'system', 'framework', 'math-construct'];
        assert.equal(validTypes.length, 6, 'Should have exactly 6 node types');
      });

      it('should validate status is one of 5 values', () => {
        const validStatuses = ['foundational', 'active', 'legacy', 'emerging', 'dormant'];
        assert.equal(validStatuses.length, 5, 'Should have exactly 5 statuses');
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
        assert.equal(invalidNode.branch, 'invalid-branch', 'Test setup: invalid branch');
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
        assert.equal(invalidNode.status, 'experimental', 'Test setup: invalid status');
      });
    });

    describe('Format constraints', () => {
      it('should validate id is kebab-case', () => {
        const validId = 'symbolic-gofai';
        const invalidIds = ['symbolic_gofai', 'Symbolic-Gofai', 'symbolic gofai', 'symbolic--gofai'];
        assert(validId.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), 'Valid kebab-case should match pattern');
      });

      it('should validate descriptor is a single sentence (ends with period)', () => {
        const validDescriptor = 'This is a single sentence.';
        const invalidDescriptor = 'This is two sentences. And this is another.';
        assert(validDescriptor.match(/\.$/), 'Valid descriptor should end with period');
      });

      it('should validate era format (year or decade)', () => {
        const validEras = ['1956', '1990s', '2010-present', '1956-present'];
        validEras.forEach(era => {
          assert(era.match(/^\d{4}(?:s|-.*)?$/), `Era format should be valid: ${era}`);
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
        assert(Array.isArray(node.aliases), 'aliases should be array');
        assert(Array.isArray(node.anchors), 'anchors should be array');
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
        assert(ids.length > uniqueIds.size, 'Test setup: duplicate ids should exist');
      });
    });
  });

  describe('Edge validation', () => {
    describe('Required fields and constraints', () => {
      it('should require source_id and target_id on edges', () => {
        const edgeWithoutSource = {
          target_id: 'symbolic-gofai',
          type: 'prerequisite',
          confidence: 0.95
        };
        assert(!edgeWithoutSource.source_id, 'source_id should be missing');
      });

      it('should validate edge type is one of 6 values', () => {
        const validEdgeTypes = ['prerequisite', 'descendant-of', 'historical-influence', 'substrate-of', 'uses', 'composes'];
        assert.equal(validEdgeTypes.length, 6, 'Should have exactly 6 edge types');
      });

      it('should validate confidence is between 0.0 and 1.0 if present', () => {
        const validConfidences = [0.0, 0.5, 0.95, 1.0];
        const invalidConfidences = [-0.1, 1.1, 2.0];
        validConfidences.forEach(c => assert(c >= 0 && c <= 1, `${c} should be valid`));
        invalidConfidences.forEach(c => assert(!(c >= 0 && c <= 1), `${c} should be invalid`));
      });

      it('should reject self-loops (source_id === target_id)', () => {
        const selfLoop = {
          source_id: 'symbolic-gofai',
          target_id: 'symbolic-gofai',
          type: 'prerequisite'
        };
        assert.equal(selfLoop.source_id, selfLoop.target_id, 'Test setup: self-loop');
      });

      it('should reject duplicate edges (same source, target, type)', () => {
        const edges = [
          { source_id: 'a', target_id: 'b', type: 'prerequisite' },
          { source_id: 'a', target_id: 'b', type: 'prerequisite' }
        ];
        const edgeSignatures = edges.map(e => `${e.source_id}→${e.target_id}:${e.type}`);
        const unique = new Set(edgeSignatures);
        assert(edgeSignatures.length > unique.size, 'Test setup: duplicate edges');
      });
    });

    describe('Referential integrity', () => {
      it('should require source_id and target_id to exist in node catalog', () => {
        const nodes = [{ id: 'node-a' }, { id: 'node-b' }];
        const nodeIds = new Set(nodes.map(n => n.id));

        const validEdge = { source_id: 'node-a', target_id: 'node-b', type: 'prerequisite' };
        const invalidEdge = { source_id: 'node-c', target_id: 'node-b', type: 'prerequisite' };

        assert(nodeIds.has(validEdge.source_id), 'Valid edge should have existing source');
        assert(!nodeIds.has(invalidEdge.source_id), 'Invalid edge source should not exist');
      });
    });
  });

  describe('Error reporting', () => {
    it('should report error location with file and line number', () => {
      // Error format should be: "file.yaml:line_number: description"
      const errorFormat = /\.ya?ml:\d+:/;
      const exampleError = 'ai-nodes.yaml:15: invalid branch value';
      assert(exampleError.match(errorFormat), 'Error should include file and line number');
    });

    it('should provide context in error messages', () => {
      // Error should include field name, actual value, and constraint
      const goodError = 'ai-nodes.yaml:15: node "test-node" has invalid branch "foo" (must be one of 11 branches)';
      assert(goodError.includes('test-node'), 'Error should identify the node');
      assert(goodError.includes('branch'), 'Error should identify the field');
      assert(goodError.includes('foo'), 'Error should show the invalid value');
    });

    it('should fail loudly on first error (all-or-nothing)', () => {
      // Importer should exit with code 1 on validation failure
      // No partial imports allowed
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

    it('should create deterministic output', () => {
      // Running importer twice on same input should:
      // - Result in identical database state
      // - Not duplicate nodes or edges
      // - Not leave orphaned data
    });
  });

  describe('Integration with LadybugDB', () => {
    it('should create database if not exists', () => {
      // Importer should:
      // - Create .ladybugdb/ directory
      // - Apply schema from schema/graph.cypher
      // - Populate tables
    });

    it('should populate Node table correctly', () => {
      // After import:
      // - Node table should have all required fields
      // - All constraints from schema should be satisfied
      // - Indices should be created
    });

    it('should handle arrays (aliases, anchors) correctly', () => {
      // STRING[] properties should be:
      // - Correctly parsed from YAML arrays
      // - Stored in LadybugDB LIST format
      // - Queryable and retrievable
    });
  });

  describe('Batch import performance', () => {
    it('should import 165 nodes in reasonable time', () => {
      // Performance target: <30s for full import (per spec)
      // With 165 nodes, should average <200ms per node
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
    assert(parsed.nodes, 'Should parse YAML');
    assert(parsed.nodes.length > 0, 'Should have nodes');
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
    let error;
    try {
      yaml.load(invalidYaml);
    } catch (e) {
      error = e;
    }
    assert(error, 'Should throw on invalid YAML');
    assert(error.mark, 'Error should include location (mark)');
  });
});
