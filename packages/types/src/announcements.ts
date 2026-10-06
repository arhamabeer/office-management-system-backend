/** Publication state. Manager-posted notices start `Pending` until Operations approves. */
export type AnnouncementStatus = 'Published' | 'Pending' | 'Rejected';

/** A company-wide announcement. Admins/Operations publish directly; managers submit for approval. */
export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  status: AnnouncementStatus;
  publishedAt: string;
  expiresAt?: string;
  authorName?: string;
  /** Posted by the current viewer. */
  mine: boolean;
  /** Rejection reason, when status is `Rejected`. */
  decisionNote?: string;
  /** Whether the current viewer has read it. */
  read: boolean;
  /** How many people have read it (for the author's view). */
  readCount: number;
  createdAt: string;
}
