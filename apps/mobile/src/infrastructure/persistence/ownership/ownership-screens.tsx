import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";

type OwnershipScreenProps = { onUseHere: () => void };

/** Another tab or the installed app holds the database (web: one page at a time). */
export function OpenElsewhereScreen({ onUseHere }: OwnershipScreenProps) {
  return (
    <ScreenContainer title="La app está abierta en otra pestaña o ventana" insetTop>
      <Text>Puedes usarla aquí: la otra pestaña guarda lo que tenga pendiente y se pausa.</Text>
      <Button label="Usar aquí" onPress={onUseHere} />
    </ScreenContainer>
  );
}

/** This tab handed the database to another one ("Usar aquí" there). */
export function ReleasedScreen({ onUseHere }: OwnershipScreenProps) {
  return (
    <ScreenContainer title="La app se abrió en otra pestaña" insetTop>
      <Text>Tu progreso está guardado. Para seguir en esta pestaña, pulsa Usar aquí.</Text>
      <Button label="Usar aquí" onPress={onUseHere} />
    </ScreenContainer>
  );
}
