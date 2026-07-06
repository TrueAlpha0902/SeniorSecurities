import { useCallback, useEffect, useState } from "react";
import type { Question } from "../types";
import { getFavoriteQuestion, toggleFavoriteQuestion } from "../lib/db";

export function useFavoriteQuestion(question: Question | null) {
  const [favorite, setFavorite] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    if (!question) {
      setFavorite(false);
      return;
    }

    getFavoriteQuestion(question.id).then((record) => {
      if (active) {
        setFavorite(Boolean(record));
      }
    });

    return () => {
      active = false;
    };
  }, [question]);

  const toggle = useCallback(async () => {
    if (!question || pending) {
      return;
    }
    setPending(true);
    try {
      const next = await toggleFavoriteQuestion(question);
      setFavorite(next);
    } finally {
      setPending(false);
    }
  }, [pending, question]);

  return { favorite, pending, toggle };
}
