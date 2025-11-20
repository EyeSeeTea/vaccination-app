declare module "d2" {
    export function init(config?: any, Api?: any): Promise<any>;
}

declare module "d2/api/Api" {
    export default class Api {
        defaultHeaders: Record<string, string>;
    }
}

declare module "d2/uid" {
    export function generateUid(): string;
}
