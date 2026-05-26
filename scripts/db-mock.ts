/**
 * Mock LadybugDB implementation for development/testing
 * Provides file-persisted JSON database compatible with @ladybugdb/core interface
 *
 * Note: This is a temporary implementation. In production, replace with actual LadybugDB
 * binary when native bindings are available for the target platform.
 */

import fs from 'fs';
import path from 'path';

interface MockNode {
  [key: string]: any;
}

interface MockEdge {
  [key: string]: any;
}

interface MockDatabaseFile {
  nodes: Record<string, MockNode>;
  edges: Array<{ source: string; target: string; data: MockEdge }>;
}

function getOrCreateStorePath(dbPath?: string): string {
  if (!dbPath) return ':memory:';
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }
  return path.join(dbPath, 'data.json');
}

function loadDatabaseFile(storePath: string): MockDatabaseFile {
  if (storePath === ':memory:') {
    return { nodes: {}, edges: [] };
  }
  if (fs.existsSync(storePath)) {
    const content = fs.readFileSync(storePath, 'utf8');
    return JSON.parse(content);
  }
  return { nodes: {}, edges: [] };
}

function saveDatabaseFile(storePath: string, data: MockDatabaseFile): void {
  if (storePath === ':memory:') return;
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
}

export class MockDatabase {
  private storePath: string;
  private data: MockDatabaseFile;

  constructor(dbPath?: string) {
    this.storePath = getOrCreateStorePath(dbPath);
    this.data = loadDatabaseFile(this.storePath);
  }

  async close(): Promise<void> {
    // Save data on close
    saveDatabaseFile(this.storePath, this.data);
  }

  closeSync(): void {
    saveDatabaseFile(this.storePath, this.data);
  }

  async init(): Promise<void> {
    // No-op
  }

  initSync(): void {
    // No-op
  }

  getData(): MockDatabaseFile {
    return this.data;
  }

  setData(data: MockDatabaseFile): void {
    this.data = data;
  }
}

export class MockConnection {
  private db: any;
  private data: MockDatabaseFile;

  constructor(db: any) {
    this.db = db;
    this.data = db.getData ? db.getData() : { nodes: {}, edges: [] };
  }

  async init(): Promise<void> {
    // No-op
  }

  initSync(): void {
    // No-op
  }

  async close(): Promise<void> {
    // Save data when connection closes
    this.db.setData(this.data);
    await this.db.close();
  }

  closeSync(): void {
    this.db.setData(this.data);
    this.db.closeSync();
  }

  async query(statement: string): Promise<MockQueryResult | MockQueryResult[]> {
    return this.executeQuery(statement);
  }

  querySync(statement: string): MockQueryResult | MockQueryResult[] {
    return this.executeQuery(statement);
  }

  private executeQuery(statement: string): MockQueryResult | MockQueryResult[] {
    const trimmed = statement.trim();

    // Handle CREATE node - extract JSON object
    if (trimmed.includes('CREATE (n:Node {') && trimmed.includes('})')) {
      try {
        // Find the JSON object between the curly braces
        const startIdx = trimmed.indexOf('{');
        const endIdx = trimmed.lastIndexOf('}');
        if (startIdx >= 0 && endIdx > startIdx) {
          const jsonStr = trimmed.substring(startIdx, endIdx + 1);
          // Try to parse as JavaScript object literal and convert to JSON
          const node = this.parseNodeObject(jsonStr);
          if (node && node.id) {
            this.data.nodes[node.id] = node;
          }
        }
      } catch (e) {
        // Silently fail for malformed nodes
      }
      return new MockQueryResult([]);
    }

    // Handle CREATE edge (MATCH + CREATE pattern)
    if (trimmed.includes('MATCH') && trimmed.includes('CREATE (s)') || trimmed.includes('CREATE (s)-[e:Edge')) {
      const sourceMatch = trimmed.match(/MATCH \(s:Node \{id: "([^"]+)"\}\)/);
      const targetMatch = trimmed.match(/\(t:Node \{id: "([^"]+)"\}\)/);

      if (sourceMatch && targetMatch) {
        const source = sourceMatch[1];
        const target = targetMatch[1];

        // Find the edge properties object
        const edgeStart = trimmed.indexOf('[e:Edge {');
        const edgeEnd = trimmed.indexOf('}]', edgeStart);
        if (edgeStart >= 0 && edgeEnd > edgeStart) {
          try {
            const edgeObjStr = trimmed.substring(edgeStart + 9, edgeEnd + 1);
            const edgeData = this.parseEdgeObject(edgeObjStr);
            this.data.edges.push({ source, target, data: edgeData });
          } catch (e) {
            // Silently fail for malformed edges
          }
        }
      }
      return new MockQueryResult([]);
    }

    // Handle MATCH nodes
    if (trimmed.startsWith('MATCH (n:Node)')) {
      const results = Object.values(this.data.nodes);
      return new MockQueryResult(results);
    }

    // Handle MATCH edges
    if (trimmed.includes('MATCH (s:Node)-[e:Edge]->(t:Node)')) {
      const results = this.data.edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        ...edge.data
      }));
      return new MockQueryResult(results);
    }

    // Handle schema statements (CREATE INDEX, etc)
    if (trimmed.startsWith('CREATE INDEX') || trimmed.startsWith('CREATE CONSTRAINT')) {
      // Schema statements are ignored in mock - no schema enforcement
      return new MockQueryResult([]);
    }

