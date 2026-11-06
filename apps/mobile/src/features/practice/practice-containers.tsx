import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import type { LessonResult } from "@english-learn/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useProgressVersion } from "@/features/account/account-context";
import { useAppServices } from "@/infrastructure/services/app-services";
import {
  practiceCollectionBySlug,
  practiceCollectionRows,
  practiceGroupRows,
} from "./model/practice-catalog";
import {
  PracticeCollectionView,
  type PracticeCollectionViewState,
} from "./practice-collection-view";
import { dialoguePath, practiceCollectionPath, practiceLessonPath } from "./practice-routes";
import { PracticeView, type PracticeViewState } from "./practice-view";

/** Loads the lesson results every time the screen gains focus (and after a sync). */
function useLessonResults(
  onLoaded: (results: readonly LessonResult[]) => void,
  onError: () => void,
) {
  const { progressRepository } = useAppServices();
  const progressVersion = useProgressVersion();
  const load = useCallback(() => {
    let active = true;
    progressRepository.getLessonResults().then(
      (results) => active && onLoaded(results),
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load the practice results", error);
        onError();
      },
    );
    return () => {
      active = false;
    };
    // `progressVersion` reloads after a sync brought progress from another device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressRepository, onLoaded, onError, progressVersion]);
  useFocusEffect(load);
}

/** `/practica`: the collections, with how many of their lessons are done. */
export function PracticeContainer({ content = corpus }: { content?: Corpus }) {
  const router = useRouter();
  const [state, setState] = useState<PracticeViewState>({ status: "loading" });
  const onLoaded = useCallback(
    (results: readonly LessonResult[]) =>
      setState({ status: "ready", collections: practiceCollectionRows(content, results) }),
    [content],
  );
  const onError = useCallback(() => setState({ status: "error" }), []);
  useLessonResults(onLoaded, onError);
  return (
    <PracticeView
      state={state}
      onOpenCollection={(slug) => router.push(practiceCollectionPath(slug))}
    />
  );
}

/** `/practica/[collection]`: its groups, and each lesson's (or dialogue's) best result. */
export function PracticeCollectionContainer({
  slug,
  content = corpus,
}: {
  slug: string;
  content?: Corpus;
}) {
  const router = useRouter();
  const collection = practiceCollectionBySlug(content, slug);
  const [state, setState] = useState<PracticeCollectionViewState>(
    collection === undefined ? { status: "not-found" } : { status: "loading" },
  );
  const onLoaded = useCallback(
    (results: readonly LessonResult[]) => {
      if (collection === undefined) return;
      setState({
        status: "ready",
        title: collection.title,
        summary: collection.summary,
        topic: slug,
        groups: practiceGroupRows(collection, content, results),
      });
    },
    [collection, content, slug],
  );
  const onError = useCallback(
    () => collection !== undefined && setState({ status: "error" }),
    [collection],
  );
  useLessonResults(onLoaded, onError);
  return (
    <PracticeCollectionView
      state={state}
      onOpenLesson={(id) =>
        router.push(content.dialoguesById.has(id) ? dialoguePath(id) : practiceLessonPath(id))
      }
    />
  );
}
