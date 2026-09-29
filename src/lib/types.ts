export interface SendingAccountSummary {
  id: string;
  email: string;
  provider: string;
  displayName: string | null;
  dailyLimit: number;
  isActive: boolean;
  lastSyncAt: Date | string | null;
  createdAt: Date | string;
}
