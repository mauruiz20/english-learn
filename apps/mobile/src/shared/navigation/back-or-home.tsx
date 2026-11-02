import { useRouter } from "expo-router";
import { BackArrowButton } from "./back-arrow-button";

/**
 * Screens that must always offer a way home. They are often opened without stack history: a
 * shared link, a reload, or the return from the Google sign-in redirect (`router.replace`).
 */
export const HOME_FALLBACK_ROUTES: ReadonlySet<string> = new Set([
  "cuenta",
  "privacidad",
  "about",
  "album",
  "fichas/index",
  "fichas/[id]/index",
]);

export type HeaderBack = {
  show: boolean;
  title: string | undefined;
  /** "back" pops the stack; "home" replaces the screen with `/` (there is nothing to pop). */
  target: "back" | "home";
};

/** What the web header's back button does on `routeName`, given the stack's `back` info. */
export function headerBack(
  routeName: string,
  back: { title?: string | undefined } | undefined,
): HeaderBack {
  if (back !== undefined) return { show: true, title: back.title, target: "back" };
  if (HOME_FALLBACK_ROUTES.has(routeName)) return { show: true, title: "Inicio", target: "home" };
  return { show: false, title: undefined, target: "back" };
}

/** Header back button (native headers) that goes back, or home when there is no history. */
export function BackOrHomeButton() {
  const router = useRouter();
  const canGoBack = router.canGoBack();
  return (
    <BackArrowButton
      label={canGoBack ? "Volver" : "Volver a Inicio"}
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
