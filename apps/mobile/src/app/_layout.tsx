import { AtkinsonHyperlegible_400Regular } from "@expo-google-fonts/atkinson-hyperlegible/400Regular";
import { AtkinsonHyperlegible_700Bold } from "@expo-google-fonts/atkinson-hyperlegible/700Bold";
import { BricolageGrotesque_600SemiBold } from "@expo-google-fonts/bricolage-grotesque/600SemiBold";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { Caveat_600SemiBold } from "@expo-google-fonts/caveat/600SemiBold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SqliteAppServicesProvider } from "@/infrastructure/persistence/sqlite-app-services";
import { NotebookHeader } from "@/shared/navigation/notebook-header";
import { fonts } from "@/shared/ui/theme";
import { useTheme } from "@/shared/ui/use-theme";
import { useWebGlobalStyles } from "@/shared/ui/web-global-styles";

// Keep the splash screen up until the bundled fonts are ready (they ship with the app: offline).
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colors } = useTheme();
  useWebGlobalStyles();
  const [loaded, error] = useFonts({
    [fonts.heading]: BricolageGrotesque_700Bold,
    [fonts.headingMedium]: BricolageGrotesque_600SemiBold,
    [fonts.body]: AtkinsonHyperlegible_400Regular,
    [fonts.bodyBold]: AtkinsonHyperlegible_700Bold,
    [fonts.hand]: Caveat_600SemiBold,
  });
  const ready = loaded || error !== null;

  useEffect(() => {
    if (error !== null) console.error("Failed to load fonts", error);
    if (ready) void SplashScreen.hideAsync();
  }, [ready, error]);

  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!ready) return null;

  return (
    <SqliteAppServicesProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.headingMedium, color: colors.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.paper },
          // On web the header lines up with the page's reading column; native keeps its own.
          ...(Platform.OS === "web" && {
            header: ({ back, options, route, navigation }) => (
              <NotebookHeader
                title={options.title ?? route.name}
                backTitle={back?.title}
                showBack={back !== undefined && options.headerBackVisible !== false}
                onBack={navigation.goBack}
              />
            ),
          }),
        }}
      >
        <Stack.Screen name="index" options={{ title: "Inicio", headerShown: false }} />
        <Stack.Screen name="placement" options={{ title: "Test de nivel" }} />
        <Stack.Screen name="lesson/[id]" options={{ title: "Lección" }} />
        <Stack.Screen name="review" options={{ title: "Repaso" }} />
        <Stack.Screen name="about" options={{ title: "Acerca de" }} />
      </Stack>
    </SqliteAppServicesProvider>
  );
}
