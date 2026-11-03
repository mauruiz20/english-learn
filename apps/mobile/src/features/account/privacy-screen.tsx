import type { ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { TOUCH_TARGET, spacing } from "@/shared/ui/theme";

export const PRIVACY_LAST_UPDATED = "3 de noviembre de 2026";
const CONTACT_EMAIL = "mauricio@southernmadelabs.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" variant="title" tone="ink">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** `/privacidad`: what the optional account stores, where, why, and how to delete it. */
export function PrivacyScreen() {
  return (
    <ScreenContainer title="Privacidad">
      <Text variant="small" tone="muted">{`Última actualización: ${PRIVACY_LAST_UPDATED}`}</Text>
      <Text>
        English Learn funciona sin cuenta: tu progreso queda guardado en tu dispositivo. Esta
        política se aplica solo si creas una cuenta (opcional) para sincronizar tu progreso.
      </Text>

      <Section title="Qué guardamos">
        <Text>• Tu email y el identificador de tu cuenta de Google.</Text>
        <Text>
          • Tus eventos de aprendizaje: lecciones y repasos completados, respuestas calificadas,
          resultado del test de nivel, con su fecha, y un identificador de cada dispositivo.
        </Text>
        <Text>
          • Las respuestas que marques como correctas con «Mi respuesta también es correcta»: el
          texto que escribiste y el ejercicio.
        </Text>
        <Text>No guardamos en el servidor tu contraseña de Google ni tu nombre o foto.</Text>
        <Text>
          Tu nombre de pila (el de tu cuenta de Google) queda solo en este dispositivo, para
          saludarte en el inicio, y se borra al cerrar sesión.
        </Text>
      </Section>

      <Section title="Dónde">
        <Text>
          En un servidor en Argentina (una Raspberry Pi del responsable de la app), detrás de
          Cloudflare, que transporta las conexiones cifradas.
        </Text>
      </Section>

      <Section title="Para qué">
        <Text>
          Para sincronizar tu progreso entre tus dispositivos y, con las respuestas que marcaste
          como correctas, mejorar los ejercicios (por ejemplo, aceptar otras formas correctas de
          escribir una oración). No hay publicidad ni rastreo, y no compartimos tus datos con
          terceros.
        </Text>
      </Section>

      <Section title="Cuánto tiempo">
        <Text>Hasta que elimines tu cuenta.</Text>
      </Section>

      <Section title="Cómo eliminar tus datos">
        <Text>
          En Cuenta, toca «Eliminar cuenta»: borramos del servidor tu cuenta y todo el progreso
          guardado en ella. El progreso de tu dispositivo no se toca.
        </Text>
      </Section>

      <Section title="Contacto">
        <Text
          accessibilityRole="link"
          tone="ink"
          style={styles.link}
          onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
        >
          {CONTACT_EMAIL}
        </Text>
      </Section>
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
