import fs from "fs";
import path from "path";

export interface SetupLoggingOptions {
    file?: string; // log file path
    append?: boolean; // append vs overwrite
    timestamps?: boolean; // add timestamps to file
}

export function setupLogs({
    file = "output.log",
    append = true,
    timestamps = false,
}: SetupLoggingOptions = {}) {
    const logPath = path.resolve(process.cwd(), file);
    const logStream = fs.createWriteStream(logPath, {
        flags: append ? "a" : "w",
    });

    function tee(stream: NodeJS.WriteStream, prefix?: () => string) {
        const originalWrite = stream.write.bind(stream);

        stream.write = ((chunk: any, encoding?: any, cb?: any) => {
            if (prefix) {
                logStream.write(prefix());
            }
            logStream.write(chunk);
            return originalWrite(chunk, encoding, cb);
        }) as typeof stream.write;
    }

    const ts = () => `[${new Date().toISOString()}] `;

    tee(process.stdout, timestamps ? ts : undefined);
    tee(process.stderr, timestamps ? ts : undefined);

    return {
        logPath,
        close: () => logStream.end(),
    };
}
