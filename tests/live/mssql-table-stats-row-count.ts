/**
 * Opt-in live guard for #1406: does Monitoring > Tables (`getTableStats()`) report a table's
 * EXACT row count on SQL Server, whatever indexes and allocation units the table carries?
 *
 * WHY THIS EXISTS, AND WHY IT CANNOT BE A UNIT TEST. `sys.partitions` holds one row per index,
 * and joining `sys.allocation_units` repeats each partition once per allocation unit (in-row,
 * LOB, row-overflow). A row count summed over that join multiplied a table's rows by both, and
 * a mock answers whatever its author wrote, so only the engine's own catalog can say the
 * statement now counts each row once. This script builds the three shapes the issue measured -
 * a primary key plus a UNIQUE constraint, a primary key plus a secondary index, and LOB columns -
 * and requires the provider's count to equal the engine's own `COUNT(*)` for each.
 *
 * It creates and drops a throwaway DATABASE on the server it is pointed at
 * (`libredb_table_stats_<hex>`), the way `mssql-zoneless-values.ts` does.
 *
 *   MSSQL_TEST_PORT=1433 MSSQL_TEST_PASSWORD="$PROBE_PASSWORD" bun tests/live/mssql-table-stats-row-count.ts
 *
 * Point it at a DISPOSABLE server on localhost, supplying the password configured on its
 * container as `$PROBE_PASSWORD`: a credential has no default here, so none is written down.
 * It is NOT in `bun run test`: the runner excludes `tests/live/` by name (`EXCLUDED` in
 * `tests/runner/discover.ts`).
 */
import mssql from "mssql";
import { randomBytes } from "node:crypto";
import { MSSQLProvider } from "../../src/lib/db/providers/sql/mssql";
import type { DatabaseConnection } from "../../src/lib/types";

/** The tables under guard, each with the indexes and allocation units that multiplied its count. */
const GUARDED_TABLES = ["dept", "emp", "t_types"] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} to a disposable SQL Server's port and sa password.`);
  return value;
}

async function probeServer(): Promise<string[]> {
  const failures: string[] = [];
  const port = Number(required("MSSQL_TEST_PORT"));
  const password = required("MSSQL_TEST_PASSWORD");
  const config = {
    server: "127.0.0.1",
    port,
    user: "sa",
    password,
    options: { trustServerCertificate: true, encrypt: false },
    pool: { min: 1, max: 1 },
  };
  const admin = await new mssql.ConnectionPool(config).connect();
  const database = `libredb_table_stats_${randomBytes(5).toString("hex")}`;
  const connection: DatabaseConnection = {
    id: "live-table-stats",
    name: "live table stats row count",
    type: "mssql",
    host: "127.0.0.1",
    port,
    database,
    user: "sa",
    password,
    createdAt: new Date(),
  };
  const provider = new MSSQLProvider(connection);
  let db: mssql.ConnectionPool | undefined;
  try {
    const version = String(
      Object.values((await admin.request().query("SELECT @@VERSION AS version")).recordset[0])[0],
    ).split("\n")[0];
    console.log(`=== ${version} ===`);
    await admin.request().query(`CREATE DATABASE [${database}]`);
    db = await new mssql.ConnectionPool({ ...config, database }).connect();
    await db.request().query(
      `CREATE TABLE dbo.dept (id INT NOT NULL PRIMARY KEY, code VARCHAR(10) NOT NULL UNIQUE);
       INSERT INTO dbo.dept VALUES (1, 'A'), (2, 'B');
       CREATE TABLE dbo.emp (id INT NOT NULL PRIMARY KEY, dept_id INT NOT NULL);
       CREATE INDEX ix_emp_dept ON dbo.emp (dept_id);
       INSERT INTO dbo.emp VALUES (1, 1), (2, 1), (3, 2);
       CREATE TABLE dbo.t_types (id INT NOT NULL PRIMARY KEY, body NVARCHAR(MAX), blob VARBINARY(MAX));
       INSERT INTO dbo.t_types VALUES (1, REPLICATE(CAST(N'x' AS NVARCHAR(MAX)), 9000), 0x01), (2, N'y', NULL);`,
    );

    // The engine's own count, which is the only authority on what the provider must answer.
    const counted = new Map<string, number>();
    for (const table of GUARDED_TABLES) {
      const answer = await db.request().query(`SELECT COUNT(*) AS n FROM dbo.${table}`);
      counted.set(table, Number((answer.recordset[0] as { n: number }).n));
    }

    await provider.connect();
    const stats = await provider.getTableStats();
    for (const table of GUARDED_TABLES) {
      const expected = counted.get(table);
      const row = stats.find((entry) => entry.schemaName === "dbo" && entry.tableName === table);
      console.log(`${table}: COUNT(*) answers ${expected}, Monitoring > Tables reads ${row?.rowCount}`);
      if (row === undefined) {
        failures.push(`${table}: getTableStats() returned no row for it.`);
      } else if (row.rowCount !== expected) {
        failures.push(
          `${table}: getTableStats() read ${row.rowCount} rows and COUNT(*) answers ${expected}. ` +
            "#1406 is exactly the gap between those two.",
        );
      }
    }
  } finally {
    await provider.disconnect().catch(() => {});
    await db?.close();
    await admin.request().query(`IF DB_ID('${database}') IS NOT NULL DROP DATABASE [${database}]`);
    await admin.close();
  }
  return failures;
}

const failures = await probeServer();

console.log("");
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\n${failures.length} table row count(s) did not hold.`);
  process.exit(1);
}
console.log("Every table's Monitoring > Tables row count equals the engine's own COUNT(*).");
