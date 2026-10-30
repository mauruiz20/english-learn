import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SqliteAppServicesProvider } from "@/infrastructure/persistence/sqlite-app-services";

export default function RootLayout() {
  return (
    <SqliteAppServicesProvider>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="index" options={{ title: "Inicio", headerShown: false }} />
        <Stack.Screen name="placement" options={{ title: "Test de nivel" }} />
        <Stack.Screen name="lesson/[id]" options={{ title: "Lección" }} />
        <Stack.Screen name="review" options={{ title: "Repaso" }} />
        <Stack.Screen name="about" options={{ title: "Acerca de" }} />
      </Stack>
    </SqliteAppServicesProvider>
  );
}
