import { toMatchFile } from "jest-file-snapshot";
import fs from "fs";
import path from "path";
import stringify from "json-stable-stringify";

import "./FulfillableMock";
import { FulfillableMock } from "./FulfillableMock";
import { jsonEquals, JsonValue } from "./json-equals";

expect.extend({ toMatchFile });

/**
 * Utility for creating snapshot-backed *record-and-replay* mocks for async functions in Vitest.
 *
 * On the first test run, calls to the wrapped function are:
 *   - Executed against the real function.
 *   - Serialized (arguments + return value).
 *   - Stored as individual JSON snapshot files.
 *
 * On subsequent runs, calls are:
 *   - Matched against existing snapshots.
 *   - Replayed deterministically using the recorded return values.
 *
 * This provides stable, declarative mocks that behave identically across machines and
 * test runs, while still giving you full visibility through snapshot diffs when behavior changes.
 *
 * The mock also tracks how many calls were consumed, allowing you to assert that:
 *   - All recorded calls have been replayed (`toBeFulfilled()`).
 *   - Extra or missing calls surface as snapshot mismatches.
 *
 * ## Serialization
 *
 * You must provide:
 *   - `serializeArgs` — converts the function's arguments into a JSON-compatible value.
 *   - `serializeReturnValue` — converts the resolved return value into JSON-compatible value.
 *   - `deserializeReturnValue` — performs the inverse operation when replaying.
 *
 * These functions give you full control over the shape and type safety of your snapshots.
 *
 * ## Snapshot Update Behavior (for developers)
 *
 * Vitest has three snapshot update modes:
 *   - `"none"` — snapshots must match exactly; any difference fails the test.
 *   - `"new"`  — new snapshots are created, but existing ones are not overwritten.
 *   - `"all"`  — all snapshots may be updated if arguments differ.
 *
 * This module respects these modes when recording and replaying calls with an exception:
 *  - When in `"all"` mode, only the first mismatched snapshot is updated per test run.
 *    This allows you to review and accept changes one at a time, rather than having
 *    all snapshots updated at once.
 *
 * ## Simple Example
 *
 * ```ts
 * async function add(a: number, b: number): Promise<number> {
 *     return a + b;
 * }
 *
 * const add_ = recordAndReplayFnCalls<typeof add>({
 *     name: "add",
 *     realFunction: add,
 *
 *     // JSON-compatible serialization
 *     serializeArgs: args => args,
 *     serializeReturnValue: value => value,
 *
 *     // Type-safe deserialization (using Zod)
 *     deserializeReturnValue: obj => z.number().parse(obj)
 * });
 *
 * // On first run: executes real function and records snapshots.
 * // On later runs: replays recorded results deterministically.
 *
 * expect(await add_(1, 2)).toBe(3);
 * expect(await add_(5, 7)).toBe(12);
 *
 * // Ensures all recorded calls were consumed
 * expect(add_).toBeFulfilled();
 * ```
 */

