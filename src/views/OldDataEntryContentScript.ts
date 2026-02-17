/**
 * Custom JS to be executed in the old data entry app, for vaccination data sets.
 *
 * Tasks performed:
 *
 * - Reorder tables in antigen tabs to be: doses administered + doses used + quality&safety
 * - Hide fully greyed-out columns (reduce colspan or hide them when fully disabled).
 */

const tablesCssSelector = "table.sectionTable:not(.floatThead-table)";

// Force this order for vaccination data tables:
//   [doses administered]
//   [doses used + non-disaggregated Q&S]
//   [disaggregated Q&S (AEFI)]
//
// We have two known cases to consider:
//   1) [doses used + non-disaggregated Q&S] + [disaggregated Q&S (AEFI)] + [doses administered]
//   2) [doses used + non-disaggregated Q&S] + [doses administered]
export class ReorderTablesForAntigen {
    constructor(private document: Document) {}

    execute(): void {
        const tabs = Array.from(this.document.querySelectorAll("#tabs .formSection"));
        debug(`Reorder tables: ${tabs.length} tabs found`);
        tabs.forEach(tab => this.reorderTablesInAntigenTab(tab));
    }

    private reorderTablesInAntigenTab(tab: Element): void {
        const [table1, table2, table3] = Array.from(tab.querySelectorAll(tablesCssSelector));

        if (table1 && table2 && table3) {
            const [nonDisaggregated, qAndS, dosesAdministered] = [table1, table2, table3];
            this.reorderTables([dosesAdministered, nonDisaggregated, qAndS]);
        } else if (table1 && table2) {
            const [nonDisaggregated, dosesAdministered] = [table1, table2];
            this.reorderTables([dosesAdministered, nonDisaggregated]);
        } else {
            debug(`Not an antigen tab, skipping...`);
        }
    }

    private reorderTables(tablesInOrder: Element[]): void {
        const parent = tablesInOrder[0]?.parentElement;
        const sameParent = tablesInOrder.every(t => t.parentElement === parent);

        if (!parent || !sameParent) {
            debug(`Tables have no common parent, skipping...`);
            return;
        }

        debug(`Reorder tables in tab`);
        tablesInOrder.forEach(table => parent.appendChild(table));
    }
}

// From an antigen tables(:N means colspan=N, ~vX~ means greyed-out cell):
//
// Disaggregation 1 |                   a1:6                  |
// Disaggregation 2 |      b1:3          |     b2:3           |
// Disaggregation 3 | c1:1 | c2:1 | c3:1 | c4:1 | c5:1 | c6:1 |
// -----------------|-----------------------------------------|
// Data Element 1   | v1   | ~v2~ | v3  | ~v4~  | v5   | ~v6~ |
// Data Element 2   | v7   | ~v8~ | v9  | ~v10~ | v11  | ~v12~ |
//
// We reduce the colspan of cells (or hide it when fully greyed out):
//
// Disaggregation 1 |            a1:3            |
// Disaggregation 2 |     b1:2     |     b2:1    |
// Disaggregation 3 |  c1:1 | c2:1 |     c3:1    |
// -----------------|----------------------------|
// Data Element 1   |   v1  |  v3  |     v5      |
// Data Element 2   |   v7  |  v9  |     v11     |
//
export class HideGreyedOutColumnsForForm {
    constructor(private document: Document) {}

    execute(): void {
        const tabs = Array.from(this.document.querySelectorAll("#tabs .formSection"));
        debug(`Hide greyed out columns: ${tabs.length} tabs found`);

        tabs.forEach(tab => {
            const tables = Array.from(tab.querySelectorAll(tablesCssSelector));
            tables.forEach(table => this.executeForTable(table));
        });
    }

    executeForTable(table: Element): void {
        const headers = this.getHeaderCells(table);
        const values = this.getValueCells(table);
        const disabledMap = this.getDisabledCellsCountMap(headers, values);
        this.hideCells(disabledMap);
    }

    // From table headers with colspan, generate cartesian product of cells:
    //
    // Disaggregation 1 |                   a1:6                  |
    // Disaggregation 2 |      b1:3          |     b2:3           |
    // Disaggregation 3 | c1:1 | c2:1 | c3:1 | c4:1 | c5:1 | c6:1 |
    //
    // => [[a1, b1, c1], [a1, b1, c2], [a1, b1, c3], [a1, b2, c4], ...]
    private getHeaderCells(table: Element): Element[][] {
        const cells = Array.from(table.querySelectorAll("thead tr")).map(tr => {
            return Array.from(tr.querySelectorAll("th")).flatMap(th => {
                const colspan = parseInt(th.getAttribute("colspan") ?? "1");
                return ArrayUtils.repeat(th as Element, colspan);
            });
        });

        return ArrayUtils.transpose(cells);
    }

