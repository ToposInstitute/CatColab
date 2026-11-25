import type { Plugin } from "../../plugin";
import { contributions as causalLoopContributions } from "./theories/causal_loop";
import { contributions as causalLoopDelaysContributions } from "./theories/causal_loop_delays";
import { contributions as indeterminateCausalLoopContributions } from "./theories/indeterminate_causal_loop";
import { contributions as regNetContributions } from "./theories/reg_net";

const contributions = [
    ...causalLoopContributions,
    ...causalLoopDelaysContributions,
    ...indeterminateCausalLoopContributions,
    ...regNetContributions,
];

export default {
    namespace: "std",
    name: "motif-finding",
    contributions,
} satisfies Plugin;
