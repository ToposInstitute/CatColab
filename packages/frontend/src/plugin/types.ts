import type { AnalysisContribution } from "./analysis";

/** A plugin to the CatColab application.

As in a typical plugin system, a plugin is simply a set of contributions that
are distributed together.
*/
export type Plugin = {
    /** Namespace for the plugin.

    Must be globally unique, and must not contain whitespace or a slash.

    As yet we take no position on where namespaces will come from, except that
    CatColab's standard library of plugins will belong to the namespace `std`.
     */
    namespace: string;

    /** Name of the plugin.

    Must be unique within plugins with the same namespace, and must not contain
    whitespace or a slash.
     */
    name: string;

    /** Contributions provided by the plugin. */
    contributions: Contribution[];
};

/** A contribution provided by a plugin.

So far only analyses can be contributed via plugins. In the future it will be
possible to contribute theories, models, and possibly other functionality.
 */
type Contribution = AnalysisContribution;
