/**
 * Db2's monitoring panels, deliberately neutral in this version (#786).
 *
 * Two readings are taken, both from places a plain user may read: the server's version, and how
 * many tables and indexes the catalog holds. Everything else answers its type's "not measured"
 * shape: no session, statement or storage reading is taken, so none is reported, and the labels
 * tell the Queries and Sessions tabs to say so rather than to suggest a server setting.
 *
 * `serverInfo()` is never used for the version: db2-node 1.0.22 answers it with the instance name
 * and `SQL12010`, not the product string (K13).
 */

import type { DatabaseOverview, HealthInfo } from "@/lib/db/types";
import { CACHE_HIT_RATIO_UNAVAILABLE } from "@/lib/monitoring-cache-ratio";

/** Runs one catalog statement and answers its rows. */
export type Db2RowReader = (sql: string) => Promise<Record<string, unknown>[]>;

/** Answers `DB2 v12.1.0.0` (measured). */
export const VERSION_SQL = `SELECT SERVICE_LEVEL FROM SYSIBMADM.ENV_INST_INFO`;

export const OBJECT_COUNTS_SQL = `SELECT (SELECT COUNT(*) FROM SYSCAT.TABLES WHERE TYPE = 'T') AS TABLE_COUNT,
       (SELECT COUNT(*) FROM SYSCAT.INDEXES) AS INDEX_COUNT
FROM SYSIBM.SYSDUMMY1`;

/** The version the server reports, or `Unknown` when the read is refused or answers nothing. */
async function readVersion(read: Db2RowReader): Promise<string> {
  try {
    const level = (await read(VERSION_SQL))[0]?.SERVICE_LEVEL;
    return typeof level === "string" && level !== "" ? level : "Unknown";
  } catch {
    // SYSIBMADM views can be revoked from PUBLIC; the version is then not known, and is not invented.
    return "Unknown";
  }
}

/**
 * The two catalog counts. A refused read leaves both at 0, which is the shape `DatabaseOverview`
 * requires and Oracle's precedent for the same refusal; a 0 the catalog answered is a real 0.
 */
async function readObjectCounts(read: Db2RowReader): Promise<{ tableCount: number; indexCount: number }> {
  try {
    const row = (await read(OBJECT_COUNTS_SQL))[0];
    return { tableCount: Number(row?.TABLE_COUNT ?? 0), indexCount: Number(row?.INDEX_COUNT ?? 0) };
  } catch {
    return { tableCount: 0, indexCount: 0 };
  }
}

export async function readOverview(read: Db2RowReader): Promise<DatabaseOverview> {
  const version = await readVersion(read);
  const counts = await readObjectCounts(read);
  return { version, uptime: "N/A", maxConnections: 0, databaseSize: "N/A", ...counts };
}

/** Nothing measured: no connection count, no size, no cache ratio, no list. */
export function neutralHealth(): HealthInfo {
  return { databaseSize: "N/A", cacheHitRatio: CACHE_HIT_RATIO_UNAVAILABLE, slowQueries: [], activeSessions: [] };
}
