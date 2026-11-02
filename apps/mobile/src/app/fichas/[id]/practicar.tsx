import { useLocalSearchParams } from "expo-router";
import { CardPracticeContainer } from "@/features/cards/card-practice-container";

export default function CardPracticeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Remount per card so a new practice always starts a fresh session.
  return <CardPracticeContainer key={id} cardId={id ?? ""} />;
}
