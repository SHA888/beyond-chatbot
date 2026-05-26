#!/usr/bin/env node

/**
 * LadybugDB → JSON exporter
 * Reads graph from LadybugDB, outputs immutable JSON artifact for browser
 *
 * Exit codes:
 *   0 = success
 *   1 = DB open/query error
 *   2 = write error
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

interface ExportNode {
  id: string;
  name: string;
  branch: string;
  type: string;
  status: string;
  degree: number;
}

interface ExportEdge {
  source: string;
  target: string;
  type: string;
  confidence?: number;
}

interface ExportMetadata {
  timestamp: string;
  total_nodes: number;
  total_edges: number;
}

interface ExportData {
  nodes: ExportNode[];
  edges: ExportEdge[];
  metadata: ExportMetadata;
}

async function exportJson(): Promise<void> {
  try {
    // Load database implementation (real or mock)
    const lbug = await loadDatabase();

    const projectRoot = path.resolve(__dirname, '../../');
    const dbPath = path.join(projectRoot, '.ladybugdb');
    const outputDir = path.join(projectRoot, 'dist/data');
    const outputFile = path.join(outputDir, 'graph.json');

    console.log('📂 Opening LadybugDB...');
    const db = new lbug.Database(dbPath);
    const conn = new lbug.Connection(db);

    await conn.init();
    console.log('✓ Connected to database');

    // Query all nodes
    console.log('📊 Extracting nodes...');
    const nodeQueryResult = await conn.query(
      'MATCH (n:Node) RETURN n.id AS id, n.name AS name, n.branch AS branch, n.type AS type, n.status AS status'
    );
    const nodeResult = Array.isArray(nodeQueryResult) ? nodeQueryResult[0] : nodeQueryResult;
    const nodes = await nodeResult.getAll();
    console.log(`   ✓ Found ${nodes.length} nodes`);

    // Query all edges with calculated degrees
    console.log('📊 Extracting edges...');
    const edgeQueryResult = await conn.query(
      'MATCH (s:Node)-[e:Edge]->(t:Node) RETURN s.id AS source, t.id AS target, e.type AS type, e.confidence AS confidence'
    );
    const edgeResult = Array.isArray(edgeQueryResult) ? edgeQueryResult[0] : edgeQueryResult;
    const edges = await edgeResult.getAll();
    console.log(`   ✓ Found ${edges.length} edges`);

    // Calculate degrees
    const degreeMap = new Map<string, number>();
    for (const node of nodes) {
      degreeMap.set(node.id as string, 0);
    }
    for (const edge of edges) {
      const source = edge.source as string;
      const target = edge.target as string;
      degreeMap.set(source, (degreeMap.get(source) || 0) + 1);
      degreeMap.set(target, (degreeMap.get(target) || 0) + 1);
    }

    // Build export nodes with degrees
    const exportNodes: ExportNode[] = nodes
      .map((node: Record<string, any>) => ({
        id: node.id,
        name: node.name,
        branch: node.branch,
        type: node.type,
        status: node.status,
        degree: degreeMap.get(node.id) || 0
      }))
      .sort((a: ExportNode, b: ExportNode) => a.id.localeCompare(b.id));

    // Build export edges, sorted by (source, target)
    const exportEdges: ExportEdge[] = edges
      .map((edge: Record<string, any>) => ({
        source: edge.source,
        target: edge.target,
        type: edge.type,
        ...(edge.confidence !== null && { confidence: edge.confidence })
      }))
      .sort((a: ExportEdge, b: ExportEdge) => {
        const sourceCompare = a.source.localeCompare(b.source);
        return sourceCompare !== 0 ? sourceCompare : a.target.localeCompare(b.target);
      });

    // Build metadata
    const metadata: ExportMetadata = {
      timestamp: new Date().toISOString(),
      total_nodes: exportNodes.length,
      total_edges: exportEdges.length
    };

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write JSON with stable formatting (2-space indent, consistent ordering)
    const data: ExportData = {
      nodes: exportNodes,
      edges: exportEdges,
      metadata
    };

    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`\n✓ Exported to ${outputFile}`);
    console.log(`  • ${exportNodes.length} nodes`);
    console.log(`  • ${exportEdges.length} edges`);

    // Close connection
    await conn.close();
    await db.close();

  } catch (error) {
    console.error(
      `\n❌ Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exportJson().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { exportJson };
