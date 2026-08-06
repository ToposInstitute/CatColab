/**
 * Ambient declarations for Babel presets that ship no type definitions and
 * have no @types/* package on DefinitelyTyped. Both are only ever passed to
 * `@babel/core`'s `presets` option, so typing them as `PluginItem` suffices.
 */

declare module "babel-preset-solid" {
    import type { PluginItem } from "@babel/core";
    const preset: PluginItem;
    export default preset;
}

declare module "@babel/preset-typescript" {
    import type { PluginItem } from "@babel/core";
    const preset: PluginItem;
    export default preset;
}
