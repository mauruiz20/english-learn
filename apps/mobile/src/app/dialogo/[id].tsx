import { useLocalSearchParams } from "expo-router";
import { DialogueContainer } from "@/features/dialogues/dialogue-container";

export default function DialogueRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Remount per dialogue so another dialogue always starts from its intro.
  return <DialogueContainer key={id} dialogueId={id ?? ""} />;
}
