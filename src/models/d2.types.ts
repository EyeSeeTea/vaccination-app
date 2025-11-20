import { Dictionary } from "lodash";

export interface D2 {
    Api: {
        getApi(): D2ApiLegacy;
    };
    currentUser: {
        displayName: string;
    };
}

export type DeleteResponse = {
    httpStatus: "OK" | "Conflict";
    httpStatusCode: number;
    status: "OK" | "ERROR";
    message?: string;
};

export interface D2ApiLegacy {
    get(url: string, data: Dictionary<any>): Promise<Dictionary<any>>;
    get<T>(url: string, data: Dictionary<any>): Promise<T>;
    post(url: string, data: Dictionary<any>): Promise<Dictionary<any>>;
    update(url: string, data: Dictionary<any>): Promise<Dictionary<any>>;
    delete(url: string): Promise<DeleteResponse>;
    baseUrl: string;
}

export type D2ApiLegacyGetNoGeneric = (
    url: string,
    data: Dictionary<any>
) => Promise<Dictionary<any>>;
