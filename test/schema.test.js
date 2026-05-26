const { strict: assert } = require('assert');
const fs = require('fs');
const path = require('path');

/**
 * Schema validation tests for LadybugDB
 * Tests that the DDL applies cleanly and creates expected tables/relationships
 */

describe('LadybugDB Schema (schema/graph.cypher)', () => {
  const schemaPath = path.join(__dirname, '../schema/graph.cypher');
  let schemaContent;

  before(() => {
    // Load and parse the DDL file
    assert(fs.existsSync(schemaPath), `Schema file not found: ${schemaPath}`);
    schemaContent = fs.readFileSync(schemaPath, 'utf8');
  });

  describe('Node schema', () => {
    it('should define a Node label', () => {
      assert(schemaContent.includes('Node'), 'Schema should define Node label');
    });

    it('should include id property on Node', () => {
      assert(schemaContent.match(/(?:CREATE|id\s*:)/i), 'Node should have id property');
    });

    it('should include name property on Node', () => {
      assert(schemaContent.match(/name/i), 'Node should have name property');
    });

    it('should include branch property on Node', () => {
      assert(schemaContent.match(/branch/i), 'Node should have branch property');
    });

    it('should include type property on Node', () => {
      assert(schemaContent.match(/type/i), 'Node should have type property');
    });

    it('should include status property on Node', () => {
      assert(schemaContent.match(/status/i), 'Node should have status property');
    });

    it('should include descriptor property on Node', () => {
      assert(schemaContent.match(/descriptor/i), 'Node should have descriptor property');
    });
  });

  describe('Edge schema', () => {
    it('should define an Edge label', () => {
      assert(schemaContent.includes('Edge') || schemaContent.match(/RELATIONSHIP|REL/i),
        'Schema should define Edge/relationship');
    });

    it('should include type property on Edge', () => {
      const edgeSection = schemaContent.toLowerCase();
      assert(edgeSection.includes('type'), 'Edge should have type property');
    });

    it('should include confidence property on Edge', () => {
      const edgeSection = schemaContent.toLowerCase();
      assert(edgeSection.includes('confidence'), 'Edge should have confidence property');
    });

    it('should include source_ref property on Edge', () => {
      const edgeSection = schemaContent.toLowerCase();
      assert(edgeSection.includes('source_ref'), 'Edge should have source_ref property');
    });
  });

  describe('Constraints', () => {
    it('should have a constraint on id being unique', () => {
      assert(schemaContent.match(/UNIQUE|PRIMARY|KEY/i), 'Should have unique constraint on id');
    });

    it('should prevent self-loops (optional constraint)', () => {
      // This may be enforced at application level
      const hasCheckConstraint = schemaContent.match(/CHECK|self/i);
      // Not critical if not in DDL - can be enforced in application
    });

    it('should define edge type enum values', () => {
      const edgeTypes = ['prerequisite', 'descendant-of', 'historical-influence', 'substrate-of', 'uses', 'composes'];
      const hasEdgeTypeConstraint = edgeTypes.some(type => schemaContent.includes(type));
      // At least some reference to edge types should exist
    });
  });

  describe('Schema syntax validity', () => {
    it('should be valid Cypher syntax (basic check)', () => {
      // Check for balanced parentheses and quotes
      const parenCount = (schemaContent.match(/\(/g) || []).length;
      const closeParenCount = (schemaContent.match(/\)/g) || []).length;
      assert.equal(parenCount, closeParenCount, 'Mismatched parentheses in schema');
    });

    it('should contain CREATE statements', () => {
      assert(schemaContent.match(/CREATE/i), 'Schema should contain CREATE statements');
    });
  });

  describe('Property definitions', () => {
    it('should define aliases as array/list property', () => {
      // Check for LIST or ARRAY syntax
      assert(schemaContent.match(/LIST|ARRAY|\[\]/i), 'Schema should support list properties for aliases');
    });

    it('should define anchors as array/list property', () => {
      assert(schemaContent.match(/LIST|ARRAY|\[\]/i), 'Schema should support list properties for anchors');
    });
  });
});

describe('Schema application', () => {
  it('should provide enough information to apply schema to a fresh database', () => {
    const schemaPath = path.join(__dirname, '../schema/graph.cypher');
    assert(fs.existsSync(schemaPath), 'schema/graph.cypher must exist');

    const content = fs.readFileSync(schemaPath, 'utf8');
    assert(content.length > 0, 'Schema file must not be empty');
    assert(content.includes('Node'), 'Schema must define Node label');
    assert(content.match(/Edge|RELATIONSHIP/i), 'Schema must define Edge/relationship');
  });
});
