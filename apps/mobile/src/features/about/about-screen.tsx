import { Linking, StyleSheet, Text } from "react-native";
import { Screen } from "@/shared/ui/screen";
import { colors } from "@/shared/ui/theme";

const TATOEBA_URL = "https://tatoeba.org";
const LICENSE_URL = "https://creativecommons.org/licenses/by/2.0/fr/";

function ExternalLink({ url, label }: { url: string; label: string }) {
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.link}
      onPress={() => void Linking.openURL(url)}
    >
      {label}
    </Text>
  );
}

export function AboutScreen() {
  return (
    <Screen title="Acerca de">
      <Text style={styles.body}>
        Aplicación para practicar inglés sin conexión, pensada para hispanohablantes.
      </Text>

      <Text accessibilityRole="header" style={styles.heading}>
        Atribuciones
      </Text>
      <Text style={styles.body}>
        Las oraciones de ejemplo provienen de Tatoeba y se usan bajo la licencia Creative Commons
        Atribución 2.0 Francia (CC BY 2.0 FR).
      </Text>
      <ExternalLink url={TATOEBA_URL} label="tatoeba.org" />
      <ExternalLink url={LICENSE_URL} label="Licencia CC BY 2.0 FR" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  link: { fontSize: 16, color: colors.primary, textDecorationLine: "underline" },
});
