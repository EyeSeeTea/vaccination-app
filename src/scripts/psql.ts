import { split } from "lodash";
import { Client } from "pg";

type QueryFunction = (query: string, values?: unknown[]) => Promise<QueryResult | undefined>;

type QueryResult = { rows: unknown[]; rowCount: number | null };

export async function runPsql<U>(
    options: { url: string; dryRun?: boolean },
    command: (query: QueryFunction) => Promise<U>
): Promise<U> {
    const { url, dryRun = false } = options;
    const client = new Client(url);
    await client.connect();

    try {
        if (dryRun) {
            await client.query("BEGIN");
        }

        const queryWithLog: QueryFunction = async (query, values?) => {
            const queries = splitSqlCommands(query);

            let res: QueryResult | undefined = undefined;

            for (const q of queries) {
                const sqlSingleLine = q.replace(/\s+/g, " ").trim();
                console.debug(`Executing query: ${sqlSingleLine.slice(0, 200)}`);
                const res2 = await client.query(q, values);
                res = { rows: res2.rows, rowCount: res2.rowCount };
            }
            return res;
        };
        const result = await command(queryWithLog);

        if (dryRun) {
            await client.query("ROLLBACK");
            console.debug("Dry run: transaction rolled back.");
        } else {
            await client.query("COMMIT");
        }

        return result;
    } catch (error) {
        if (dryRun) {
            await client.query("ROLLBACK");
        }
        throw error;
    } finally {
        await client.end();
    }
}

export function splitSqlCommands(sql: string): string[] {
    return (
        sql
            // remove single-line comments
            .replace(/--.*$/gm, "")
            // split by semicolon
            .split(";")
            // trim whitespace
            .map(cmd => cmd.trim())
            // remove empty entries
            .filter(cmd => cmd.length > 0)
            // add semicolon back if you want executable statements
            .map(cmd => cmd + ";")
    );
}
