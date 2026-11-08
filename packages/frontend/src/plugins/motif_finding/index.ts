import { plugins as causalLoopPlugins } from "./theories/causal_loop";
import { plugins as causalLoopDelaysPlugins } from "./theories/causal_loop_delays";
import { plugins as indeterminateCausalLoopPlugins } from "./theories/indeterminate_causal_loop";
import { plugins as regNetPlugins } from "./theories/reg_net";

export const plugins = [
    ...causalLoopPlugins,
    ...causalLoopDelaysPlugins,
    ...indeterminateCausalLoopPlugins,
    ...regNetPlugins,
];
