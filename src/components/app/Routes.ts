export class Routes {
    constructor(private baseUrl: string) {}

    async getDashboardUrl(options: { id: string }) {
        return this.getUrl(`/dhis-web-dashboard/#/${options.id}`);
    }

    private getUrl(path: string) {
        const cleanBaseUrl = this.baseUrl.replace(/\/+$/, "");
        return `${cleanBaseUrl}/${path}`;
    }
}
