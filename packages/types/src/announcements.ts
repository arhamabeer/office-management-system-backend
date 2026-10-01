/** A company-wide announcement posted by an Owner/Admin. */
export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
  expiresAt?: string;
  authorName?: string;
  /** Whether the current viewer has read it. */
  read: boolean;
  /** How many people have read it (for the author's view). */
  readCount: number;
  createdAt: string;
}
