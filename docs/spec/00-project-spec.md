# beyond-chatbot: Project Specification

**Version:** 0.1.0  
**Last updated:** 2026-05-26  
**Status:** Active (Phase 1)

---

## 1. Overview

**beyond-chatbot** is a knowledge map of atomic AI/statistical-AI concepts, modeled on the Linked Open Data (LOD) cloud paradigm. The project evolves a hand-curated node catalog (`ai-nodes.yaml`) into a dense typed-edge graph with organic force-directed visualization.

**Phase 1 goal:** Lock the data model in this spec, establish Kùzu as the canonical storage layer, and prove the YAML ↔ Kùzu round-trip works.

---

## 2. Data Model

### 2.1 Node Schema

**Source of truth:** `ai-nodes.yaml`

Each node represents an atomic AI concept and has these **immutable** fields:

| Field | Type | Constraint | Example |
|-------|------|-----------|---------|
| `id` | string | kebab-case, stable, unique | `symbolic-gofai` |
| `name` | string | canonical display name | `Symbolic AI` |
| `aliases` | string[] | common alternative names, optional | `["GOFAI", "Classical AI"]` |
| `branch` | enum | one of 11 fixed values (see §2.3) | `symbolic-gofai` |
| `type` | enum | algorithm\|method\|model-class\|system\|framework\|math-construct | `framework` |
| `era` | string | year or decade (e.g., "1956-present", "1990s", "2012") | `1956-present` |
| `status` | enum | foundational\|active\|legacy\|emerging\|dormant | `active` |
| `descriptor` | string | one technical sentence, <120 chars | "AI based on explicit symbolic representations..." |
| `anchors` | string[] | concrete deployments, verifiable use cases | `["AWS formal verification", "Lean ecosystem"]` |

**Invariants:**
- `id` values must not change once added (external tooling will reference them).
- `descriptor` is **exactly one sentence**—no paragraphs, no multi-line text.
- `anchors` must name real systems, products, papers, or deployments; no generic categories ("used in industry").
- All nodes with the same branch and status exist; no dangling references.

### 2.2 Edge Schema

**Source of truth:** `ai-edges.yaml` (new file, created during Phase 2)

Each edge represents a typed relationship between two nodes.

| Field | Type | Constraint | Example |
|-------|------|-----------|---------|
| `source_id` | string | must exist in ai-nodes.yaml | `symbolic-gofai` |
| `target_id` | string | must exist in ai-nodes.yaml | `knowledge-representation` |
| `type` | enum | see §2.3.1 | `prerequisite` |
| `confidence` | float | 0.0–1.0; presence = human-curated or high-confidence | `0.95` |
| `source_ref` | string | Wikidata QID, paper DOI, URL, or "human-curate" | `Q202821` |
| `notes` | string | optional rationale for the relationship | `"KR needed for symbolic reasoning"` |

**Invariants:**
- No self-loops (source_id ≠ target_id).
- No duplicate (source_id, target_id, type) triples.
- No unknown node IDs in source_id or target_id.
- Edges are **directed** (A→B is distinct from B→A).

### 2.3 Branches (Closed Set)

The 11 branches are **immutable** and define the top-level taxonomy. No new branches may be added without spec revision.

| Branch | Purpose | Example nodes |
|--------|---------|----------------|
| `symbolic-gofai` | Rule-based, symbolic AI | Knowledge representation, logic programming |
| `classical-ml` | Statistical, pre-deep-learning | Linear regression, SVM, decision trees |
| `deep-learning` | Neural networks, representation learning | CNN, LSTM, transformer |
| `reinforcement-learning` | Agents, reward maximization | Q-learning, policy gradient, MCTS |
| `hybrid-neurosymbolic` | Combining symbolic + neural | Neurosymbolic reasoning, semantic parsing |
| `substrate-statistics` | Probability, inference | Bayesian inference, Markov chains |
| `substrate-optimization` | Numerical optimization | Gradient descent, convex optimization |
| `substrate-information-theory` | Information, entropy, coding | KL divergence, mutual information |
| `substrate-signal-processing` | Fourier, wavelets, filtering | FFT, signal decomposition |
| `information-retrieval-recommenders` | Search, ranking, filtering | BM25, collaborative filtering, ranking |
| `cross-cutting` | Concepts that span multiple branches | Attention, scaling, few-shot learning |

### 2.3.1 Edge Types (Closed Set)

Six relationship types, immutable. No new types without spec revision.

| Type | Meaning | Direction | Example |
|------|---------|-----------|---------|
| `prerequisite` | A must be understood before B | A→B | Calculus→Deep learning |
| `descendant-of` | B is an evolution/refinement of A | A→B | Perceptron→Transformer |
| `historical-influence` | A influenced B historically (not strict dependency) | A→B | Boltzmann machines→RBMs |
| `substrate-of` | A is a mathematical/computational substrate for B | A→B | Linear algebra→Neural networks |
| `uses` | B directly applies A in its implementation | A→B | Gradient descent→SGD |
| `composes` | A is a component/module of B | A→B | Attention→Transformer |

