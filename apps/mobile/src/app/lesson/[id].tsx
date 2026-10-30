import { useLocalSearchParams } from "expo-router";
import { PlaceholderScreen } from "@/features/placeholder/placeholder-screen";

export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title={`Lección ${id}`} />;
}
