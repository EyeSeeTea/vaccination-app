/* 
Replaces placeholders in the form {key} inside a string with values from a namespace object.

Example:

const template = "Hello, {name}!";
const namespace = { name: "World" };
interpolate(template, namespace); // => "Hello, World!"
*/

import { assert } from "./assert";

export function interpolate(template: string, namespace: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (_match, key) => {
        const value = assert(
            namespace[key],
            `Key "${key}" not found in namespace: ${Object.keys(namespace).join(", ")}`
        );
        return String(value);
    });
}
