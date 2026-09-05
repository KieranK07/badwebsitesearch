export function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 70 ? "score-hot" : score >= 40 ? "score-warm" : "score-cool";
  return <span className={`score-pill ${cls}`}>{score}</span>;
}
