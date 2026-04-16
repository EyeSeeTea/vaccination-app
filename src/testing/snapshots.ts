import path from "path";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function expectToMatchSnapshot(json: JsonValue, snapshotName: string) {
    const folder = path.dirname(expect.getState().testPath);
    const snapshotPath = path.join(folder, "__snapshots__", snapshotName + ".json");
    const jsonString = JSON.stringify(json, null, 4) + "\n";
    expect(jsonString).toMatchFile(snapshotPath);
}
