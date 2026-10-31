import { Platform } from "react-native";
import { createBrowserOwnership } from "./browser-ownership";
import type { DatabaseOwnership } from "./database-ownership";

/** Native apps own their database file alone: nothing to coordinate. */
const nativeOwnership: DatabaseOwnership = {
  start: async () => "owned",
  takeOver: async () => "owned",
  serve: () => () => {},
};

export function createPlatformOwnership(): DatabaseOwnership {
  return Platform.OS === "web" && typeof window !== "undefined"
    ? createBrowserOwnership()
    : nativeOwnership;
}