    // From table date, generate cartesian products (exclude the first column, the data element name):
    //
    // Data Element 1   |   v1  |  v3  |  v5   |
    // Data Element 2   |   v7  |  v9  |  v11  |
    //
    // => [[v1, v7], [v3, v9], [v5, v11]]
    private getValueCells(table: Element): Element[][] {
        const cells = Array.from(table.querySelectorAll("tbody tr")).map(tr => {
            return Array.from(tr.querySelectorAll("td")).slice(1);
        });

        return ArrayUtils.transpose(cells);
    }

    // Merge the cartesian products of header cells and value cells, and return a count of how
    // many times each cell (header or data) has been disabled.
    private getDisabledCellsCountMap(
        headers: Element[][],
        values: Element[][]
    ): Map<Element, number> {
        const groups = ArrayUtils.zip2(headers, values);

        const cellsDisabled = groups.flatMap(([headerGroup, valueGroup]) => {
            // Example:
            //   headerGroup: [a1, b1, c1], valueGroup: [v1, v7]
            //   headerGroup: [a1, b1, c2], valueGroup: [v2, v8]
            //   ...
            const allCellValuesAreDisabled = valueGroup.every(tr => {
                const input = tr.querySelector("input");
                return Boolean(!input || input.getAttribute("disabled"));
            });
            return allCellValuesAreDisabled ? [...headerGroup, ...valueGroup] : [];
        });

        // Create a count of how many times a cell was marked as disabled
        return ArrayUtils.count(cellsDisabled);
    }

    // Update the colspan of header/data cells, or hide them if fully disabled
    private hideCells(disabledMap: Map<Element, number>): void {
        disabledMap.forEach((disabledCount, cell) => {
            const originalColspan = parseInt(cell.getAttribute("colspan") ?? "1");
            const finalColspan = originalColspan - disabledCount;

            if (finalColspan <= 0) {
                cell.setAttribute("hidden", "true");
            } else {
                cell.setAttribute("colspan", finalColspan.toString());
            }
        });
    }
}

class ArrayUtils {
    // count([1, 2, 3, 2, 3]) -> Map { 1 => 1, 2 => 2, 3 => 2 }
    static count<T>(xs: T[]): Map<T, number> {
        const result = new Map<T, number>();

        for (const x of xs) {
            result.set(x, (result.get(x) ?? 0) + 1);
        }

        return result;
    }

    // repeat("a", 3) -> ["a", "a", "a"]
    static repeat<T>(item: T, times: number): T[] {
        return Array(times).fill(item);
    }

    // transpose([[0, 1], [10, 11], [20, 21]]) -> [[0, 10, 20], [1, 11, 21]]
    static transpose<T>(arrays: T[][]): T[][] {
        if (arrays.length === 0) return [];
        const minLen = Math.min(...arrays.map(a => a.length));
        const indexes = Array.from(Array(minLen).keys());
        return indexes.map(idx => arrays.map(arr => arr[idx]!));
    }

    // zip2([1, 2, 3], ["a", "b", "c"]) -> [[1, "a"], [2, "b"], [3, "c"]]
    static zip2<S, T>(array1: S[], array2: T[]): [S, T][] {
        const minLen = Math.min(array1.length, array2.length);
        const indexes = Array.from(Array(minLen).keys());
        return indexes.map(idx => [array1[idx]!, array2[idx]!]);
    }
}

declare global {
    interface JQuery {
        on(
            event: "dhis2.de.event.formLoaded",
            handler: (ev: JQuery.Event, dataSetId: string) => void
        ): JQuery;
    }
}

function debug(msg: string): void {
    console.debug(`[custom-js-css:vaccination-app] ${msg}`);
}

function init() {
    const isBrowser = typeof window !== "undefined" && window === globalThis;
    if (!isBrowser) return;

    $(document).on("dhis2.de.event.formLoaded", async (_ev, dataSetId) => {
        debug(`Form loaded for data set ${dataSetId}. Executing custom JS...`);
        new ReorderTablesForAntigen(document).execute();
        new HideGreyedOutColumnsForForm(document).execute();
    });
}

init();
