import { toMatchFile } from "jest-file-snapshot";
import _ from "lodash";
import { default as Api } from "d2/api/Api";
import { init } from "d2";

import { D2, D2ApiLegacy, D2ApiLegacyGetNoGeneric } from "../models/d2.types";
import DbD2 from "../models/db-d2";
import { D2MetadataResponse, stabilizeD2MetadataResponse } from "./d2-processors";
import { D2Api } from "../types/d2-api";
import { assert } from "../utils/assert";
import { recordAndReplayFnCalls } from "./mock-fn-record-and-replay";
import { FulfillableMock } from "./FulfillableMock";
import { CancelableResponse } from "@eyeseetea/d2-api";

/**
 * Record and replay DHIS2 API calls
 *
 * Validate and generate Jest snapshots of an ordered sequence of DHIS2 API calls.
 * The DHIS2 instance is only required when new snapshots must be created or updated.
 */

export function getDbD2SnapMock(name: string): SnapshotMock<DbD2> {
    const apiMock = {
        baseUrl: "http://host:8080",
        get: snapMock<D2ApiLegacyGetNoGeneric>(`${name}-get`, async (url, options) => {
            return getRealD2()
                .then(d2 => d2.api.get(url, options))
                .then(res => (url === "/metadata" ? stabilizeD2MetadataResponse(res) : res));
        }),
        post: snapMock<D2ApiLegacy["post"]>(`${name}-post`, async (url, options) => {
            return getRealD2().then(d2 => d2.api.post(url, options));
        }),
        update: snapMock<D2ApiLegacy["update"]>(`${name}-update`, async (url, options) => {
            return getRealD2().then(d2 => d2.api.update(url, options));
        }),
        delete: snapMock<D2ApiLegacy["delete"]>(`${name}-delete`, async url => {
            return getRealD2().then(d2 => d2.api.delete(url));
        }),
    };

    const mockD2 = getD2Stub(apiMock as unknown as D2ApiLegacy);
    const dbD2 = new DbD2(mockD2);
    return addMockExpectations(dbD2, [apiMock.get, apiMock.post, apiMock.update, apiMock.delete]);
}

export function getD2ApiSnapMock(name: string): SnapshotMock<D2Api> {
    const apiMock = {
        metadata: {
            get: getD2ApiResponseMock<D2Api["metadata"]["get"]>(
                `${name}-metadata-get`,
                (api, args) =>
                    api.metadata
                        .get(...args)
                        .getData()
                        .then(res =>
                            stabilizeD2MetadataResponse(res as unknown as D2MetadataResponse)
                        )
            ),
            post: getD2ApiResponseMock<D2Api["metadata"]["post"]>(
                `${name}-metadata-post`,
                (api, args) => api.metadata.post(...args).getData()
            ),
        },
        maintenance: {
            categoryOptionComboSingleUpdate: getD2ApiResponseMock<
                D2Api["maintenance"]["categoryOptionComboSingleUpdate"]
            >(`${name}-maintenance-cocs-update`, (api, args) =>
                api.maintenance.categoryOptionComboSingleUpdate(...args).getData()
            ),
        },
    };

    return addMockExpectations<D2Api>(apiMock as unknown as D2Api, [
        apiMock.metadata.get._mock,
        apiMock.metadata.post._mock,
        apiMock.maintenance.categoryOptionComboSingleUpdate._mock,
    ]);
}

// Internal

/**
 * Save snapshots in __snapshots__ folder in the same tests folder:
 *
 * src/some/folder/__tests/__snapshots__/NAME-API_METHOD-ORDER_INDEX.json
 *
 * Example: src/data/__tests__/__snapshots__/campaign-save-get-001.json
 *
 * If the snapshot does not exist -> create it with actual API calls.
 * If the snapshot does exist -> validate that calls (args+response) match the snapshots.
 * If the snapshot does not validate AND we are in update mode -> run actual API calls and update the snapshots.
 *
 * Comparison/JSON serialization is feasible because DHIS2 calls (both arguments and responses) are
 * plain object with JSON values. For a 100% generic approach, we would need a custom serializer infrastructure.
 *
 */

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Matchers<R> {
            toBeFulfilled(): R;
        }
    }
}