---

## 3. Storage Model

### 3.1 Canonical Store: Kùzu

**Kùzu** (embedded graph database) is the canonical storage layer.

- **Language:** Node.js bindings (confirmed working, see Task 1.2 validation).
- **Schema:** Defined in `schema/graph.cypher` (see Task 1.3).
- **Role:** Single source of truth for graph topology, enabling efficient queries and version control.

**Design rationale:**
- YAML is human-friendly for editing; Kùzu is machine-friendly for queries.
- Kùzu is embedded (no external service), lightweight for small catalogs (165 nodes × 500 edges).
- The project commits YAML sources; the build artifact (Kùzu DB) is transient.

### 3.2 Authoring Layer: YAML

**Files:**
- `ai-nodes.yaml` — node definitions (existing, human-curated).
- `ai-edges.yaml` — edge definitions (created Phase 2, human-curated).

**Format:** YAML 1.2, following conventions in §2.

**Invariants:**
- YAML stays human-editable and version-controlled.
- All structural changes (new nodes, edges, statuses) land in YAML first.
- The Kùzu schema is derived from the YAML schema; YAML is the schema source.

### 3.3 Browser Artifact: JSON

**File:** `dist/data/graph.json` (generated at build time)

**Structure:**

```json
{
  "nodes": [
    {
      "id": "symbolic-gofai",
      "name": "Symbolic AI",
      "branch": "symbolic-gofai",
      "type": "framework",
      "status": "active",
      "degree": 12
    }
  ],
  "edges": [
    {
      "source": "symbolic-gofai",
      "target": "knowledge-representation",
      "type": "prerequisite",
      "confidence": 0.95
    }
  ],
  "metadata": {
    "timestamp": "2026-05-26T14:30:00Z",
    "total_nodes": 165,
    "total_edges": 500
  }
}
```

**Role:** Immutable snapshot consumed by the browser UI at load time. Replaces real-time YAML fetch.

---

## 4. Pipeline Contracts

### 4.1 Import: YAML → Kùzu

**Script:** `scripts/import-yaml.js`

**Input:** `ai-nodes.yaml`, `ai-edges.yaml`

**Output:** Kùzu database at `.kùzu/beyond-chatbot.kz` (transient, not committed)

**Validation:**
- All nodes parse as valid YAML.
- All nodes have required fields (id, name, branch, type, era, status, descriptor).
- All edge IDs (source_id, target_id) exist in the node catalog.
- No duplicate (source_id, target_id, type) edges.
- No self-loops.
- Branch and status enums are within the 11 branches and 5 statuses.

**Error handling:**
- On parse error: report filename, line number, and error message.
- On validation failure: report the offending node/edge and the reason, then exit with code 1.
- No partial imports; all-or-nothing.

### 4.2 Export: Kùzu → JSON

**Script:** `scripts/export-json.js`

**Input:** Kùzu database

**Output:** `dist/data/graph.json`

**Transformation:**
- Extract all nodes; add precomputed `degree` (count of incoming + outgoing edges per node).
- Extract all edges in (source, target, type, confidence) order.
- Include metadata (timestamp, total node/edge counts).

**Determinism:** For identical input, output must be byte-stable (same order, same formatting). Use stable sort on (source_id, target_id) for edges.

### 4.3 Round-trip: Kùzu → YAML

**Script:** `scripts/export-yaml.js`

**Input:** Kùzu database

**Output:** `ai-nodes.yaml`, `ai-edges.yaml` (write-back)

**Requirement:** `import → export → diff` produces no semantic change (comment preservation is a stretch goal).

**Use case:** Enables external tooling to update the graph programmatically while maintaining YAML as the human-facing source.

### 4.4 Build: npm run build

**Command:** `npm run build`

**Steps:**
1. Validate YAML syntax.
2. Run import-yaml.js (YAML → Kùzu).
3. Run export-json.js (Kùzu → JSON).
4. Emit `dist/data/graph.json`.

**Performance target:** <30 seconds on M-class laptop from clean checkout.

**Artifact:** `dist/data/graph.json` is the only artifact committed or deployed. The `.kùzu/` directory is transient and gitignored.

---

## 5. UI Invariants

### 5.1 Graph Visualization (graph.html)

**Library:** Cytoscape.js

**Data source:** `dist/data/graph.json` (fetched at load time)

**Default layout:** Force-directed (organic) with branch-clustering. See Task 3.1 for alternative (branch-sections).

**Node sizing:** `size = base + scale × log(degree+1) × status_weight`

