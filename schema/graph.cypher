/*
 * LadybugDB Schema for beyond-chatbot
 * Defines Node and Edge types for the AI taxonomy graph
 *
 * This schema corresponds to the data model defined in docs/spec/00-project-spec.md §2
 */

/* ============================================
   NODE SCHEMA: AI Concept Nodes
   ============================================ */

CREATE NODE TABLE Node(
  -- Primary key: stable identifier (kebab-case)
  id STRING PRIMARY KEY,

  -- Display properties
  name STRING NOT NULL,
  aliases STRING[] DEFAULT [],

  -- Classification (closed sets per spec)
  branch STRING NOT NULL,
  type STRING NOT NULL,
  era STRING NOT NULL,
  status STRING NOT NULL,

  -- Documentation
  descriptor STRING NOT NULL,
  anchors STRING[] DEFAULT []
);

/* Create index on branch for efficient filtering */
CREATE INDEX idx_node_branch ON Node(branch);
CREATE INDEX idx_node_status ON Node(status);

/* ============================================
   EDGE SCHEMA: Typed Relationships
   ============================================ */

CREATE REL TABLE Edge(
  FROM Node TO Node,

  -- Relationship type (closed set: 6 types per spec)
  type STRING NOT NULL,

  -- Confidence and provenance
  confidence FLOAT DEFAULT NULL,
  source_ref STRING DEFAULT NULL,
  notes STRING DEFAULT NULL
);

/* Create index on edge type for filtering */
CREATE INDEX idx_edge_type ON Edge(type);

/* ============================================
   ENUM CONSTRAINTS (Documented, enforced at import)
   ============================================ */

/*
 * Branch enum values (11 branches, closed set):
 *   - symbolic-gofai
 *   - classical-ml
 *   - deep-learning
 *   - reinforcement-learning
 *   - hybrid-neurosymbolic
 *   - substrate-statistics
 *   - substrate-optimization
 *   - substrate-information-theory
 *   - substrate-signal-processing
 *   - information-retrieval-recommenders
 *   - cross-cutting
 */

/*
 * Node type enum values (6 types):
 *   - algorithm
 *   - method
 *   - model-class
 *   - system
 *   - framework
 *   - math-construct
 */

/*
 * Status enum values (5 statuses):
 *   - foundational
 *   - active
 *   - legacy
 *   - emerging
 *   - dormant
 */

/*
 * Edge type enum values (6 types, closed set):
 *   - prerequisite
 *   - descendant-of
 *   - historical-influence
 *   - substrate-of
 *   - uses
 *   - composes
 */

/* ============================================
   CONSTRAINTS AND INVARIANTS
   ============================================ */

/*
 * The following invariants are enforced at the application layer (import validation):
 *
 * Node invariants:
 *   - id must be unique (PRIMARY KEY enforces this)
 *   - id must be kebab-case
 *   - name must be non-empty
 *   - descriptor must be a single technical sentence
 *   - branch must be one of the 11 fixed branches
 *   - type must be one of the 6 node types
 *   - status must be one of the 5 statuses
 *   - era must be a valid year/decade format
 *
 * Edge invariants:
 *   - No self-loops: source_id != target_id
 *   - No duplicate (source_id, target_id, type) triples
 *   - Both source_id and target_id must exist as Node ids
 *   - type must be one of the 6 edge types
 *   - confidence must be in range [0.0, 1.0] if present
 *
 * These are enforced by scripts/import-yaml.js with detailed error reporting.
 */
