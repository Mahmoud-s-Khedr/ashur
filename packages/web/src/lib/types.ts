import type { Settings, Phase } from '@ashour/shared';

export type PublicTeam = {
  id: number;
  name: string;
  color: string;
  status: string;
  logoV?: number;
  code?: string;
};

export type LineupTeam = PublicTeam & {
  ready: boolean;
  progress: number;
  score: number | null;
  card: number | null;
  finishMs: number | null;
  checkedIn: boolean;
  online: boolean;
  answered: boolean;
  bonus: number;
  verdict?: 'correct' | 'wrong' | 'pending' | null;
  device?: { last_seen_at: number; rtt_ms: number | null } | undefined;
};

export type PublicQuestion = {
  id: number;
  body: string;
  type: 'mcq' | 'text' | 'numeric';
  options: string[];
  category: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'joker';
  correct?: number | string[];
  explanation?: string;
};

export type RoundView = {
  key: string;
  stage: number;
  seq: number;
  teamIds: number[];
  winner?: number;
  winners?: number[];
  completed?: boolean;
  teams: PublicTeam[];
};

export type Snapshot = {
  version: number;
  serverNow: number;
  spinAt: number;
  categories: string[];
  roundKey: string;
  stage: 1 | 2 | 3;
  rulesShown: boolean;
  seq: number;
  phase: Phase;
  scene: string;
  paused: boolean;
  endsAt: number;
  remainingMs: number;
  autoAt: number;
  autoAction: string;
  category: string;
  index: number;
  settings: Settings;
  winner?: number;
  winners?: number[];
  tieIds: number[];
  ready: number[];
  team: PublicTeam | null;
  active: boolean;
  lineup: LineupTeam[];
  ownScore: number | null;
  ownProgress: number;
  ownFinishMs: number | null;
  ownBonus: number;
  ownCard: number | null;
  submitted: boolean;
  question: PublicQuestion | null;
  prizeQuestion?: {
    count: number;
    eligible?: boolean;
    current: {
      questionId?: number;
      body: string;
      answer?: string;
      status: 'draft' | 'question' | 'answer' | 'done';
    } | null;
  } | null;
  audienceQuestion: {
    questionId?: number;
    body: string;
    answer?: string;
    status: 'draft' | 'question' | 'answer' | 'done';
  } | null;
  rounds: RoundView[];
  // admin only
  teams?: (PublicTeam & { code: string })[];
  devices?: {
    id: string;
    role: string;
    team_id: number | null;
    seat_no: number | null;
    last_seen_at: number;
    rtt_ms: number | null;
  }[];
  set?: number[];
  questions?: any[];
  answers?: any[];
  audit?: any[];
};

export type Send = (type: string, payload?: Record<string, unknown>) => void;
export type Bulk = (type: string, payload: unknown) => Promise<boolean | undefined>;
