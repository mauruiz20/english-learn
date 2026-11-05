import { AtkinsonHyperlegible_400Regular } from "@expo-google-fonts/atkinson-hyperlegible/400Regular";
import { AtkinsonHyperlegible_700Bold } from "@expo-google-fonts/atkinson-hyperlegible/700Bold";
import { BricolageGrotesque_600SemiBold } from "@expo-google-fonts/bricolage-grotesque/600SemiBold";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { Caveat_600SemiBold } from "@expo-google-fonts/caveat/600SemiBold";
import { useFonts } from "expo-font";
import { Slot, Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AccountProvider } from "@/features/account/account-provider";
import { UpdateBanner } from "@/features/app-update/update-banner";
import { SoundPreferenceProvider } from "@/features/sound/sound-preference";
import { SoundToggle } from "@/features/sound/sound-toggle";
import { ThemePreferenceProvider } from "@/features/theme/theme-preference";
import { OriginMoveGate } from "@/features/transfer/origin-move-gate";
import { WardrobeOutfitProvider } from "@/features/wardrobe/wardrobe-outfit";
import { isDatabaseFreePath } from "@/infrastructure/auth/callback-relay";
import { SqliteAppServicesProvider } from "@/infrastructure/persistence/sqlite-app-services";
import { startServiceWorker } from "@/infrastructure/pwa/app-service-worker";
import { BackOrHomeButton, headerBack } from "@/shared/navigation/back-or-home";
import { NotebookHeader } from "@/shared/navigation/notebook-header";
import { fonts } from "@/shared/ui/theme";
import { useTheme } from "@/shared/ui/use-theme";
import { useWebDocumentTheme, useWebGlobalStyles } from "@/shared/ui/web-global-styles";

// Keep the splash screen up until the bundled fonts are ready (they ship with the app: offline).
void SplashScreen.preventAutoHideAsync();

const headerRight = () => <SoundToggle />;
// Native headers: a back button even without history (web gets it from `headerBack`).
const homeFallback = Platform.OS === "web" ? {} : { headerLeft: () => <BackOrHomeButton /> };

export default function RootLayout() {
  const { colors, scheme } = useTheme();
  useWebGlobalStyles();
  // Web: `<html data-theme>` and the browser chrome follow the scheme shown (live, system too).
  useWebDocumentTheme(scheme);
  const [loaded, error] = useFonts({
    [fonts.heading]: BricolageGrotesque_700Bold,
    [fonts.headingMedium]: BricolageGrotesque_600SemiBold,
    [fonts.body]: AtkinsonHyperlegible_400Regular,
    [fonts.bodyBold]: AtkinsonHyperlegible_700Bold,
    [fonts.hand]: Caveat_600SemiBold,
  });
  const ready = loaded || error !== null;
  // Web: Google's `/auth/callback` must never open the database (see callback-relay.ts). Read
  // once: the app only reaches that path through a full page load.
  const [databaseFree] = useState(
    () =>
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      isDatabaseFreePath(window.location.pathname),
  );

  // Web production builds: offline app shell and update checks (no-op on native and in dev).
  useEffect(() => startServiceWorker(), []);

  useEffect(() => {
    if (error !== null) console.error("Failed to load fonts", error);
    if (ready) void SplashScreen.hideAsync();
  }, [ready, error]);

  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!ready) return null;

  if (databaseFree) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper }}>
        <Slot />
      </GestureHandlerRootView>
    );
  }

  return (
    // Gesture Handler needs its root view above every gesture (word-order drag and drop).
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper }}>
      {/* A new web version waits for the learner's "Actualizar"; it never reloads on its own. */}
      <UpdateBanner />
      <SqliteAppServicesProvider>
        {/* The app's old web address: straight to the new one, or offer to take progress along. */}
        <OriginMoveGate>
          <SoundPreferenceProvider>
            {/* The learner's Sistema / Claro / Oscuro choice, read before the screens show. */}
            <ThemePreferenceProvider>
              {/* Dark icons on light paper and light icons on night paper, whatever the system. */}
              <StatusBar style={scheme === "dark" ? "light" : "dark"} />
              {/* Optional Google account and progress sync (web, on the app's own site). */}
              <AccountProvider>
                {/* Every Avi on every screen wears the learner's outfit. */}
                <WardrobeOutfitProvider>
                  <Stack
                    screenOptions={{
                      headerStyle: { backgroundColor: colors.paper },
                      headerTintColor: colors.ink,
                      headerTitleStyle: { fontFamily: fonts.headingMedium, color: colors.ink },
                      headerShadowVisible: false,
                      contentStyle: { backgroundColor: colors.paper },
                      // On web the header lines up with the page's reading column; native keeps its own.
                      ...(Platform.OS === "web" && {
                        header: ({ back, options, route, navigation }) => {
                          const backAction = headerBack(route.name, back);
                          return (
                            <NotebookHeader
                              title={options.title ?? route.name}
                              backTitle={backAction.title}
                              showBack={backAction.show && options.headerBackVisible !== false}
                              onBack={
                                backAction.target === "home"
                                  ? () => router.replace("/")
                                  : navigation.goBack
                              }
                              right={options.headerRight?.({
                                tintColor: colors.ink,
                                canGoBack: back !== undefined,
                              })}
                            />
                          );
                        },
                      }),
                    }}
                  >
                    <Stack.Screen name="index" options={{ title: "Inicio", headerShown: false }} />
                    {/* Exercise screens keep the sound switch at hand, in the header. */}
                    <Stack.Screen
                      name="placement"
                      options={{ title: "Test de nivel", headerRight }}
                    />
                    <Stack.Screen name="lesson/[id]" options={{ title: "Lección", headerRight }} />
                    <Stack.Screen name="review" options={{ title: "Repaso", headerRight }} />
                    <Stack.Screen name="album" options={{ title: "Álbum", ...homeFallback }} />
                    <Stack.Screen name="armario" options={{ title: "Armario", ...homeFallback }} />
                    <Stack.Screen
                      name="fichas/index"
                      options={{ title: "Fichas", ...homeFallback }}
                    />
                    <Stack.Screen
                      name="fichas/[id]/index"
                      options={{ title: "Ficha", ...homeFallback }}
                    />
                    <Stack.Screen
                      name="fichas/[id]/practicar"
                      options={{ title: "Práctica", headerRight }}
                    />
                    <Stack.Screen
                      name="practica/index"
                      options={{ title: "Práctica libre", ...homeFallback }}
                    />
                    <Stack.Screen
                      name="practica/[collection]"
                      options={{ title: "Práctica libre", ...homeFallback }}
                    />
                    <Stack.Screen name="about" options={{ title: "Acerca de", ...homeFallback }} />
                    <Stack.Screen name="cuenta" options={{ title: "Cuenta", ...homeFallback }} />
                    <Stack.Screen
                      name="privacidad"
                      options={{ title: "Privacidad", ...homeFallback }}
                    />
                    <Stack.Screen
                      name="auth/completar"
                      options={{ title: "Cuenta", headerBackVisible: false }}
                    />
                    <Stack.Screen
                      name="importar"
                      options={{ title: "Importar progreso", headerBackVisible: false }}
                    />
                  </Stack>
                </WardrobeOutfitProvider>
              </AccountProvider>
            </ThemePreferenceProvider>
          </SoundPreferenceProvider>
        </OriginMoveGate>
      </SqliteAppServicesProvider>
    </GestureHandlerRootView>
  );
}
