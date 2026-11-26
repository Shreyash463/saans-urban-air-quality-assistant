/**
 * Shared TypeScript API contract for Saans — Urban Air Quality Assistant.
 * These interfaces are mirrored by the external FastAPI + Gemini backend.
 */

export type CommuteMode =
  'car' | 'two_wheeler' | 'public_transport' | 'walk_cycle' | 'work_from_home';

export type HomeType = 'apartment' | 'independent_house';

export type CookingFuel = 'lpg' | 'induction_electric' | 'piped_gas' | 'biomass_wood';

export type BudgetLevel = 'low' | 'medium' | 'high';

export type LanguageCode = 'en' | 'hi';

export type CommunityActor = 'rwa' | 'school' | 'workplace' | 'neighbours';

export type EffortLevel = 'low' | 'medium' | 'high';
export type FallbackReason = 'no_key' | 'ai_busy' | 'ai_error';

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface UserProfile {
  city: string;
  householdSize: number;
  hasChildren: boolean;
  hasElderly: boolean;
  hasRespiratoryCondition: boolean;
  commuteMode: CommuteMode;
  commuteKm: number;
  homeType: HomeType;
  hasAirPurifier: boolean;
  cookingFuel: CookingFuel;
  budget: BudgetLevel;
  language: LanguageCode;
}

export interface AirQualityReading {
  city: string;
  aqi: number;
  dominantPollutant: string;
  updatedAt: string;
  source: 'live' | 'demo';
  sourceDetail?: string;
}

export interface RoutineItem {
  timeSlot: 'morning' | 'midday' | 'evening' | 'night';
  title: string;
  detail: string;
  impactNote: string;
}

export interface IndoorHack {
  title: string;
  howTo: string;
  estimatedBenefit: string;
  costLevel: 'free' | 'low' | 'medium' | 'high';
}

export interface Alternative {
  current: string;
  swap: string;
  why: string;
  pm25ReductionPct: number;
  co2SavedKgPerMonth: number;
}

export interface CommunityAction {
  title: string;
  who: CommunityActor;
  howTo: string;
  estimatedImpact: string;
  effort: EffortLevel;
}

export interface PlanResponse {
  aqi: AirQualityReading;
  summary: string;
  healthAdvisory: string;
  routine: RoutineItem[];
  indoorHacks: IndoorHack[];
  alternatives: Alternative[];
  communityActions?: CommunityAction[];
  maskGuidance: string;
  disclaimer: string;
  generatedBy?: 'gemini' | 'rules';
  fallbackReason?: FallbackReason;
  retryAfterSeconds?: number;
}

export interface ChatReply {
  answer: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export type ThemeMode = 'light' | 'dark';
