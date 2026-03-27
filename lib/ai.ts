// Canopy AI Engine — OpenRouter integration
// Routes to Claude for strategy/copy, GPT-4o for structured tasks

import AsyncStorage from '@react-native-async-storage/async-storage';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const AI_KEY_STORAGE = 'EXPO_PUBLIC_OPENROUTER_API_KEY';

// In-memory cache so we don't hit AsyncStorage on every call
let cachedKey: string | null = null;
let keyLoaded = false;

// Eagerly load the key from AsyncStorage at module init
(async () => {
  try {
    const stored = await AsyncStorage.getItem(AI_KEY_STORAGE);
    if (stored) cachedKey = stored;
  } catch {}
  keyLoaded = true;
})();

/** Ensure the key has been loaded from AsyncStorage (for use before AI calls) */
async function ensureKeyLoaded(): Promise<void> {
  if (keyLoaded) return;
  try {
    const stored = await AsyncStorage.getItem(AI_KEY_STORAGE);
    if (stored) cachedKey = stored;
  } catch {}
  keyLoaded = true;
}

function getEnvKey(): string {
  return process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '';
}

async function getKey(): Promise<string> {
  await ensureKeyLoaded();
  return cachedKey || getEnvKey();
}

/** Update the OpenRouter key in both in-memory cache and AsyncStorage */
export async function setOpenRouterKey(key: string): Promise<void> {
  cachedKey = key;
  keyLoaded = true;
  await AsyncStorage.setItem(AI_KEY_STORAGE, key);
}

/** Check if AI is configured. Uses cached key + env fallback (synchronous for UI convenience). */
export function isAIConfigured(): boolean {
  return Boolean(cachedKey || getEnvKey());
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIOptions {
  model?: 'claude' | 'gpt4o' | 'fast';
  maxTokens?: number;
  temperature?: number;
}

const MODEL_MAP = {
  claude: 'anthropic/claude-3.5-sonnet',
  gpt4o: 'openai/gpt-4o',
  fast: 'anthropic/claude-3-haiku',
};

export async function aiChat(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
  const key = await getKey();
  if (!key) throw new Error('OpenRouter key not configured. Add your key in Settings or set EXPO_PUBLIC_OPENROUTER_API_KEY in .env');

  const model = MODEL_MAP[options.model ?? 'fast'];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://canopy.app',
        'X-Title': 'Canopy Tree Service SaaS',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.maxTokens ?? 500,
        temperature: options.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`AI error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('AI request timed out (30s). Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Specialized AI functions ────────────────────────────────────────────────

interface CompanyContext {
  name: string;
  city?: string;
  state?: string;
  services?: string[];
  radiusMiles?: number;
}

/** Daily briefing shown on dashboard */
export async function generateDailyBriefing(
  company: CompanyContext,
  stats: { leadsToday: number; adSpend: number; topSource?: string }
): Promise<string> {
  return aiChat([
    {
      role: 'system',
      content: `You are a sharp business advisor for ${company.name}, a tree service company in ${company.city ?? 'their city'}, ${company.state ?? ''}. Be concise, motivating, and data-driven. Always end with one specific action item.`,
    },
    {
      role: 'user',
      content: `Yesterday's numbers: ${stats.leadsToday} leads, $${stats.adSpend.toFixed(0)} ad spend${stats.topSource ? `, top source: ${stats.topSource}` : ''}. Write a 2-sentence morning briefing with one action item. Under 50 words total.`,
    },
  ], { model: 'fast', maxTokens: 80 });
}

/** Google/Facebook ad copy generator */
export async function generateAdCopy(
  company: CompanyContext,
  adType: 'google_search' | 'facebook_image' | 'facebook_video',
  service: string,
  variant: 1 | 2 | 3 = 1
): Promise<{ headline: string; description: string; callToAction: string }> {
  const formulas = {
    1: 'emergency hook (urgency + availability)',
    2: 'social proof (reviews + jobs completed)',
    3: 'price transparency (honest cost breakdown)',
  };

  const raw = await aiChat([
    {
      role: 'system',
      content: `You write high-converting ads for tree service companies. Always include the city name. Be direct. No fluff.`,
    },
    {
      role: 'user',
      content: `Write a ${adType.replace('_', ' ')} ad for ${company.name} in ${company.city ?? 'their city'} for: ${service}.
Formula: ${formulas[variant]}.
Return JSON only: {"headline": "...", "description": "...", "callToAction": "..."}
Google limits: headline 30 chars, description 90 chars. Facebook: headline 40 chars, description 125 chars.`,
    },
  ], { model: 'fast', maxTokens: 200, temperature: 0.8 });

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { headline: `${service} in ${company.city}`, description: `${company.name} — fast, local, licensed. Free estimate.`, callToAction: 'Get Free Quote' };
  } catch {
    return { headline: `${service} in ${company.city}`, description: `${company.name} — fast, local, licensed. Free estimate.`, callToAction: 'Get Free Quote' };
  }
}