- `base` = 30px
- `scale` = 15
- `status_weight`: { foundational: 1.3, active: 1.0, emerging: 0.9, legacy: 0.7, dormant: 0.6 }
- Resulting size range: ~30px (degree=0, dormant) to ~90px (degree=20+, foundational).

**Node coloring:** By branch (11-color palette, see Task 4.5).

**Labels:** Persistent for top-N central nodes (auto-promoted above degree threshold, typically 15–30 labels at default zoom).

**Filters:**
- Branch checkboxes (show/hide by branch).
- Edge type toggles (show/hide by relationship type).
- Filter state not persisted (session-only).

**Performance targets (Task 4.4):**
- Layout computation: <5 seconds at 500 edges.
- Pan/zoom: ≥60 fps.
- Memory usage: <50 MB in-browser.

### 5.2 Curation UI (curate.html)

**Purpose:** Accept/reject/edit candidate edges before they merge into `ai-edges.yaml`.

**Workflow:**
1. Show one candidate edge at a time.
2. Display both nodes' full details + anchors.
3. Show provenance (source_ref: Wikidata QID, paper, URL, or "human").
4. Buttons: Accept / Reject / Edit (modify source_ref, notes, confidence).
5. On Accept: append to ai-edges.yaml.

**Invariants:**
- No innerHTML on dynamic content (XSS prevention).
- User can curate 20 edges in <10 minutes.
- Accepted edges appear in the main graph after reload.

### 5.3 Data Display

**Node details view:** Show all fields (id, name, aliases, era, status, descriptor, anchors).

**Edge details view:** Show source, target, type, confidence, source_ref, notes.

**No hard-coded** node/edge limits in the UI; scale linearly to 1000+ nodes.

---

## 6. Quality Bars

### 6.1 Data Quality

| Criterion | Target | Validation |
|-----------|--------|-----------|
| **Nodes** | 165 curated, no duplicates | YAML parse + import validation |
| **Edges (Phase 2 target)** | ≥110 curated edges | Validator script, no duplicates |
| **Edge type distribution** | No single type >50% | Edge distribution audit in spec |
| **Orphan avoidance** | All branches represented in edges | Audit per branch |
| **Anchor verification** | Spot-check 10% of anchors (real systems/papers) | Manual verification |

### 6.2 Code Quality

| Criterion | Target | Validation |
|-----------|--------|-----------|
| **Import validation** | Rejects malformed input with line numbers | Unit tests with synthetic bad input |
| **Export determinism** | Byte-stable JSON for identical input | Diff test (import → export → diff) |
| **Round-trip fidelity** | No semantic change in YAML rewrite | Import → export → diff check |
| **Build time** | <30s from clean | `npm run build` benchmark |

### 6.3 UI Quality

| Criterion | Target | Validation |
|-----------|--------|-----------|
| **Layout time** | <5s at 500 edges | Profiling at Task 4.4 |
| **Responsiveness** | ≥60 fps pan/zoom | Frame-rate monitoring |
| **Contrast (WCAG AA)** | All branch colors on dark bg + text overlay | Color audit, Task 4.5 |
| **Load time** | ≤2s (JSON fetch + render) | Performance audit |

---

## 7. Open Invariants & Decisions

These are **locked decisions** that cannot be changed without spec revision:

1. **Edge schema:** Six types only (prerequisite, descendant-of, historical-influence, substrate-of, uses, composes). No new types.
2. **Branches:** 11 fixed branches. No new branches.
3. **Authorship:** Humans edit `ai-nodes.yaml` and `ai-edges.yaml`. Kùzu and JSON are build artifacts.
4. **Commits:** No `Co-Authored-By` trailers (see CLAUDE.md).
5. **Candidates never auto-merge:** All edge candidates from bulk-seed or LLM-densify require human approval before landing in `ai-edges.yaml`.

---

## 8. Success Criteria (Phase 1)

By end of Phase 1:

- [x] This spec exists and is referenced by all downstream tasks.
- [ ] Kùzu validated as actively maintained with working Node.js bindings (Task 1.2).
- [ ] Kùzu schema (DDL) applied cleanly (Task 1.3).
- [ ] 165 nodes imported without errors (Task 1.4).
- [ ] JSON export is deterministic (Task 1.5).
- [ ] Round-trip YAML export works semantically (Task 1.6).
- [ ] `npm run build` chains import + export in <30s (Task 1.7).
- [ ] `graph.html` loads JSON artifact, no js-yaml runtime dependency (Task 1.8).

---

## 9. Related Documents

- **Architecture:** See Plans.md (phase breakdown, task dependencies).
- **Node editing guide:** ai-nodes.yaml file header.
- **CLAUDE.md:** Project-level instructions (no `Co-Authored-By`, content-first focus).
- **README.md:** User-facing overview (to be updated in Phase 5).

---

## 10. Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-05-26 | 0.1.0 | Initial spec: data model, storage, pipeline, UI, quality bars. Phase 1 locked. |