export function recordAndReplayFnCalls<Fn extends AnyAsyncFunction>(options: {
    name: string;
    realFunction: Fn;
    serializeArgs: (args: Parameters<Fn>) => JsonValue;
    serializeReturnValue: (obj: Awaited<ReturnType<Fn>>) => JsonValue;
    deserializeReturnValue: (obj: JsonValue) => Awaited<ReturnType<Fn>>;
}): jest.Mock<ReturnType<Fn>, Parameters<Fn>> & FulfillableMock {
    const { serializeArgs, serializeReturnValue, deserializeReturnValue } = options;
    let index = 0;

    const mockFn = jest.fn(async (...args: Parameters<Fn>): Promise<Awaited<ReturnType<Fn>>> => {
        const currentIndex = index++;
        const snapshotFile = getSnapshotFile(expect, currentIndex, options.name);
        const updateMode = getSnapshotsUpdateMode();

        if (!snapshotFile.contents) {
            if (updateMode === modes.NONE) {
                expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: null,
                });
                throw new Error("Invariant broken");
            } else {
                const returnValueReal = (await options.realFunction(...args)) as Awaited<
                    ReturnType<Fn>
                >;
                expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: await serializeReturnValue(returnValueReal),
                });
                return returnValueReal;
            }
        } else {
            const expected = JSON.parse(snapshotFile.contents) as SerializedCall;
            const argsAreEqual = jsonEquals(serializeArgs(args), expected.args);

            if (argsAreEqual) {
                return deserializeReturnValue(expected.returnValue);
            } else if (updateMode === modes.CREATE_AND_UPDATE) {
                const realReturnValue = await options.realFunction(...args);
                expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: await serializeReturnValue(realReturnValue),
                });
                preventFurtherSnapshotUpdates();
                return realReturnValue as Awaited<ReturnType<Fn>>;
            } else {
                expectCallMatchesSnapshot(snapshotFile.path, {
                    args: serializeArgs(args),
                    returnValue: expected.returnValue,
                });
                throw new Error("Unreachable");
            }
        }
    }) as jest.Mock<ReturnType<Fn>, Parameters<Fn>> & FulfillableMock;

    mockFn.isFulfilled = () => {
        const snapshotFiles = getSnapshotFiles(options.name);
        const missingCalls = snapshotFiles.slice(index).map(s => `  - ${s}`);

        if (missingCalls.length > 0) {
            const msg = [
                `${index} of ${snapshotFiles.length} calls were made.`,
                `The following calls are missing:`,
                missingCalls.join("\n"),
                `If these calls are no longer relevant, delete their snapshot files.`,
            ].join("\n");
            return { success: false, error: msg };
        } else {
            return { success: true };
        }
    };

    return mockFn;
}

export type AnyAsyncFunction = (...args: any[]) => Promise<any>;

// Internal helpers

type SerializedCall = {
    args: JsonValue;
    returnValue: JsonValue;
};

function expectCallMatchesSnapshot(snapshotFilePath: string, call: SerializedCall) {
    const pretty = stringify(call, { space: 4 }) + "\n";
    return expect(pretty).toMatchFile(snapshotFilePath);
}

function getSnapshotFiles(name: string) {
    const snapsFolder = path.dirname(expect.getState().snapshotState._snapshotPath);

    return fs
        .readdirSync(snapsFolder)
        .filter(filename => filename.startsWith(name + "-") && filename.endsWith(".json"))
        .map(filename => path.join(snapsFolder, filename))
        .map(filePath => path.relative(__dirname, filePath));
}

type Mode = typeof modes[keyof typeof modes];

const modes = {
    NONE: "none",
    CREATE: "new",
    CREATE_AND_UPDATE: "all",
};

function getSnapshotsUpdateMode(): Mode {
    const mode = expect.getState().snapshotState["_updateSnapshot"] as string;

    switch (mode) {
        case "none":
            return modes.NONE;
        case "new":
            return modes.CREATE;
        case "all":
            return modes.CREATE_AND_UPDATE;
        default:
            throw new Error(`Unknown snapshot update mode: ${mode}`);
    }
}

// This is not the typical behaviour for jest/vitest, but this way a diff is shown for every
// snapshot that changes (the user may update them one by one by pressing 'u' in watch mode)
function preventFurtherSnapshotUpdates() {
    expect.getState().snapshotState["_updateSnapshot"] = "none";
}

function getSnapshotFile(
    expect: jest.Expect,
    currentIndex: number,
    name: string
): { contents: string | null; path: string } {
    const snapshotsFolder = path.dirname(expect.getState().snapshotState._snapshotPath);
    const filename = `${name}-${padZero(currentIndex + 1, 3)}.json`;
    const snapshotFilePath = path.join(snapshotsFolder, filename);
    const contents = fs.existsSync(snapshotFilePath)
        ? fs.readFileSync(snapshotFilePath, "utf-8")
        : null;
    return { contents: contents, path: snapshotFilePath };
}

function padZero(num: number, size: number): string {
    return String(num).padStart(size, "0");
}
