import { Linking, StyleSheet, View } from "react-native";
import { Doodle } from "@/shared/ui/doodle";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, spacing } from "@/shared/ui/theme";

const TATOEBA_URL = "https://tatoeba.org";
const LICENSE_URL = "https://creativecommons.org/licenses/by/2.0/fr/";

function ExternalLink({ url, label }: { url: string; label: string }) {
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={label}
      tone="ink"
      style={styles.link}
      onPress={() => void Linking.openURL(url)}
    >
      {label}
    </Text>
  );
}

export function AboutScreen() {
  return (
    <ScreenContainer title="Acerca de">
      <Doodle name="pencil" />
      <Text>Aplicación para practicar inglés sin conexión, pensada para hispanohablantes.</Text>

      <View style={styles.section}>
        <Text accessibilityRole="header" variant="title" tone="ink">
          Atribuciones
        </Text>
        <Text>
          Las oraciones de ejemplo provienen de Tatoeba y se usan bajo la licencia Creative Commons
          Atribución 2.0 Francia (CC BY 2.0 FR).
        </Text>
        <View>
          <ExternalLink url={TATOEBA_URL} label="tatoeba.org" />
          <ExternalLink url={LICENSE_URL} label="Licencia CC BY 2.0 FR" />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  link: {
    alignSelf: "flex-start",
    minHeight: TOUCH_TARGET - 4,
    paddingVertical: spacing.sm + 2,
    textDecorationLine: "underline",
  },
});
