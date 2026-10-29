import { retrieveRawInitData } from '@telegram-apps/sdk-react';

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export interface UserDto { id: number; username: string | null; firstName: string; balance: number; totalClicks: number; }

// ВОТ ТУТ МЫ ДОБАВИЛИ image_url и убрали animation_url
export interface CaseDto { 
  id: number; 
  slug: string;
  name: string; 
  price_coins: number; 
  price_stars: number; 
  currency: string; 
  image_url: string; 
  rewards: number[]; 
}

export interface MeResponse { user: UserDto; cases: CaseDto[]; config: { coinsPerClick: number }; }
export interface ClickResponse { balance: number; totalClicks: number; earned: number }
export interface CaseOpenResponse { reward: number; price: number; balance: number }
export interface WheelResponse { reward: number; balance: number }
export interface StandardUpgradeResponse { win: boolean; newBalance: number; bet: number; target: number; chancePercent: number }
export interface MysteryUpgradeResponse { winAmount: number; newBalance: number; profit: number }
export interface GiftDto { id: string; name: string; price_stars: number; animation_url: string; }

function getInitData(): string {
  try { const raw = retrieveRawInitData(); if (raw) return raw; } catch {}
  return '';
}
export function hasInitData(): boolean { return getInitData().length > 0; }

async function request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `tma ${getInitData()}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'ERROR');
  return data as T;
}

export const api = {
  me: (startParam?: string) => request<MeResponse>(`/api/me${startParam ? `?start_param=${startParam}` : ''}`, 'GET'),
  click: () => request<ClickResponse>('/api/click', 'POST'),
  openCase: (caseId: number) => request<CaseOpenResponse>('/api/case/open', 'POST', { caseId }),
  openCaseStars: (caseId: number) => request<CaseOpenResponse>('/api/case/open-stars', 'POST', { caseId }),
  spinWheel: () => request<WheelResponse>('/api/wheel/spin', 'POST'),
  standardUpgrade: (bet: number, target: number) => request<StandardUpgradeResponse>('/api/upgrade/standard', 'POST', { bet, target }),
  mysteryUpgrade: (bet: number) => request<MysteryUpgradeResponse>('/api/upgrade/mystery', 'POST', { bet }),
  getGiftList: () => request<GiftDto[]>('/api/gifts/list', 'GET'),
  withdraw: (amount: number) => request<{ success: boolean }>('/api/withdraw', 'POST', { amount }),
};