import type { ComponentRef } from "react";
import type { View } from "react-native";

/** A mounted view, as refs hand it over (it can be measured). */
export type ViewRef = ComponentRef<typeof View>;