expect.extend({
    toMatchFile: toMatchFile,
    toBeFulfilled(received: SnapshotMock<unknown>) {
        const errorMsg = received.getMissingExpectedCalls();

        if (errorMsg) {
            return { pass: false, message: () => errorMsg };
        } else {
            return { pass: true, message: () => "All expected calls were made" };
        }
    },
});

function getRealD2Api(): D2Api {
    const baseUrl = process.env.DHIS2_BASE_URL;
    const auth = process.env.DHIS2_AUTH;
    if (!baseUrl || !auth) throw new Error("DHIS2_BASE_URL or DHIS2_AUTH not set");

    const [username, password] = auth.split(":");

    return new D2Api({
        baseUrl: baseUrl,
        auth: { username: assert(username), password: assert(password) },
        backend: "xhr",
    });
}

type D2FnIface = (...args: any[]) => CancelableResponse<any>;

function getD2ApiResponseMock<D2ApiFn extends D2FnIface>(
    key: string,
    d2ApiFn: (api: D2Api, args: Parameters<D2ApiFn>) => ReturnType<ReturnType<D2ApiFn>["getData"]>
) {
    let args: Parameters<D2ApiFn>;

    const mock = recordAndReplayFnCalls({
        name: key,
        realFunction: () => d2ApiFn(getRealD2Api(), args),
        serializeArgs: () => args,
        serializeReturnValue: res => res,
        deserializeReturnValue: obj => obj as Awaited<ReturnType<ReturnType<D2ApiFn>["getData"]>>,
    });

    const fn = (...fnArgs: Parameters<D2ApiFn>) => {
        args = fnArgs;
        return { getData: mock };
    };

    fn._mock = mock;
    return fn;
}

function addMockExpectations<T>(
    obj: T,
    mocks: Array<jest.Mock<any, any> & FulfillableMock>
): SnapshotMock<T> {
    function getMissingExpectedCalls() {
        return _(mocks)
            .map(mock => {
                const res = mock.isFulfilled();
                return res.success ? null : res.error;
            })
            .compact()
            .first();
    }

    const snapObj = obj as SnapshotMock<T>;
    snapObj.getMissingExpectedCalls = getMissingExpectedCalls;
    return snapObj;
}

function getD2Stub(apiMock: D2ApiLegacy): D2 {
    return {
        Api: { getApi: () => apiMock },
        currentUser: { displayName: "John Traore" },
    };
}

type AnyFn = (...args: any[]) => any;

function snapMock<Fn extends AnyFn>(key: string, realFn: Fn) {
    return recordAndReplayFnCalls<Fn>({
        name: key,
        realFunction: realFn,
        serializeArgs: args => args,
        serializeReturnValue: res => res,
        deserializeReturnValue: obj => obj as Awaited<ReturnType<Fn>>,
    });
}

type SnapshotMock<T> = T & { getMissingExpectedCalls: () => string | undefined };

// D2.init() does some calls, so let's cache it
let realD2: DbD2;

async function getRealD2(): Promise<DbD2> {
    if (realD2) return realD2;

    const baseUrl = process.env.DHIS2_BASE_URL;
    const auth = process.env.DHIS2_AUTH;
    if (!baseUrl) throw new Error("DHIS2_BASE_URL not set");
    if (!auth) throw new Error("DHIS2_AUTH not set");

    console.debug(`Initializing D2 instance: baseUrl=${baseUrl}, auth=${auth.substring(0, 3)}***`);

    const api = new Api();

    Object.assign(api.defaultHeaders, {
        Authorization: "Basic " + btoa(auth),
    });

    const d2_ = await init({ baseUrl: baseUrl + "/api" }, { getApi: () => api });
    realD2 = new DbD2(d2_);
    return realD2;
}
