import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { recoverFromChunkLoadError } from "./appRecovery";

type LazyModule<P> = {
  default: ComponentType<P>;
};

export function lazyWithRetry<P>(
  loader: () => Promise<LazyModule<P>>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      return await loader();
    } catch (error) {
      if (recoverFromChunkLoadError(error)) {
        return await new Promise<LazyModule<P>>(() => undefined);
      }
      throw error;
    }
  });
}
