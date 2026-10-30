// react-dom ships with Expo for web but without types; the app only uses `createPortal` (web).
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";

  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null,
  ): ReactPortal;
}