/** TikTok/YouTube video script generator */
export async function generateVideoScript(
  company: CompanyContext,
  videoType: string,
  details: { what?: string; where?: string; duration?: string }
): Promise<{ hook: string; script: string; shotList: string[]; hashtags: string[]; caption: string }> {
  const raw = await aiChat([
    {
      role: 'system',
      content: `You write viral TikTok/Reels scripts for blue-collar service companies. Your scripts sound like a real person talking to a friend — NOT a commercial. Use natural speech patterns: contractions, pauses ("..."), filler phrases ("honestly", "look", "here's the thing"), and spoken rhythm. Never sound corporate or salesy. Think popular TikTok creators who happen to do tree work.

Key rules:
- Hook MUST stop the scroll in under 3 seconds (controversy, shock, curiosity gap)
- Write the SPOKEN words only — no stage directions in the script itself
- Keep it 80-120 words spoken (about 30-45 seconds at natural pace)
- End with a soft CTA that feels natural, not pushy
- Match the energy to the video type (satisfying = calm awe, storm = urgency, price = straight talk)`,
    },
    {
      role: 'user',
      content: `Write a "${videoType}" script for ${company.name} in ${company.city ?? 'their area'}.
Details: ${JSON.stringify(details)}

Return JSON only:
{
  "hook": "the first spoken line (scroll-stopper, under 10 words)",
  "script": "the full spoken script — conversational, NO shot markers, NO brackets, just what the person says out loud",
  "shotList": ["shot 1 visual description", "shot 2 visual description", ...up to 5 shots],
  "hashtags": ["#tag1", "#tag2", ...8 hashtags mixing niche + trending],
  "caption": "platform caption under 150 chars with 1-2 emoji"
}`,
    },
  ], { model: 'claude', maxTokens: 800, temperature: 0.9 });

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return {
    hook: `This tree was about to fall on their house...`,
    script: `This tree was about to fall on their house and they had no idea. Look at this — see how it's leaning? The whole root system is compromised. Honestly, another bad storm and this thing's coming down right on their bedroom. We got the crane out here, took it down section by section. Took us about four hours but... look at that yard now. Night and day difference. If you've got a tree that looks sketchy, don't wait. Give us a call, we'll come take a look for free.`,
    shotList: ['Dramatic angle of leaning tree near house', 'Close-up of damaged root system', 'Crane operation removing sections', 'Time-lapse of removal process', 'Clean yard final reveal'],
    hashtags: [`#treeservice`, `#${company.city?.toLowerCase().replace(/\s/g,'')}`, '#treeremoval', '#arborist', '#treework', '#satisfying', '#beforeandafter', '#localbusiness'],
    caption: `${company.name} saved this house 🌳 Free estimates — link in bio`,
  };
}

/** Review response drafter */
export async function draftReviewResponse(
  company: CompanyContext,
  review: { rating: number; body: string; reviewerName: string }
): Promise<string> {
  const tone = review.rating >= 4 ? 'warm and grateful' : 'empathetic and solution-focused';
  return aiChat([
    {
      role: 'system',
      content: `You write professional review responses for ${company.name}. Be ${tone}. Keep under 100 words. Always end by inviting them back or offering to resolve the issue.`,
    },
    {
      role: 'user',
      content: `${review.rating}-star review from ${review.reviewerName}: "${review.body}"\n\nWrite a response as the business owner.`,
    },
  ], { model: 'fast', maxTokens: 150 });
}

/** Lead score + follow-up message */
export async function scoreAndSuggestFollowUp(
  company: CompanyContext,
  lead: { name: string; service?: string; notes?: string; source?: string; createdAt: string }
): Promise<{ score: number; reasoning: string; followUpMessage: string }> {
  const raw = await aiChat([
    {
      role: 'system',
      content: `You score tree service leads 1-10 and suggest follow-up messages. Score based on: urgency (emergency = higher), service type (removal > trimming), timing, and message clarity.`,
    },
    {
      role: 'user',
      content: `Lead: ${JSON.stringify(lead)}
Return JSON only: {"score": 7, "reasoning": "one sentence why", "followUpMessage": "Hi ${lead.name}, this is [Name] from ${company.name}..."}`,
    },
  ], { model: 'fast', maxTokens: 200 });

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return { score: 5, reasoning: 'Standard lead, follow up promptly.', followUpMessage: `Hi ${lead.name}, this is the team at ${company.name}. We saw your request and would love to help! When is a good time for a free estimate?` };
}

