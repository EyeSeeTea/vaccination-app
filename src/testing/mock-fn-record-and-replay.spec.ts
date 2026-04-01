import { recordAndReplayFnCalls } from "./mock-fn-record-and-replay";

// Usage example: mock async add function, using zod for type-safe deserialization

async function addP(values: { a: number; b: number }): Promise<number> {
    return values.a + values.b;
}

describe("Custom declarative snapshot mocks", () => {
    it("should record and replay args/return values called in specific order", async () => {
        const addP_ = recordAndReplayFnCalls<typeof addP>({
            name: "addP",
            realFunction: addP,
            serializeArgs: args => args,
            serializeReturnValue: res => res,
            deserializeReturnValue: obj => obj as number,
        });

        expect(await addP_({ a: 1, b: 2 })).toBe(3);
        expect(await addP_({ a: 3, b: 5 })).toBe(8);

        expect(addP_).toBeFulfilled();
    });
});
