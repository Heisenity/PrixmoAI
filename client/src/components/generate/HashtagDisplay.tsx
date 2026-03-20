export const HashtagDisplay = ({ hashtags }: { hashtags: string[] }) => (
  <div className="hashtag-cloud">
    {hashtags.map((tag) => (
      <span key={tag}>{tag}</span>
    ))}
  </div>
);
