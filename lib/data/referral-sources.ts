export interface ReferralSource {
  code: string;
  name: string;
}

export const REFERRAL_SOURCES: ReferralSource[] = [
  { code: "search_engine", name: "Search Engine" },
  { code: "social_media", name: "Social Media" },
  { code: "friend_colleague", name: "Friend/Colleague" },
  { code: "github", name: "GitHub" },
  { code: "blog_article", name: "Blog/Article" },
  { code: "youtube", name: "YouTube" },
  { code: "reddit", name: "Reddit" },
  { code: "hacker_news", name: "Hacker News" },
  { code: "other", name: "Other" },
];
