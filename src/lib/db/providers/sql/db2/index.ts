/**
 * IBM Db2 LUW provider (#786). REGISTRATION STUB: declares the capabilities and labels and nothing
 * else, so the type-id can be registered and censused before the provider lands. Every method that
 * would reach the engine throws. Replaced wholesale by the provider itself.
 */
import type {
  ActiveSessionDetails,
  Container,
  DatabaseConnection,
  DatabaseObject,
  DatabaseOverview,
  HealthInfo,
  IndexStats,
  KindCount,
  MaintenanceOperation,
  MaintenanceResult,
  ObjectDetail,
  ObjectDetailBatch,
  ObjectSourceDocument,
  PerformanceMetrics,
  ProviderCapabilities,
  ProviderLabels,
  ProviderOptions,
  QueryResult,
  SlowQueryStats,
  StorageStats,
  TableStats,
} from "../../../types";
import { SQLBaseProvider } from "../sql-base";
import { db2Capabilities, db2Labels } from "./capabilities";

function notImplemented(): never {
  throw new Error("Db2Provider: not implemented");
}

export class Db2Provider extends SQLBaseProvider {
  constructor(config: DatabaseConnection, options: ProviderOptions = {}) {
    super(config, options);
  }

  public override getCapabilities(): ProviderCapabilities {
    return db2Capabilities(super.getCapabilities());
  }

  public override getLabels(): ProviderLabels {
    return db2Labels(super.getLabels());
  }

  public async connect(): Promise<void> {
    notImplemented();
  }

  public async disconnect(): Promise<void> {
    notImplemented();
  }

  public async query(_sql: string, _params?: unknown[]): Promise<QueryResult> {
    notImplemented();
  }

  public async listContainers(_parent?: readonly string[]): Promise<Container[]> {
    notImplemented();
  }

  public async countObjects(_container: readonly string[]): Promise<Record<string, KindCount>> {
    notImplemented();
  }

  public async listObjects(_container: readonly string[], _kind: string): Promise<DatabaseObject[]> {
    notImplemented();
  }

  public async describeObject(_path: readonly string[], _kind: string): Promise<ObjectDetail> {
    notImplemented();
  }

  public async describeObjects(
    _container: readonly string[],
    _kind: string,
    _limit?: number,
  ): Promise<ObjectDetailBatch> {
    notImplemented();
  }

  public async readObjectSource(
    _path: readonly string[],
    _kind: string,
    _limit?: number,
  ): Promise<ObjectSourceDocument> {
    notImplemented();
  }

  public async getHealth(): Promise<HealthInfo> {
    notImplemented();
  }

  public async runMaintenance(
    _type: MaintenanceOperation,
    _target?: string,
    _container?: string,
  ): Promise<MaintenanceResult> {
    notImplemented();
  }

  public async getOverview(): Promise<DatabaseOverview> {
    notImplemented();
  }

  public async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    notImplemented();
  }

  public async getSlowQueries(_options?: { limit?: number }): Promise<SlowQueryStats[]> {
    notImplemented();
  }

  public async getActiveSessions(_options?: { limit?: number }): Promise<ActiveSessionDetails[]> {
    notImplemented();
  }

  public async getTableStats(_options?: { schema?: string }): Promise<TableStats[]> {
    notImplemented();
  }

  public async getIndexStats(_options?: { schema?: string }): Promise<IndexStats[]> {
    notImplemented();
  }

  public async getStorageStats(): Promise<StorageStats[]> {
    notImplemented();
  }
}
