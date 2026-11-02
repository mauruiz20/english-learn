import { useLocalSearchParams } from "expo-router";
import { CardContainer } from "@/features/cards/card-container";

export default function CardRoute() {
  const { id, volver } = useLocalSearchParams<{ id: string; volver?: string }>();
  return <CardContainer key={id} cardId={id ?? ""} fromSession={volver === "1"} />;
}
