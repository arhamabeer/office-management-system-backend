import type { GoalStatus, ReviewCycleStatus, ReviewStatus } from './enums';

/** A configurable goal category (Delivery, Growth, Collaboration, …). */
export interface GoalCategoryDTO {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

/** One level of the configurable rating scale (e.g. { value: 5, label: 'Outstanding' }). */
export interface RatingLevelDTO {
  value: number;
  label: string;
}

/** Singleton performance policy — the tunable rating scale + options. */
export interface PerformancePolicyDTO {
  ratingLevels: RatingLevelDTO[];
  /** Whether employees submit a self-assessment before the manager review. */
  selfReviewEnabled: boolean;
}

/** A review period (e.g. "H2 2026") that reviews are grouped under. */
export interface ReviewCycleDTO {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: ReviewCycleStatus;
  createdAt: string;
}

/** An employee goal and its approval/progress lifecycle (see GOAL_STATUSES). */
export interface GoalDTO {
  id: string;
  userId: string;
  employeeName?: string;
  cycleId?: string;
  cycleName?: string;
  categoryId?: string;
  categoryName?: string;
  title: string;
  description?: string;
  weight?: number;
  progress: number; // 0–100
  status: GoalStatus;
  dueDate?: string; // YYYY-MM-DD
  decidedById?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** A manager's appraisal of an employee for a cycle (see REVIEW_STATUSES). */
export interface ReviewDTO {
  id: string;
  userId: string;
  employeeName?: string;
  cycleId: string;
  cycleName?: string;
  reviewerId: string;
  reviewerName?: string;
  rating?: number;
  ratingLabel?: string;
  comments?: string;
  strengths?: string;
  improvements?: string;
  status: ReviewStatus;
  sharedAt?: string;
  createdAt: string;
  updatedAt: string;
}
