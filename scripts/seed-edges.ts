/**
 * seed-edges.ts
 * Bulk-seed typed edges from Wikidata for nodes with derivable QIDs.
 *
 * Two-phase approach:
 * Phase 1: For each node, search Wikidata for QID by name/aliases, cache results
 * Phase 2: Fetch P-statements for found QIDs, map properties to edge types,
 *          attempt to resolve target QIDs → nodes in our catalog
 *
 * Output: data/candidates/seed.yaml with high-confidence candidates + provenance
 *
 * Note: This script is I/O heavy and makes ~200 Wikidata API requests.
 * Expected runtime: 5-15 min on typical internet connection.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

interface Node {
  id: string;
  name: string;
  aliases?: string[];
}

interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
}

interface Candidate {
  source: string;
  target: string;
  type: "substrate-of" | "composes" | "historical-influence";
  notes: string;
  provenance: string;
}

const CANDIDATES_DIR = path.join(process.cwd(), "data", "candidates");

// Wikidata property → our edge-type mapping
// More inclusive mapping to maximize candidate discovery in bulk-seed phase.
// (Task 2.3 validates; Task 2.5 curates; humans are the final filter.)
const PROPERTY_MAPPING: Record<string, "substrate-of" | "composes" | "historical-influence"> = {
  P279: "substrate-of",   // subclass of
  P31: "substrate-of",    // instance of (a technique IS-A method)
  P1647: "substrate-of",  // subproperty of
  P527: "composes",       // has part
  P361: "composes",       // part of (reverse semantics: A part-of B = A composed-by B, flipping back → composes)
  P155: "historical-influence", // follows
  P156: "historical-influence", // followed by
  P144: "historical-influence", // based on
  P425: "historical-influence", // inception (approximates "founded/created by")
};

const PROPERTY_LABELS: Record<string, string> = {
  P279: "subclass of",
  P1647: "subproperty of",
  P527: "has part",
  P155: "follows",
  P156: "followed by",
  P144: "based on",
};

// Delay between API calls (ms) to respect Wikidata rate limits
const API_DELAY_MS = 150;

/**
 * Fetch JSON from Wikidata API with error handling and timeout.
 */
async function fetchJson(url: string): Promise<Record<string, any> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) return null;
      return (await resp.json()) as Record<string, any>;
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return null;
  }
}

/**
 * Search Wikidata for a QID matching the given label.
 */
async function searchWikidataQID(label: string): Promise<string | null> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", label);
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const data = await fetchJson(url.toString());
  if (!data?.search?.[0]) return null;

  const match = data.search[0] as WikidataSearchResult;
  // Filter by domain: only accept results with CS/AI/math descriptions
  const desc = (match.description || "").toLowerCase();
  const csKeywords = [
    "algorithm", "method", "artificial intelligence", "machine learning",
    "statistical", "computer science", "programming", "neural", "optimization",
    "inference", "learning", "model", "classifier", "estimation",
  ];
  const isRelevant = csKeywords.some(kw => desc.includes(kw));

  return isRelevant ? match.id : null;
}

/**
 * Fetch a Wikidata entity's properties.
 */
async function fetchWikidataEntity(qid: string): Promise<Record<string, any> | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const data = await fetchJson(url);
  return data?.entities?.[qid] || null;
}

/**
 * Extract the English label for a Wikidata QID (cached to avoid double-fetches).
 */
const labelCache: Map<string, string> = new Map();

async function getWikidataLabel(qid: string): Promise<string | null> {
  if (labelCache.has(qid)) return labelCache.get(qid) || null;

  const entity = await fetchWikidataEntity(qid);
  const label = entity?.labels?.en?.value || null;
  labelCache.set(qid, label);
  return label;
}

/**
 * Fuzzy match: attempt to match a Wikidata label to one of our nodes.
 * Strategy: try exact match, then substring match, then word-overlap match.
 */
function fuzzyMatchLabel(
  wikidataLabel: string,
  nodeNames: { id: string; name: string; aliases: string[] }[]
): string | null {
  const wikiNorm = wikidataLabel.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const wikiWords = wikiNorm.split(/\s+/).filter(w => w.length > 0);

  for (const node of nodeNames) {
    const allLabels = [node.name, ...node.aliases];
    for (const label of allLabels) {
      const nodeNorm = label.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const nodeWords = nodeNorm.split(/\s+/).filter(w => w.length > 0);

      // 1. Exact match
      if (wikiNorm === nodeNorm) return node.id;

      // 2. Substring match (one is contained in the other)
      if (wikiNorm.includes(nodeNorm) || nodeNorm.includes(wikiNorm)) return node.id;

      // 3. Prefix match (first 3+ chars match, helpful for abbreviations/variations)
      if (nodeNorm.length >= 3 && wikiNorm.length >= 3) {
        const minLen = Math.min(nodeNorm.length, wikiNorm.length);
        if (nodeNorm.substring(0, minLen) === wikiNorm.substring(0, minLen)) return node.id;
      }

      // 4. Word overlap: if >50% of words match, it's likely the same concept
      if (nodeWords.length > 0 && wikiWords.length > 0) {
        const common = wikiWords.filter(w => nodeWords.includes(w)).length;
        const total = Math.max(nodeWords.length, wikiWords.length);
        if (common / total >= 0.5) return node.id;
      }
    }
  }

  return null;
}

