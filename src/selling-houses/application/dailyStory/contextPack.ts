export interface DailyCityStoryContextPack {
  readonly packId: string;
  readonly day: number;
  readonly reportTitle: string;
  readonly cityFrame: {
    readonly dayLabel: string;
    readonly currentPeriod: 'morning' | 'afternoon' | 'evening' | 'night' | 'unknown';
    readonly districts: readonly string[];
    readonly weatherOrExternalNotes: readonly string[];
    readonly marketMood: string;
  };
  readonly scoreboard: {
    readonly totalScore?: { readonly value: number; readonly unit: string };
    readonly sharpestDeltas: Array<{ readonly label: string; readonly value: number; readonly unit: string; readonly direction: 'up' | 'down' | 'flat' }>;
    readonly riskCount?: number;
  };
  readonly visibleEvents: readonly DailyStoryVisibleEvent[];
  readonly visibleCases: readonly DailyStoryVisibleCase[];
  readonly visibleOwners: readonly DailyStoryVisibleOwner[];
  readonly visibleCustomers: readonly DailyStoryVisibleCustomer[];
  readonly todayPlan: {
    readonly label: string;
    readonly theme: string;
    readonly energy: number;
    readonly focusCases: readonly string[];
    readonly priorities: readonly string[];
  };
  readonly constraints: readonly string[];
}

export interface DailyStoryVisibleEvent {
  readonly eventId: string;
  readonly actor: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: 'success' | 'danger' | 'accent' | 'neutral';
  readonly evidenceRef?: string;
  readonly relatedCaseTitle?: string;
  readonly relatedCustomerName?: string;
  readonly relatedOwnerName?: string;
  readonly relatedDistrict?: string;
}

export interface DailyStoryVisibleCase {
  readonly caseId: string;
  readonly title: string;
  readonly district?: string;
  readonly layout?: string;
  readonly areaSqm?: number;
  readonly visibleStatus: string;
  readonly pressureLabels: readonly string[];
}

export interface DailyStoryVisibleOwner {
  readonly ownerId: string;
  readonly displayName: string;
  readonly relatedCaseTitle?: string;
  readonly visibleMood: string;
  readonly pressureLabels: readonly string[];
}

export interface DailyStoryVisibleCustomer {
  readonly customerId: string;
  readonly displayName: string;
  readonly intentLabel: string;
  readonly relatedCaseTitles: readonly string[];
  readonly latestVisibleSignal?: string;
}
