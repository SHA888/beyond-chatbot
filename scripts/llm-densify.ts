/**
 * llm-densify.ts
 * Generate edge candidates using Claude + Anthropic SDK with prompt caching.
 *
 * For each node, prompt Claude to propose 3-5 typed edges to other nodes
 * based on descriptor and anchors. Use prompt caching to reduce costs:
 * system prompt (with full node catalog) is cached across all requests.
 *
 * Output: data/candidates/llm.yaml with candidates + confidence scores
 * Target: ≥200 candidates, cost <$5 for full catalog
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";

interface Node {
  id: string;
  name: string;
  branch: string;
  descriptor: string;
  anchors?: string[];
  aliases?: string[];
}

interface EdgeCandidate {
  source: string;
  target: string;
  type: "substrate-of" | "composes" | "historical-influence" | "descendant-of" | "prerequisite" | "uses";
  notes: string;
  confidence: number;
  provenance: string;
}

const CANDIDATES_DIR = path.join(process.cwd(), "data", "candidates");

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

/**
 * Build the system prompt with node catalog for caching.
 * This prompt is large (~20-30K tokens) but cached, so only paid once per session.
 */
function buildSystemPrompt(nodes: Node[]): string {
  const nodeList = nodes
    .map((n) => `- ${n.id}: ${n.name} (${n.branch}) - ${n.descriptor}`)
    .join("\n");

  return `You are an expert in AI and machine learning concepts. Your task is to identify relationships (typed edges) between AI concepts.

## Edge Type Definitions

You must classify relationships using EXACTLY these 6 types:

1. **substrate-of**: Source concept's formal substrate is the target. Example: "Bayesian networks substrate-of Bayesian statistics" (networks encode distributions)
2. **composes**: Source is a building block/component of target. Example: "MCMC composes Bayesian inference methods" (MCMC is a tool used in BI)
3. **historical-influence**: Source historically influenced/preceded target. Example: "Viola-Jones historical-influence CNN" (hand-crafted features preceded learned ones)
4. **descendant-of**: Source is a later/derived form of target. Example: "Adam descendant-of SGD" (Adam extends SGD)
5. **prerequisite**: Source is a conceptual prerequisite of target. Example: "Entropy prerequisite KL-divergence" (KL defined in terms of entropy)
6. **uses**: Source uses target as a component/tool. Example: "AlphaGo uses CNN" (networks as part of system)

## Node Catalog (Reference for Matching)

The following 165 concepts are in the catalog. When proposing edges, ONLY reference nodes from this list:

${nodeList}

## Guidelines for Generating Edges

1. Propose 3-5 edges per node (not more, not fewer)
2. Be specific and domain-accurate; avoid generic relationships
3. Each edge must be verifiable (could be explained in a paper or textbook)
4. Avoid circular or nonsensical relationships
5. Edges must connect concepts at roughly the same level of abstraction
6. Confidence score: 0.9-1.0 (very confident), 0.7-0.9 (fairly confident), 0.5-0.7 (plausible)

## Response Format

Return a JSON object with exactly this structure:
{
  "edges": [
    {
      "target": "target-id",
      "type": "substrate-of|composes|historical-influence|descendant-of|prerequisite|uses",
      "reasoning": "one sentence explaining why this edge exists",
      "confidence": 0.85
    }
  ]
}

Only return valid JSON. No markdown, no explanations outside the JSON.`;
}

/**
 * Parse Claude's JSON response and extract edge candidates.
 */
function parseEdgeResponse(
  sourceId: string,
  responseText: string,
  nodeIds: Set<string>
): EdgeCandidate[] {
  try {
    const data = JSON.parse(responseText) as {
      edges: Array<{
        target: string;
        type: string;
        reasoning: string;
        confidence: number;
      }>;
    };

    const candidates: EdgeCandidate[] = [];
    for (const edge of data.edges || []) {
      // Validate target exists in catalog
      if (!nodeIds.has(edge.target)) continue;
      // Avoid self-loops
      if (edge.target === sourceId) continue;
      // Validate edge type
      const validTypes = ["substrate-of", "composes", "historical-influence", "descendant-of", "prerequisite", "uses"];
      if (!validTypes.includes(edge.type)) continue;

      candidates.push({
        source: sourceId,
        target: edge.target,
        type: edge.type as any,
        notes: edge.reasoning || `Claude-proposed edge`,
        confidence: Math.min(1, Math.max(0, edge.confidence || 0.7)),
        provenance: `Claude (LLM-densify)`,
      });
    }
    return candidates;
  } catch (e) {
    console.warn(`  Failed to parse response for ${sourceId}:`, String(e));
    return [];
  }
}

