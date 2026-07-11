import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { recoverFromChunkLoadError } from "./appRecovery";

type LazyModule<T extends ComponentType> = {
  default: T;
};

export function lazyWithRetry<T extends ComponentType>(
  loader: () => Promise<LazyModule<T>>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await loader();
    } catch (error) {
      if (recoverFromChunkLoadError(error)) {
        return await new Promise<LazyModule<T>>(() => undefined);
      }
      throw error;
    }
  });
}
