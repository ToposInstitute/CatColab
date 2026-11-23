import credentials from "./logged_in_credentials.json" with { type: "json" };
import { loggedInScenario } from "./logged_in_scenario.ts";

export {
    appLoads,
    noConsoleErrors,
    noHttpErrorCodes,
    noUnhandledPromiseRejections,
    noUncaughtExceptions,
    waitForApp,
} from "./shared_spec.ts";

const scenario = loggedInScenario(credentials.email, credentials.password);
export const loginActions = scenario.loginActions;
export const loginCompletes = scenario.loginCompletes;
export const nextActions = scenario.nextActions;
