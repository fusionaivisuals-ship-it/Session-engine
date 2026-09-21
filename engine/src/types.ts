// Method types (loaded from JSON)

export interface MethodLens {
  id: string;
  name: string;
  instruction: string;
  colour?: string;
}

export interface MethodRole {
  id: string;
  name: string;
  brief: string;
  hiddenBrief?: string;
}

export interface MethodHelper {
  systemPrompt: string;
  hintStyle?: string;
  examplePool?: string[];
}

export interface RubricCriterion {
  id: string;
  text: string;
  weight?: number;
  scoring?: { zero: string; one: string; two: string };
}

export interface RubricExample {
  decision: string;
  verdict: 'pass' | 'fail';
  why: string;
}

export interface MethodRubric {
  passThreshold: number;
  criteria: RubricCriterion[];
  examples?: RubricExample[];
}

export interface BlockWalkthrough {
  whatHappens: string;
  whyItMatters: string;
  watchFor?: string;
}

export interface MethodBlock {
  id: string;
  type: 'frame' | 'assign' | 'private_input' | 'reveal' | 'converge' | 'commit' | 'artifact';
  title: string;
  timeboxSec: number;
  completion: CompletionRule;
  lensId?: string;
  prompt?: string;
  sourceBlockId?: string;
  assignStrategy?: 'random' | 'choose' | 'facilitator';
  minWords?: number;
  helper?: MethodHelper;
  rubric?: MethodRubric;
  stuck?: { idleSec?: number; enabled?: boolean };
  ideaBlock?: boolean;
  walkthrough?: BlockWalkthrough;
}

export type DetourTrigger = 'converge_failed_twice' | 'ideas_thin' | 'facilitator';

export interface MethodFallback {
  trigger: DetourTrigger;
  detourMethodId: string;
  blockIds: string[];
  reason: string;
}

export interface MethodDefaults {
  anonymous?: boolean;
}

export interface WalkthroughIntro {
  inOneLine: string;
  bestFor: string;
  howLong: string;
  origin: string;
}

export interface Method {
  id: string;
  name: string;
  version: string;
  description?: string;
  roleMode: 'rotating' | 'fixed';
  groupSize: { min: number; max: number };
  timing: {
    totalBudgetSec: number;
    extensionSec: number;
    idleSec: number;
    presenceTimeoutSec: number;
  };
  defaults?: MethodDefaults;
  roles?: MethodRole[];
  lenses?: MethodLens[];
  blocks: MethodBlock[];
  fallbacks?: MethodFallback[];
  walkthroughIntro?: WalkthroughIntro;
}

// Session state types (manifest on disk)

export type CompletionRule = 'all_submitted' | 'all_confirmed' | 'all_agreed' | 'all_assigned' | 'reviewer_pass' | 'valid_form' | 'auto';
export type ExitReason = 'pending' | 'gate' | 'timeout' | 'facilitator_override' | 'auto';
export type Presence = 'present' | 'idle' | 'absent';
export type SessionStatus = 'lobby' | 'running' | 'paused' | 'complete';
export type SessionMode = 'solo' | 'group';

export interface Submission {
  seat: string;
  text: string;
  submittedAt: string;
  autoSubmitted: boolean;
  passed: boolean;
  passReason?: string | null;
  wordCount: number;
}

export interface StuckEvent {
  seat: string;
  step: 'hint' | 'example' | 'swap' | 'pass' | 'facilitator';
  at: string;
}

export interface VerdictScore {
  criterion: string;
  score: number;
  evidence: string;
  unverifiedEvidence?: boolean;
  concern?: 'none' | 'missing_evidence' | 'weak_reasoning' | 'contradiction';
  explanation?: string;
}

export interface ReviewerVerdict {
  decisionRound?: number;
  decision?: string;
  pass: boolean;
  scores: VerdictScore[];
  ignoredLenses: string[];
  oneLineFeedback: string;
  confidence: number;
  modelPassDiffered?: boolean;
  at: string;
}

export interface BlockRecord {
  decisionAcceptance?: { seat: string; decision: string; round: number; reason: string; at: string };
  drafts?: Record<string, string>;
  votes?: Record<string, string>;
  decisionRound?: number;
  enteredAt: string;
  exitedAt?: string | null;
  exitReason: ExitReason;
  overrideReason?: string | null;
  submissions?: Submission[];
  confirmations?: string[];
  reveal?: {
    clusters?: { label: string; seats: string[]; summary?: string }[];
    disagreements?: string[];
    agreements?: string[];
    clusteringFailed?: boolean;
  };
  decision?: string | null;
  reviewerVerdicts?: ReviewerVerdict[];
  stuckEvents?: StuckEvent[];
}

export interface Participant {
  seat: string;
  displayName: string;
  roleId?: string | null;
  presence: Presence;
  lastSeenAt: string;
  swapsUsed: number;
}

export interface SessionFacts {
  problemStatement?: string | null;
  decision?: string | null;
  commitment?: {
    owner: string;
    firstAction: string;
    dueDate: string;
    successSignal: string;
  } | null;
}

export interface ModelCallMetric {
  tool: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  at: string;
  retried: boolean;
}

export interface SessionMetrics {
  frameToCommitSec?: number | null;
  wordsBySeat?: Record<string, number>;
  lensCoverage?: Record<string, 'substantive' | 'token' | 'pass' | 'missing'>;
  modelCalls?: ModelCallMetric[];
  anonymous?: boolean;
}

export interface DetourRecord {
  trigger: DetourTrigger;
  detourMethodId: string;
  insertedBlockIds: string[];
  reason: string;
  accepted: boolean;
  at: string;
}

export interface SessionState {
  roomCode: string;
  methodId: string;
  methodVersion: string;
  createdAt: string;
  status: SessionStatus;
  mode: SessionMode;
  anonymous: boolean;
  effectiveMethod?: Method;
  pendingDetour?: {
    trigger: DetourTrigger;
    detourMethodId: string;
    blocks: MethodBlock[];
    lenses: MethodLens[];
    addedMinutes: number;
    reason: string;
  };
  facilitatorSeat?: string;
  clock: {
    blockStartedAt: string | null;
    remainingSecAtPause: number | null;
    extensionsUsed: Record<string, number>;
    extensionSeconds?: Record<string, number>;
    savedAt?: string;
    totalElapsedSec: number;
  };
  participants: Participant[];
  currentBlockId: string | null;
  blocks: Record<string, BlockRecord>;
  facts: SessionFacts;
  metrics: SessionMetrics;
  detours?: DetourRecord[];
  artifacts?: {
    onePagerPath?: string;
    reportPath?: string;
  };
}

export interface CanAdvanceResult {
  ok: boolean;
  reason: string;
}
