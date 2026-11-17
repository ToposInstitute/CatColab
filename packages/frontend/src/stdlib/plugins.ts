import { PluginRegistry } from "../plugin";
// XXX: A big, hard-coded list of plugins.
//
// In the future there will be a way to build and deploy standalone plugins.
import { plugins as decapodesPlugins } from "../plugins/decapodes/";
import { plugins as diagramTabularViewPlugins } from "../plugins/diagram_tabular_view/";
import { plugins as erdVisualizationPlugins } from "../plugins/erd_visualization/";
import { plugins as graphVisualizationPlugins } from "../plugins/graph_visualization/";
import { plugins as motifFindingPlugins } from "../plugins/motif_finding/";
import { plugins as odeSimulationPlugins } from "../plugins/ode_simulation/";
import { plugins as petriNetReachabilityPlugins } from "../plugins/petri_net_reachability/";
import { plugins as sqlExportPlugins } from "../plugins/sql_export/";
import { plugins as stochasticMassActionPlugins } from "../plugins/stochastic_mass_action/";
import { plugins as uwdVisualizationPlugins } from "../plugins/uwd_visualization/";

export const pluginGroups = [
    graphVisualizationPlugins,
    erdVisualizationPlugins,
    sqlExportPlugins,
    diagramTabularViewPlugins,
    motifFindingPlugins,
    odeSimulationPlugins,
    stochasticMassActionPlugins,
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
