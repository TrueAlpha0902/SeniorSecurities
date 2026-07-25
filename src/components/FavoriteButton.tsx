import { Star } from "lucide-react";
import type { Question } from "../types";
import { useFavoriteQuestion } from "../hooks/useFavoriteQuestion";

type FavoriteButtonProps = {
  question: Question | null;
};

export function FavoriteButton({ question }: FavoriteButtonProps) {
  const { favorite, pending, toggle } = useFavoriteQuestion(question);

  return (
    <button
      className={`favorite-button ${favorite ? "is-favorite" : ""}`}
      type="button"
      onClick={toggle}
      disabled={!question || pending}
      aria-label={favorite ? "移除收藏" : "加入收藏"}
      title={favorite ? "移除收藏" : "加入收藏"}
    >
      <Star aria-hidden="true" size={22} fill={favorite ? "currentColor" : "none"} />
    </button>
  );
}
