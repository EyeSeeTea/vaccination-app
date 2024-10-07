export function goToDhis2Url(d2, path) {
    const url = getDhis2Url(d2, path);
    window.location = url;
    return null;
}

export function getDhis2Url(d2, path) {
    const baseUrl = d2.system.systemInfo.contextPath;
    const isDev = process.env.NODE_ENV === "development";
    const pathWithoutLeadingSlash = path.replace(/^\//, "");
    return isDev
        ? `/dhis2/` + pathWithoutLeadingSlash
        : [baseUrl.replace(/\/$/, ""), pathWithoutLeadingSlash].join("/");
}
