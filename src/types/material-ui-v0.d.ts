declare module "material-ui/styles/colors" {
    export const cyan500: string;
    export const cyan700: string;
    export const cyan100: string;
    export const orange500: string;
    export const grey100: string;
    export const grey400: string;
    export const grey500: string;
    export const darkBlack: string;
    export const white: string;
}

declare module "material-ui/utils/colorManipulator" {
    export function fade(color: string, amount: number): string;
}

declare module "material-ui/styles/spacing" {
    const Spacing: Record<string, number>;
    export default Spacing;
}

declare module "material-ui/styles/getMuiTheme" {
    const getMuiTheme: (theme: unknown) => Record<string, unknown>;
    export default getMuiTheme;
}
