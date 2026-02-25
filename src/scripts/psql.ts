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

    const queryWithLog: QueryFunction = async (query, values) => {
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

    try {
        if (dryRun) {
            await client.query("BEGIN");
        }

        const result = await command(queryWithLog);

        if (dryRun) {
            await client.query("ROLLBACK");
            console.debug("Dry run: transaction rolled back.");
        }

        return result;
    } catch (error) {
        if (dryRun) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Rollback failed:", rollbackError);
            }
        }
        throw error;
    } finally {
        await client.end();
    }
}

// Splits SQL string into individual commands, handling semicolons inside strings and comments.
//
// splitSqlCommands("SELECT *\nFROM table1;\n--some comment\nSELECT * FROM table2;") =>
//      ["SELECT * FROM table1;", "SELECT * FROM table2;"]
export function splitSqlCommands(sql: string): string[] {
    return (
        sql
            // remove single-line comments
            .replace(/--.*$/gm, "")
            // split only on semicolon at end of line
            .split(/;[ \t]*(?:\r?\n|$)/)
            // trim whitespace
            .map(cmd => cmd.trim())
            // remove empty entries
            .filter(cmd => cmd.length > 0)
            // add semicolon back
            .map(cmd => cmd + ";")
    );
}
