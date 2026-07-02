/**
 * Register happy-dom globals (document, window, HTMLElement, ...) so tsx
 * samples can mount Solid components into a real-enough DOM.
 *
 * This module is injected (by absolute path) at the top of every compiled tsx
 * sample, so it must resolve `@happy-dom/global-registrator` from this
 * package, not from the consuming package.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
