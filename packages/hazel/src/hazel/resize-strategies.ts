import type { ResizeStrategy } from "./hazel-integration-base";

export function createBasicResize(): ResizeStrategy {
    return {
        setup({ id, sendToHazel }) {
            let resizeObserver: ResizeObserver | null = null;
            let resizeTimeout: number | null = null;
            
            const debouncedResize = (width: number, height: number) => {
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                }
                resizeTimeout = window.setTimeout(() => {
                    console.log("[CatCoLab x Hazel] resize:", { id, width, height });
                    sendToHazel({ type: "resize", id, width, height });
                }, 100);
            };

            if (window.ResizeObserver) {
                resizeObserver = new ResizeObserver((entries) => {
                    for (const entry of entries) {
                        const { width, height } = entry.contentRect;
                        debouncedResize(width, height);
                    }
                });
                resizeObserver.observe(document.body);
            }

            return () => {
                if (resizeObserver) resizeObserver.disconnect();
                if (resizeTimeout) clearTimeout(resizeTimeout);
            };
        },
    };
}