    return new MockQueryResult([]);
  }

  private parseNodeObject(jsonStr: string): any {
    // Parse a JavaScript object literal (not valid JSON) into a JS object
    // This handles things like: { id: "value", aliases: [], key: null }
    const obj: any = {};

    // Extract key-value pairs
    const keyValuePattern = /(\w+)\s*:\s*([^,]*?)(?=,\s*\w+\s*:|$)/gs;
    let match;

    while ((match = keyValuePattern.exec(jsonStr)) !== null) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove trailing comma and whitespace
      value = value.replace(/,?\s*$/, '').trim();

      // Parse the value
      try {
        // Try JSON parsing first
        obj[key] = JSON.parse(value);
      } catch {
        // If JSON parse fails, try other interpretations
        if (value === 'null') {
          obj[key] = null;
        } else if (value === 'true') {
          obj[key] = true;
        } else if (value === 'false') {
          obj[key] = false;
        } else if (value.startsWith('"') && value.endsWith('"')) {
          // String value - unescape quotes
          obj[key] = value.slice(1, -1).replace(/\\"/g, '"');
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // Array - try JSON parse
          try {
            obj[key] = JSON.parse(value);
          } catch {
            obj[key] = [];
          }
        } else {
          // Treat as string
          obj[key] = value;
        }
      }
    }

    return obj;
  }

  private parseEdgeObject(jsonStr: string): any {
    // Similar to parseNodeObject, parse edge properties
    const obj: any = {};

    // Extract key-value pairs
    const keyValuePattern = /(\w+)\s*:\s*([^,]*?)(?=,\s*\w+\s*:|$)/gs;
    let match;

    while ((match = keyValuePattern.exec(jsonStr)) !== null) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove trailing comma and whitespace
      value = value.replace(/,?\s*$/, '').trim();

      // Parse the value
      try {
        // Try JSON parsing first
        obj[key] = JSON.parse(value);
      } catch {
        // If JSON parse fails, try other interpretations
        if (value === 'null') {
          obj[key] = null;
        } else if (value === 'true') {
          obj[key] = true;
        } else if (value === 'false') {
          obj[key] = false;
        } else if (value.startsWith('"') && value.endsWith('"')) {
          // String value - unescape quotes
          obj[key] = value.slice(1, -1).replace(/\\"/g, '"');
        } else if (!isNaN(Number(value))) {
          // Numeric value
          obj[key] = Number(value);
        } else {
          // Treat as string
          obj[key] = value;
        }
      }
    }

    return obj;
  }

  async prepare(_statement: string): Promise<MockPreparedStatement> {
    return new MockPreparedStatement(true, '');
  }

  prepareSync(_statement: string): MockPreparedStatement {
    return new MockPreparedStatement(true, '');
  }

  async execute(
    _statement: MockPreparedStatement,
    _params?: Record<string, any>
  ): Promise<MockQueryResult | MockQueryResult[]> {
    return new MockQueryResult([]);
  }

  executeSync(
    _statement: MockPreparedStatement,
    _params?: Record<string, any>
  ): MockQueryResult | MockQueryResult[] {
    return new MockQueryResult([]);
  }

  setMaxNumThreadForExec(_numThreads: number): void {
    // No-op
  }

  setQueryTimeout(_timeoutInMs: number): void {
    // No-op
  }
}

export class MockPreparedStatement {
  private success: boolean;
  private error: string;

  constructor(success: boolean, error: string) {
    this.success = success;
    this.error = error;
  }

  isSuccess(): boolean {
    return this.success;
  }

  getErrorMessage(): string {
    return this.error;
  }
}

export class MockQueryResult {
  private results: Array<Record<string, any>>;
  private index: number = 0;

  constructor(results: Array<Record<string, any>>) {
    this.results = results;
  }

  resetIterator(): void {
    this.index = 0;
  }

  hasNext(): boolean {
    return this.index < this.results.length;
  }

  getNumTuples(): number {
    return this.results.length;
  }

  async getNext(): Promise<Record<string, any> | null> {
    if (this.index < this.results.length) {
      return this.results[this.index++];
    }
    return null;
  }

  getNextSync(): Record<string, any> | null {
    if (this.index < this.results.length) {
      return this.results[this.index++];
    }
    return null;
  }

  async getAll(): Promise<Record<string, any>[]> {
    return this.results;
  }

  getAllSync(): Record<string, any>[] {
    return this.results;
  }

  async getColumnDataTypes(): Promise<string[]> {
    return [];
  }

  getColumnDataTypesSync(): string[] {
    return [];
  }

  async getColumnNames(): Promise<string[]> {
    return [];
  }

  getColumnNamesSync(): string[] {
    return [];
  }

  close(): void {
    // No-op
  }

  each(
    resultCallback: (row: Record<string, any>) => void,
    doneCallback: () => void,
    _errorCallback: (error: Error) => void
  ): void {
    for (const result of this.results) {
      resultCallback(result);
    }
    doneCallback();
  }

  all(
    resultCallback: (rows: Record<string, any>[]) => void,
    _errorCallback: (error: Error) => void
  ): void {
    resultCallback(this.results);
  }
}

export default {
  Database: MockDatabase,
  Connection: MockConnection,
  PreparedStatement: MockPreparedStatement,
  QueryResult: MockQueryResult,
  VERSION: '0.16.1-mock',
  STORAGE_VERSION: BigInt(1)
};
