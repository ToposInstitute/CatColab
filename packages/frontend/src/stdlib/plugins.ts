import { PluginRegistry } from "../plugin";
// XXX: A big, hard-coded list of plugins.
//
// In the future there will be a way to build and deploy standalone plugins.
import { contributions as decapodesPlugin } from "../plugins/decapodes/";
import { contributions as diagramTabularViewPlugin } from "../plugins/diagram_tabular_view/";
import { contributions as erdVisualizationPlugin } from "../plugins/erd_visualization/";
import { contributions as graphVisualizationPlugin } from "../plugins/graph_visualization/";
import { contributions as kuramotoPlugin } from "../plugins/kuramoto/";
import { contributions as linearODEPlugin } from "../plugins/linear_ode/";
import { contributions as lotkaVolterraPlugin } from "../plugins/lotka_volterra/";
import { contributions as massActionODEPlugin } from "../plugins/mass_action_ode/";
import { contributions as massActionStochasticPlugin } from "../plugins/mass_action_stochastic/";
import { contributions as motifFindingPlugin } from "../plugins/motif_finding/";
import { contributions as petriNetReachabilityPlugin } from "../plugins/petri_net_reachability/";
import { contributions as polynomialODEPlugin } from "../plugins/polynomial_ode/";
import { contributions as sqlExportPlugin } from "../plugins/sql_export/";
import { contributions as uwdVisualizationPlugin } from "../plugins/uwd_visualization/";

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
