#!/usr/bin/env node

/**
 * LadybugDB → YAML exporter (round-trip)
 * Reads graph from LadybugDB, writes back ai-nodes.yaml + ai-edges.yaml
 * Proves round-trip: import → export → diff produces no semantic diff
 *
 * Exit codes:
 *   0 = success
 *   1 = DB open/query error
 *   2 = write error
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load LadybugDB or mock implementation
async function loadDatabase() {
  try {
    return (await import('@ladybugdb/core')).default;
  } catch (e) {
    console.warn('⚠️  LadybugDB native binaries not available, using mock database');
    return (await import('./db-mock.js')).default;
  }
}

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
  source: string;
  target: string;
  type: string;
  confidence?: number;
  source_ref?: string;
  notes?: string;
}

async function exportYaml(): Promise<void> {
  try {
    // Load database implementation (real or mock)
    const lbug = await loadDatabase();

    const projectRoot = path.resolve(__dirname, '../../');
    const dbPath = path.join(projectRoot, '.ladybugdb');
    const nodesFile = path.join(projectRoot, 'ai-nodes.yaml');
    const edgesFile = path.join(projectRoot, 'ai-edges.yaml');

    console.log('📂 Opening LadybugDB...');
    const db = new lbug.Database(dbPath);
    const conn = new lbug.Connection(db);

    await conn.init();
    console.log('✓ Connected to database');

    // Query all nodes
    console.log('📊 Extracting nodes...');
    const nodeQueryResult = await conn.query(
      'MATCH (n:Node) RETURN n.id AS id, n.name AS name, n.aliases AS aliases, n.branch AS branch, n.type AS type, n.era AS era, n.status AS status, n.descriptor AS descriptor, n.anchors AS anchors'
    );
    const nodeResult = Array.isArray(nodeQueryResult) ? nodeQueryResult[0] : nodeQueryResult;
    const dbNodes = await nodeResult.getAll();
    console.log(`   ✓ Found ${dbNodes.length} nodes`);

    // Query all edges
    console.log('📊 Extracting edges...');
    const edgeQueryResult = await conn.query(
      'MATCH (s:Node)-[e:Edge]->(t:Node) RETURN s.id AS source, t.id AS target, e.type AS type, e.confidence AS confidence, e.source_ref AS source_ref, e.notes AS notes'
    );
    const edgeResult = Array.isArray(edgeQueryResult) ? edgeQueryResult[0] : edgeQueryResult;
    const dbEdges = await edgeResult.getAll();
    console.log(`   ✓ Found ${dbEdges.length} edges`);

    // Read original ai-nodes.yaml to preserve order
    let originalNodeOrder: string[] = [];
    if (fs.existsSync(nodesFile)) {
      console.log('📂 Reading original ai-nodes.yaml for ordering...');
      const originalContent = fs.readFileSync(nodesFile, 'utf8');
      const originalData = yaml.load(originalContent) as any;
      if (originalData?.nodes) {
        originalNodeOrder = (originalData.nodes as any[]).map((n: any) => n.id);
        console.log(`   ✓ Original ordering: ${originalNodeOrder.length} nodes`);
      }
    }

    // Build nodes map from database
    const nodeMap = new Map<string, Node>();
    for (const dbNode of dbNodes) {
      const node: Node = {
        id: dbNode.id,
        name: dbNode.name,
        branch: dbNode.branch,
        type: dbNode.type,
        era: dbNode.era,
        status: dbNode.status,
        descriptor: dbNode.descriptor
      };

      // Only include optional fields if non-empty
      if (dbNode.aliases && Array.isArray(dbNode.aliases) && dbNode.aliases.length > 0) {
        node.aliases = dbNode.aliases;
      }
      if (dbNode.anchors && Array.isArray(dbNode.anchors) && dbNode.anchors.length > 0) {
        node.anchors = dbNode.anchors;
      }

      nodeMap.set(node.id, node);
    }

    // Sort nodes: preserve original order if available, otherwise sort by ID
    let exportNodes: Node[];
    if (originalNodeOrder.length > 0) {
      // Use original order, but append any new nodes at the end (sorted by ID)
      exportNodes = [];
      const exportedIds = new Set<string>();

      for (const id of originalNodeOrder) {
        if (nodeMap.has(id)) {
          exportNodes.push(nodeMap.get(id)!);
          exportedIds.add(id);
        }
      }

      // Append any new nodes not in original file
      const newNodeIds = Array.from(nodeMap.keys())
        .filter(id => !exportedIds.has(id))
        .sort();
      for (const id of newNodeIds) {
        exportNodes.push(nodeMap.get(id)!);
      }
    } else {
      // If no original file, sort by ID
      exportNodes = Array.from(nodeMap.values()).sort((a, b) => a.id.localeCompare(b.id));
    }

    // Build edges, sorted by (source, target, type)
    const exportEdges: Edge[] = dbEdges
      .map((edge: any) => {
        const edgeObj: Edge = {
          source: edge.source,
          target: edge.target,
          type: edge.type
        };

        // Only include optional fields if present and non-null
        if (edge.confidence !== null && edge.confidence !== undefined) {
          edgeObj.confidence = edge.confidence;
        }
        if (edge.source_ref !== null && edge.source_ref !== undefined) {
          edgeObj.source_ref = edge.source_ref;
        }
        if (edge.notes !== null && edge.notes !== undefined) {
          edgeObj.notes = edge.notes;
        }

        return edgeObj;
      })
      .sort((a, b) => {
        const sourceCompare = a.source.localeCompare(b.source);
        if (sourceCompare !== 0) return sourceCompare;
        const targetCompare = a.target.localeCompare(b.target);
        if (targetCompare !== 0) return targetCompare;
        return a.type.localeCompare(b.type);
      });

    // Write ai-nodes.yaml
    console.log('\n📝 Writing ai-nodes.yaml...');
    const nodesYaml = yaml.dump(
      { nodes: exportNodes },
      {
        indent: 2,
        lineWidth: -1
      }
    );
    fs.writeFileSync(nodesFile, nodesYaml, 'utf8');
    console.log(`   ✓ Wrote ${exportNodes.length} nodes`);

    // Write ai-edges.yaml if there are edges
    if (exportEdges.length > 0) {
      console.log('📝 Writing ai-edges.yaml...');
      const edgesYaml = yaml.dump(
        { edges: exportEdges },
        {
          indent: 2,
          lineWidth: -1
        }
      );
      fs.writeFileSync(edgesFile, edgesYaml, 'utf8');
      console.log(`   ✓ Wrote ${exportEdges.length} edges`);
    }

    await conn.close();
    await db.close();

    console.log('\n✓ Round-trip export complete!');
    console.log(`  • ${exportNodes.length} nodes written to ai-nodes.yaml`);
    console.log(`  • ${exportEdges.length} edges written to ai-edges.yaml`);

  } catch (error) {
    console.error(
      `\n❌ Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exportYaml().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { exportYaml };