/**
 * Main execution.
 */
async function main() {
  console.log("📂 Loading ai-nodes.yaml...");
  const nodesYaml = yaml.load(fs.readFileSync("ai-nodes.yaml", "utf8")) as {
    nodes: Node[];
  };
  const nodes = nodesYaml.nodes;
  const nodeMetadata = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    aliases: n.aliases || [],
  }));

  console.log(`✓ Loaded ${nodes.length} nodes\n`);
  fs.mkdirSync(CANDIDATES_DIR, { recursive: true });

  // ---- Phase 1: QID lookup ----
  console.log("🔍 Phase 1: Searching for Wikidata QIDs...\n");
  const qidByNodeId: Map<string, string> = new Map();
  let found = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const labels = [node.name, ...(node.aliases || [])];

    process.stdout.write(`[${i + 1}/${nodes.length}] ${node.id.padEnd(30)} `);

    // Try primary name first, then aliases
    let qid: string | null = null;
    for (const label of labels) {
      qid = await searchWikidataQID(label);
      if (qid) break;
      await new Promise((r) => setTimeout(r, API_DELAY_MS));
    }

    if (qid) {
      console.log(`✓ ${qid}`);
      qidByNodeId.set(node.id, qid);
      found++;
    } else {
      console.log("—");
    }

    await new Promise((r) => setTimeout(r, API_DELAY_MS));
  }

  console.log(`\n✓ Found QIDs for ${found}/${nodes.length} nodes\n`);

  // ---- Phase 2: Property extraction ----
  console.log("📊 Phase 2: Fetching properties and mapping edges...\n");
  const allCandidates: Candidate[] = [];

  for (const [nodeId, qid] of qidByNodeId) {
    process.stdout.write(`${nodeId.padEnd(30)} `);

    const entity = await fetchWikidataEntity(qid);
    if (!entity?.claims) {
      console.log("(no claims)");
      await new Promise((r) => setTimeout(r, API_DELAY_MS));
      continue;
    }

    const claims = entity.claims;
    let extracted = 0;

    // For each mapped property, extract target QIDs and try to resolve to nodes
    for (const [prop, statements] of Object.entries(claims)) {
      const edgeType = PROPERTY_MAPPING[prop];
      if (!edgeType) continue;

      for (const stmt of statements as any[]) {
        const targetQid = stmt.mainsnak?.datavalue?.value?.id;
        if (!targetQid) continue;

        // Avoid self-loops
        if (targetQid === qid) continue;

        // Fetch label of target and fuzzy-match against our nodes
        const targetLabel = await getWikidataLabel(targetQid);
        if (!targetLabel) continue;

        const targetNodeId = fuzzyMatchLabel(targetLabel, nodeMetadata);
        if (!targetNodeId || targetNodeId === nodeId) continue;

        allCandidates.push({
          source: nodeId,
          target: targetNodeId,
          type: edgeType,
          notes: `From Wikidata: ${PROPERTY_LABELS[prop] || prop}. Target: ${targetLabel}`,
          provenance: `Wikidata:${qid} [${prop}] → ${targetQid}`,
        });
        extracted++;
      }

      await new Promise((r) => setTimeout(r, API_DELAY_MS / 2));
    }

    console.log(`(+${extracted})`);
    await new Promise((r) => setTimeout(r, API_DELAY_MS));
  }

  console.log(`\n✓ Extracted ${allCandidates.length} candidate edges\n`);

  // ---- Write outputs ----
  const candidatesFile = path.join(CANDIDATES_DIR, "seed.yaml");
  const candidatesYaml = yaml.dump({ edges: allCandidates });
  fs.writeFileSync(candidatesFile, candidatesYaml);
  console.log(`✓ Wrote ${allCandidates.length} edges to ${candidatesFile}`);

  // Summary by type
  const byType = {
    "substrate-of": allCandidates.filter((c) => c.type === "substrate-of").length,
    composes: allCandidates.filter((c) => c.type === "composes").length,
    "historical-influence": allCandidates.filter((c) => c.type === "historical-influence").length,
  };
  console.log("\n📊 Candidates by type:");
  for (const [type, count] of Object.entries(byType)) {
    console.log(`   ${type.padEnd(25)} ${count}`);
  }

  if (allCandidates.length < 50) {
    console.warn(
      `\n⚠️  Only ${allCandidates.length} candidates (DoD requires ≥50).`
    );
    process.exit(1);
  }

  console.log(`\n✅ Seed edges script complete!`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