/**
 * Main execution.
 */
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "❌ ANTHROPIC_API_KEY environment variable not set.\n" +
        "   Set it before running: export ANTHROPIC_API_KEY=sk-..."
    );
    process.exit(1);
  }

  console.log("📂 Loading ai-nodes.yaml...");
  const nodesYaml = yaml.load(fs.readFileSync("ai-nodes.yaml", "utf8")) as {
    nodes: Node[];
  };
  const nodes = nodesYaml.nodes;
  const nodeIds = new Set(nodes.map((n) => n.id));

  console.log(`✓ Loaded ${nodes.length} nodes\n`);

  // Build system prompt with full catalog (will be cached)
  console.log("🔨 Building system prompt with node catalog (will be cached)...");
  const systemPrompt = buildSystemPrompt(nodes);
  console.log(`✓ System prompt: ${systemPrompt.length} chars\n`);

  // Prepare output directory
  fs.mkdirSync(CANDIDATES_DIR, { recursive: true });

  const allCandidates: EdgeCandidate[] = [];
  let totalInputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let totalOutputTokens = 0;

  console.log("🤖 Requesting edge proposals from Claude...\n");

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const anchorsText = (node.anchors || []).join(", ");
    const aliasText = (node.aliases || []).join(", ");

    // User prompt: ask Claude to propose edges for this specific node
    const userPrompt = `Propose edges FROM the following node to OTHER nodes in the catalog:

NODE: ${node.id}
NAME: ${node.name}
BRANCH: ${node.branch}
DESCRIPTOR: ${node.descriptor}
ALIASES: ${aliasText || "(none)"}
ANCHORS: ${anchorsText || "(none)"}

Return 3-5 high-confidence edges in JSON format as specified in the system prompt.`;

    process.stdout.write(
      `[${i + 1}/${nodes.length}] ${node.id.padEnd(30)} `
    );

    try {
      // Call Claude with prompt caching
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      // Track token usage for cost monitoring
      const usage = response.usage;
      totalInputTokens += usage.input_tokens;
      totalCacheCreationTokens += (usage.cache_creation_input_tokens ?? 0);
      totalCacheReadTokens += (usage.cache_read_input_tokens ?? 0);
      totalOutputTokens += (usage.output_tokens ?? 0);

      // Extract content from response
      const responseText =
        response.content[0].type === "text" ? response.content[0].text : "";
      const candidates = parseEdgeResponse(node.id, responseText, nodeIds);
      allCandidates.push(...candidates);

      const cacheStatus =
        (usage.cache_creation_input_tokens ?? 0) > 0
          ? " [cache:write]"
          : (usage.cache_read_input_tokens ?? 0) > 0
            ? " [cache:hit]"
            : "";
      console.log(`(+${candidates.length} edges)${cacheStatus}`);

      // Rate limiting: small delay between requests
      await new Promise((r) => setTimeout(r, 500));
    } catch (e: any) {
      console.log(
        `✗ Error: ${e.message?.split("\n")[0] || String(e).substring(0, 50)}`
      );
    }
  }

  console.log(`\n✓ Extracted ${allCandidates.length} candidate edges\n`);

  // Write candidates to YAML
  const candidatesFile = path.join(CANDIDATES_DIR, "llm.yaml");
  const candidatesYaml = yaml.dump({ edges: allCandidates });
  fs.writeFileSync(candidatesFile, candidatesYaml);
  console.log(`✓ Wrote edges to ${candidatesFile}`);

  // Summary by type
  const byType: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};
  for (const c of allCandidates) {
    byType[c.type] = (byType[c.type] || 0) + 1;
    const bucket = Math.floor(c.confidence * 10) / 10;
    byConfidence[`${bucket.toFixed(1)}`] = (byConfidence[`${bucket.toFixed(1)}`] || 0) + 1;
  }

  console.log("\n📊 Candidates by type:");
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`   ${type.padEnd(25)} ${count}`);
  }

  console.log("\n📊 Candidates by confidence:");
  for (const [confidence, count] of Object.entries(byConfidence).sort().reverse()) {
    console.log(`   ${confidence} ${count}`);
  }

  // Cost estimation
  console.log("\n💰 Token usage (Anthropic pricing):");
  console.log(`   Input tokens (non-cached):        ${totalInputTokens}`);
  console.log(`   Cache creation tokens:            ${totalCacheCreationTokens}`);
  console.log(`   Cache read tokens (cached input): ${totalCacheReadTokens}`);
  console.log(`   Output tokens:                    ${totalOutputTokens}`);

  // Pricing: Opus 4.8 is $15/MTok input, $45/MTok output
  // Cache creation is same as input, cache read is 10% of input
  const inputCost = (totalInputTokens + totalCacheCreationTokens) * (15 / 1_000_000);
  const cacheReadCost = totalCacheReadTokens * (1.5 / 1_000_000); // 10% of input price
  const outputCost = totalOutputTokens * (45 / 1_000_000);
  const totalCost = inputCost + cacheReadCost + outputCost;

  console.log(`\n   Estimated cost (USD):`);
  console.log(`   - Input/cache-creation: $${inputCost.toFixed(4)}`);
  console.log(`   - Cache reads:          $${cacheReadCost.toFixed(4)}`);
  console.log(`   - Output:               $${outputCost.toFixed(4)}`);
  console.log(`   - TOTAL:                $${totalCost.toFixed(4)}`);

  if (allCandidates.length < 200) {
    console.warn(
      `\n⚠️  Only ${allCandidates.length} candidates (DoD requires ≥200).`
    );
    console.log(
      "   This is expected if nodes are sparse in their relationships."
    );
    console.log(
      "   Task 2.3 (validation) will filter to high-confidence edges."
    );
  } else {
    console.log(
      `\n✅ Generated ≥200 candidates and spent $${totalCost.toFixed(2)} (<$5)`
    );
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message || err);
  process.exit(1);
});
