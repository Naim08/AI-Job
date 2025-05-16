export interface UserProfile {
  readonly id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  settings?: UserProfileSettings | null;
  created_at?: string;
  updated_at?: string;
  resume_path?: string;
}

export interface UserProfileSettings {
  jobSearchSettings?: Array<string> | null;
  jobSearchLocation?: Array<string> | null;
  // ... existing code ...
  active_model?: string;
}

export interface ResumeChunk {
  readonly id: string;
  readonly userId: string;
  content: string;
  readonly embedding: ReadonlyArray<number>;
}

export interface FAQ {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

export interface BlacklistItem {
  readonly id: string;
  readonly type: 'company' | 'keyword';
  readonly value: string;
}

export interface JobListing {
  readonly id: string;
  title: string;
  company: string;
  description: string;
  url: string;
  readonly keywords?: ReadonlyArray<string>;
}

export interface FilterScore {
  readonly jobListingId: string;
  readonly score: number;
  readonly explanation?: string;
  readonly similarity: number; // 0-1
  readonly blacklisted: boolean;
  readonly confidence: number; // 0-1
}

export type ApplicationStatus = 'not_applied' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'ghosted' | 'error' | 'dry_run_complete' | 'submitted';

export interface DecisionNode {
  readonly title: string;
  readonly pass: boolean;
  readonly children?: ReadonlyArray<DecisionNode>;
}

export interface Answer {
  readonly question: string;
  readonly answer: string;
  readonly refs: ReadonlyArray<string>;
  readonly id?: string;
  needs_review?: boolean;
} 