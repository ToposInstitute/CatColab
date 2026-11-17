import { PluginRegistry } from "../plugin";
// XXX: A big, hard-coded list of plugins.
//
// In the future there will be a way to build and deploy standalone plugins.
import { plugins as decapodesPlugins } from "../plugins/decapodes/";
import { plugins as diagramTabularViewPlugins } from "../plugins/diagram_tabular_view/";
import { plugins as erdVisualizationPlugins } from "../plugins/erd_visualization/";
import { plugins as graphVisualizationPlugins } from "../plugins/graph_visualization/";
import { plugins as kuramotoPlugins } from "../plugins/kuramoto/";
import { plugins as linearODEPlugins } from "../plugins/linear_ode/";
import { plugins as lotkaVolterraPlugins } from "../plugins/lotka_volterra/";
import { plugins as massActionODEPlugins } from "../plugins/mass_action_ode/";
import { plugins as massActionStochasticPlugins } from "../plugins/mass_action_stochastic/";
import { plugins as motifFindingPlugins } from "../plugins/motif_finding/";
import { plugins as petriNetReachabilityPlugins } from "../plugins/petri_net_reachability/";
import { plugins as polynomialODEPlugins } from "../plugins/polynomial_ode/";
import { plugins as sqlExportPlugins } from "../plugins/sql_export/";
import { plugins as uwdVisualizationPlugins } from "../plugins/uwd_visualization/";

export const pluginGroups = [
    graphVisualizationPlugins,
    erdVisualizationPlugins,
    sqlExportPlugins,
    diagramTabularViewPlugins,
    motifFindingPlugins,
    linearODEPlugins,
    lotkaVolterraPlugins,
    massActionODEPlugins,
    polynomialODEPlugins,
    kuramotoPlugins,
    massActionStochasticPlugins,
    petriNetReachabilityPlugins,
    decapodesPlugins,
    uwdVisualizationPlugins,
];

export const stdPlugins = new PluginRegistry();
for (const plugins of pluginGroups) {
    for (const plugin of plugins) {
        stdPlugins.add(plugin);
    }
}
