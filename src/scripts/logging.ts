import fs from "fs";
import path from "path";

export interface SetupLoggingOptions {
    file: string; // log file path
    append?: boolean; // append vs overwrite
    timestamps?: boolean; // add timestamps to file
}

export function setupLogs(options: SetupLoggingOptions) {
    const { file, append = true, timestamps = false } = options;
    const logPath = path.resolve(process.cwd(), file);
    const logStream = fs.createWriteStream(logPath, { flags: append ? "a" : "w" });

    function tee(stream: NodeJS.WriteStream, prefix?: () => string) {
        const originalWrite = stream.write.bind(stream);

        stream.write = (
            chunk: string | Uint8Array,
            encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
            cb?: (err?: Error | null) => void
        ): boolean => {
            if (prefix) logStream.write(prefix());
            logStream.write(chunk);
            return originalWrite(chunk, encodingOrCb as BufferEncoding, cb);
        };
    }

    const ts = () => `[${new Date().toISOString()}] `;

    tee(process.stdout, timestamps ? ts : undefined);
    tee(process.stderr, timestamps ? ts : undefined);

    return {
        logPath: logPath,
        close: () => logStream.end(),
    };
}
