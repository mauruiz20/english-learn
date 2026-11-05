import { useLocalSearchParams } from "expo-router";
import { PracticeCollectionContainer } from "@/features/practice/practice-containers";

export default function PracticeCollectionRoute() {
  const { collection } = useLocalSearchParams<{ collection: string }>();
  return <PracticeCollectionContainer key={collection} slug={collection ?? ""} />;
}
