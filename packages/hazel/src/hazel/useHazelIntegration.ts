import { type HazelIntegrationConfig, createHazelIntegration } from "./hazel-integration-base";
import { createBasicResize } from "./resize-strategies";

export function useHazelIntegration(config: Omit<HazelIntegrationConfig, "resizeStrategy">) {
    return createHazelIntegration({ ...config, resizeStrategy: createBasicResize() });
}
