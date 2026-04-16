import { defineConfig, loadEnv } from "vite";
// @ts-ignore
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import checker from "vite-plugin-checker";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_");

    return {
        plugins: [
            nodePolyfills(),
            react(),
            checker({
                overlay: false,
                typescript: true,
                eslint: {
                    lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
                    dev: { logLevel: ["warning"] },
                },
            }),
        ],
        base: "./",
        define: {
            global: "globalThis",
            "process.env.CYPRESS_E2E": JSON.stringify(process.env.CYPRESS_E2E || ""),
        },
        resolve: {
            alias: {
                buffer: "buffer/",
            },
        },
        build: { outDir: "build" },
        server: {
            port: parseInt(env.VITE_PORT || "8085"),
            proxy: {
                "/dhis2": {
                    target: env.VITE_DHIS2_BASE_URL,
                    changeOrigin: true,
                    rewrite: path => path.replace(/^\/dhis2/, ""),
                    configure: proxy => {
                        const auth = env.VITE_DHIS2_AUTH;
                        if (auth) {
                            proxy.on("proxyReq", proxyReq => {
                                proxyReq.setHeader(
                                    "Authorization",
                                    "Basic " + Buffer.from(auth).toString("base64")
                                );
                            });
                        }
                    },
                },
            },
        },
    };
});
