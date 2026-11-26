import { describe, expect, it } from 'vitest';
import {
  detectChatIntent,
  generateSmartMockChatReply,
} from '../../tests/fixtures/mockChat';
import { generateMockPlan } from '../../tests/fixtures/mockPlanGenerator';
import type { UserProfile } from '../types';

const DELHI_FAMILY_PROFILE: UserProfile = {
  city: 'Delhi',
  householdSize: 4,
  hasChildren: true,
  hasElderly: false,
  hasRespiratoryCondition: true,
  commuteMode: 'car',
  commuteKm: 18,
  homeType: 'apartment',
  hasAirPurifier: false,
  cookingFuel: 'lpg',
  budget: 'low',
  language: 'en',
};

describe('Smart mock chat intent matching and responses', () => {
  const delhiPlan = generateMockPlan(DELHI_FAMILY_PROFILE);

  it('detects health symptoms first and advises seeing a doctor', () => {
    expect(detectChatIntent('My kid has been coughing and wheezing today')).toBe(
      'symptoms'
    );
    const reply = generateSmartMockChatReply(
      'My kid has been coughing and wheezing today',
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(reply.answer.toLowerCase()).toContain('doctor');
    expect(reply.answer.toLowerCase()).toContain('not a substitute for medical care');
  });

  it('gives strict indoor guidance for outdoor play when AQI is severe', () => {
    expect(detectChatIntent('Is it safe for kids to play outside today?')).toBe(
      'outdoor_play'
    );
    const reply = generateSmartMockChatReply(
      'Is it safe for kids to play outside today?',
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(reply.answer.toLowerCase()).toContain('avoided');
    expect(reply.answer.toLowerCase()).toContain('indoors');
  });

  it('answers mask questions with fitted N95/FFP2 and child sizing advice', () => {
    expect(detectChatIntent('Which N95 mask should we buy?')).toBe('mask');
    const reply = generateSmartMockChatReply(
      'Which N95 mask should we buy?',
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(reply.answer).toContain('N95');
    expect(reply.answer.toLowerCase()).toContain('child');
  });

  it('honestly debunks indoor plants for severe urban PM2.5 smog', () => {
    expect(detectChatIntent('Do snake plants or areca palms clean smog?')).toBe(
      'plants'
    );
    const reply = generateSmartMockChatReply(
      'Do snake plants or areca palms clean smog?',
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(reply.answer.toLowerCase()).toContain('negligible pm2.5');
  });

  it('provides practical budget-friendly indoor fixes for cheapest_indoor queries', () => {
    expect(detectChatIntent('What is the cheapest way to improve indoor air?')).toBe(
      'cheapest_indoor'
    );
    const reply = generateSmartMockChatReply(
      'What is the cheapest way to improve indoor air?',
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(reply.answer.toLowerCase()).toContain('free');
    expect(reply.answer.toLowerCase()).toContain('diy');
  });

  it('tailors purifier/DIY guidance based on purifier ownership', () => {
    expect(
      detectChatIntent('Should I buy a HEPA purifier or build a DIY box fan?')
    ).toBe('purifier_diy');
    const noPurifierReply = generateSmartMockChatReply(
      'Should I buy a HEPA purifier or build a DIY box fan?',
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(noPurifierReply.answer.toLowerCase()).toContain('diy');

    const ownerProfile: UserProfile = {
      ...DELHI_FAMILY_PROFILE,
      hasAirPurifier: true,
    };
    const ownerReply = generateSmartMockChatReply(
      'How should I run my HEPA purifier?',
      ownerProfile,
      generateMockPlan(ownerProfile)
    );
    expect(ownerReply.answer.toLowerCase()).toContain('already own');
  });

  it('answers cooking, commute, and ventilation questions with relevant advice', () => {
    expect(detectChatIntent('How do I reduce kitchen smoke during tadka?')).toBe(
      'cooking'
    );
    expect(detectChatIntent('Tips for my daily office car commute?')).toBe('commute');
    expect(detectChatIntent('When should I open windows for fresh air?')).toBe(
      'ventilation'
    );

    const ventReply = generateSmartMockChatReply(
      'When should I open windows for fresh air?',
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(ventReply.answer).toContain('1–4 PM');
  });

  it('handles greetings naturally by inviting an air-quality question', () => {
    expect(detectChatIntent('Hello!')).toBe('greeting');
    const greetEn = generateSmartMockChatReply('Hi', DELHI_FAMILY_PROFILE, delhiPlan);
    expect(greetEn.answer.toLowerCase()).toContain('aqi');
    expect(greetEn.answer.toLowerCase()).toContain('ask me');

    expect(detectChatIntent('नमस्ते')).toBe('greeting');
    const greetHi = generateSmartMockChatReply(
      'नमस्ते',
      { ...DELHI_FAMILY_PROFILE, language: 'hi' },
      delhiPlan
    );
    expect(greetHi.answer).toMatch(/[\u0900-\u097F]/);
  });

  it('restates the user question gracefully on unmatched queries and supports Hindi', () => {
    const query = 'Can air quality affect my pet parrot?';
    expect(detectChatIntent(query)).toBe('fallback');
    const fallbackReply = generateSmartMockChatReply(
      query,
      DELHI_FAMILY_PROFILE,
      delhiPlan
    );
    expect(fallbackReply.answer).toContain(query);

    const hiProfile: UserProfile = { ...DELHI_FAMILY_PROFILE, language: 'hi' };
    const hiReply = generateSmartMockChatReply(
      'क्या बच्चों का बाहर खेलना सुरक्षित है?',
      hiProfile,
      generateMockPlan(hiProfile)
    );
    expect(hiReply.answer).toMatch(/[\u0900-\u097F]/);
  });
});
