import { useLocalSearchParams } from "expo-router";
import { LessonContainer } from "@/features/lesson/lesson-container";

export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Remount per lesson so a new lesson always starts a fresh session.
  return <LessonContainer key={id} lessonId={id ?? ""} />;
}
