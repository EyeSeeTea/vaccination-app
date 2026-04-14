import React from "react";

/**
 * Constrains values to `React.CSSProperties` while preserving literal key types.
 *
 * @example
 * const styles = makeStyles({
 *   container: { display: "flex" },
 *   title: { fontSize: 20 },
 * });
 */
export function makeStyles<K extends string>(styles: Record<K, React.CSSProperties>) {
    return styles;
}
