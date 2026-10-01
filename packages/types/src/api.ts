/** Standard API response envelope shared by server and clients (PLAN.md §8). */

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error: ApiErrorShape;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}
