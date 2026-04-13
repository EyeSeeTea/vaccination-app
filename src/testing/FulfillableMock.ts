declare global {
    namespace jest {
        interface Matchers<R> {
            toBeFulfilled(): R;
        }
    }
}

export interface FulfillableMock {
    isFulfilled: () => { success: true } | { success: false; error: string };
}

function isFulfillableMock(obj: unknown): obj is FulfillableMock {
    return obj !== null && typeof obj === "function" && "isFulfilled" in obj;
}

expect.extend({
    toBeFulfilled(obj: unknown) {
        if (!isFulfillableMock(obj)) {
            return {
                pass: false,
                message: () => "Expected a mock with isFulfilled() method, but it was not found",
            };
        } else {
            const res = obj.isFulfilled();

            if (!res.success) {
                return {
                    pass: false,
                    message: () => `Expected mock was not fulfilled: ${res.error}`,
                };
            } else {
                return {
                    pass: true,
                    message: () => "Expected mock was fulfilled",
                };
            }
        }
    },
});