/** SEO content page generator */
export async function generateServicePage(
  company: CompanyContext,
  service: string
): Promise<{ title: string; metaDescription: string; content: string; faqs: Array<{ q: string; a: string }> }> {
  const raw = await aiChat([
    {
      role: 'system',
      content: `You write SEO-optimized service pages for local tree service companies. 800-1000 words. Include the city name 5-7 times naturally. Include FAQs. Use H2 headings.`,
    },
    {
      role: 'user',
      content: `Write a complete service page for: ${service} in ${company.city ?? 'the local area'} for ${company.name}.
Return JSON: {
  "title": "SEO title tag (60 chars max)",
  "metaDescription": "meta description (155 chars max)",
  "content": "full HTML content with h2 tags",
  "faqs": [{"q": "...", "a": "..."}, ...]
}`,
    },
  ], { model: 'claude', maxTokens: 2000, temperature: 0.6 });

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return {
    title: `${service} in ${company.city} | ${company.name}`,
    metaDescription: `Professional ${service.toLowerCase()} in ${company.city}. Licensed & insured. Free estimates. Call ${company.name} today.`,
    content: `<h2>${service} Services in ${company.city}</h2><p>Content being generated...</p>`,
    faqs: [{ q: `How much does ${service.toLowerCase()} cost?`, a: `Prices vary based on tree size and location. We offer free estimates — contact us today.` }],
  };
}

/** 30-day content calendar */
export async function generate30DayCalendar(
  company: CompanyContext,
  season: string
): Promise<Array<{ day: number; videoType: string; hook: string; platform: string }>> {
  const raw = await aiChat([
    {
      role: 'system',
      content: `You create 30-day social media content calendars for tree service companies. Mix video types. Consider ${season} season topics.`,
    },
    {
      role: 'user',
      content: `Create a 30-day content calendar for ${company.name} in ${company.city ?? 'their area'} for ${season} season.
Return JSON array of 12 key posts (spread across 30 days): [{"day": 1, "videoType": "before_after", "hook": "...", "platform": "tiktok|youtube|instagram"}, ...]`,
    },
  ], { model: 'fast', maxTokens: 1000 });

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return [
    { day: 1, videoType: 'before_after', hook: 'The before would shock you...', platform: 'tiktok' },
    { day: 4, videoType: 'price_transparency', hook: 'Here\'s what tree removal actually costs', platform: 'youtube' },
    { day: 7, videoType: 'satisfying_removal', hook: 'Watch this 80-foot oak come down safely', platform: 'tiktok' },
    { day: 10, videoType: 'did_you_know', hook: 'This is what root rot looks like underground', platform: 'instagram' },
    { day: 14, videoType: 'day_in_life', hook: '5am to sunset with our crew', platform: 'youtube' },
    { day: 18, videoType: 'before_after', hook: 'Storm damage cleared in 3 hours', platform: 'tiktok' },
  ];
}

/** Onboarding market strategy */
export async function generateMarketStrategy(company: CompanyContext): Promise<string[]> {
  const raw = await aiChat([
    {
      role: 'system',
      content: `You are a local marketing expert for tree service companies. Give specific, actionable advice. Reference actual data about tree service marketing.`,
    },
    {
      role: 'user',
      content: `Generate a 5-point 30-day marketing strategy for ${company.name} in ${company.city ?? 'their city'}, ${company.state ?? ''}.
Services: ${company.services?.join(', ') ?? 'tree removal, trimming'}.
Service radius: ${company.radiusMiles ?? 25} miles.
Return JSON array of 5 strategy points, each starting with an emoji. Be specific with numbers and tactics.`,
    },
  ], { model: 'claude', maxTokens: 600, temperature: 0.7 });

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return [
    `🎯 Launch Google Search ads for "emergency tree removal ${company.city}" — budget $20/day, expect 3-8% conversion rate`,
    `📸 Post 3 before/after videos this week — tree service before/afters average 10x more views than static posts`,
    `⭐ Complete your Google Business Profile — 40% of local tree service calls come directly from Google Maps`,
    `📬 Set up a Facebook Lead Ad targeting homeowners 35-65 within ${company.radiusMiles ?? 25} miles — $10/day budget`,
    `🔁 After every job: send a review request SMS — aim for 10 new Google reviews in 30 days`,
  ];
}
