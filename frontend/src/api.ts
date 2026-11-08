import { retrieveRawInitData } from '@telegram-apps/sdk-react';
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export interface UserDto {id: number; firstName: string; username: string | null; balance: number; totalClicks: number}
export interface CaseDto {id: number; name: string; price_coins: number; image_url: string; rewards: number[]}
export interface GiftDto {id: string; name: string; price_stars: number; animation_url: string; price_source: string; price_updated_at: number | null; price_stale: boolean}
export interface CardDto {id: number; giftId: string; createdAt: number}
export interface MeResponse {wheelReadyAt: number; progress: {unlocked: string[]; sets: {id: number; giftIds: string[]; complete: boolean; bonus: number}[]}; user: UserDto; cases: CaseDto[]; collection: CardDto[]; config: {coinsPerClick: number; virtualOnly: boolean}}
function getInitData(): string {
  try {const raw = retrieveRawInitData(); if (raw) return raw;} catch {}
  return new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData') ?? '';
}
export function hasInitData() {return !!getInitData();}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const data = getInitData();
  const result = await fetch(`${API_URL}${path}`, {method: body === undefined ? 'GET' : 'POST', headers: {Authorization: `tma ${data}`, ...(body === undefined ? {} : {'Content-Type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000)});
  const json = await result.json().catch(() => ({}));
  if (!result.ok) throw new ApiError(result.status, json.error ?? 'ERROR');
  return json as T;
}
export const api = {
  me: () => request<MeResponse>('/api/me'),
  click: () => request<{balance: number; totalClicks: number; earned: number}>('/api/click', {}),
  getGiftList: () => request<GiftDto[]>('/api/gifts/list'),
  openCase: (caseId: number) => request<{reward: number; balance: number}>('/api/case/open', {caseId}),
  standardUpgrade: (bet: number, giftId: string) => request<{win: boolean; newBalance: number; chancePercent: number; cardId: number | null}>('/api/upgrade/standard', {bet, giftId}),
  mysteryUpgrade: (bet: number) => request<{winAmount: number; newBalance: number; profit: number}>('/api/upgrade/mystery', {bet}),
  spinWheel: () => request<{reward: number; balance: number}>('/api/wheel/spin', {}),
  upgradeCard: (cardId: number, giftId: string) => request<{win: boolean; chancePercent: number; cardId: number | null}>('/api/collection/upgrade', {cardId, giftId}),
  sellCard: (cardId: number) => request<{balance: number; price: number}>('/api/collection/sell', {cardId}),
};
