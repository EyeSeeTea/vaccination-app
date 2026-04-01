import _ from "lodash";
import ts from "typescript";
import fs from "fs";
import path from "path";

function run() {
    const inputFile = __dirname + "/../views/OldDataEntryContentScript.ts";
    const source = fs.readFileSync(inputFile, "utf8");

    const result = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.None,
            removeComments: true,
        },
        fileName: path.basename(inputFile),
    });

    const processedOutput = _(result.outputText.split("\n"))
        .reject(
            line =>
                line.includes("use strict") ||
                line.includes("Object.defineProperty(exports") ||
                line.includes("exports.")
        )
        .value();

    const outputFile = "data-entry-content-script.js";
    fs.writeFileSync(outputFile, processedOutput.join("\n"));
    console.debug(`Written: ${outputFile}`);
    console.debug(`Add that code to DHIS2 using the "Custom JS/CSS" App`);
}

run();
