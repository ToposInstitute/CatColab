import { PluginRegistry } from "../plugin";
// XXX: A big, hard-coded list of plugins.
//
// In the future there will be a way to build and deploy standalone plugins.
import decapodesPlugin from "../plugins/decapodes/";
import diagramTabularViewPlugin from "../plugins/diagram_tabular_view/";
import erdVisualizationPlugin from "../plugins/erd_visualization/";
import graphVisualizationPlugin from "../plugins/graph_visualization/";
import kuramotoPlugin from "../plugins/kuramoto/";
import linearODEPlugin from "../plugins/linear_ode/";
import lotkaVolterraPlugin from "../plugins/lotka_volterra/";
import massActionODEPlugin from "../plugins/mass_action_ode/";
import massActionStochasticPlugin from "../plugins/mass_action_stochastic/";
import motifFindingPlugin from "../plugins/motif_finding/";
import petriNetReachabilityPlugin from "../plugins/petri_net_reachability/";
import polynomialODEPlugin from "../plugins/polynomial_ode/";
import sqlExportPlugin from "../plugins/sql_export/";
import uwdVisualizationPlugin from "../plugins/uwd_visualization/";

export const plugins = [
    graphVisualizationPlugin,
    erdVisualizationPlugin,
    sqlExportPlugin,
    diagramTabularViewPlugin,
    motifFindingPlugin,
    linearODEPlugin,
    lotkaVolterraPlugin,
    massActionODEPlugin,
    polynomialODEPlugin,
    kuramotoPlugin,
    massActionStochasticPlugin,
    petriNetReachabilityPlugin,
    decapodesPlugin,
    uwdVisualizationPlugin,
];

export const stdPlugins = new PluginRegistry();
for (const plugin of plugins) {
    stdPlugins.add(plugin);
}
