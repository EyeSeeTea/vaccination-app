declare module "d2" {
    export function init(config?: { baseUrl?: string }, Api?: any): Promise<D2>;

    export function getUserSettings(): Promise<{
        keyUiLocale: string;
    }>;

    export function getManifest(path?: string): Promise<{
        getBaseUrl(): string;
    }>;

    export const config: {
        schemas?: string[];
        i18n: {
            sources: {
                add(path: string): void;
            };
        };
    };
}

declare module "d2/api/Api" {
    export default class Api {
        defaultHeaders: Record<string, string>;
    }
}

declare module "d2/uid" {
    export function generateUid(): string;
}
