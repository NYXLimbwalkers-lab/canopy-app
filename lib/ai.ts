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

// ── Video type-specific prompt knowledge & angle banks ─────────────────────

const VIDEO_TYPE_PROMPTS: Record<string, {
  angles: string[];
  facts: string[];
  energy: string;
  hookStyle: string;
  ctaStyle: string;
}> = {
  satisfying_removal: {
    angles: [
      'Massive tree leaning over a house — the before/after reveal',
      'Climbing 80+ feet up with spikes and a chainsaw, dropping sections',
      'Grinding a massive stump and the sawdust is flying everywhere',
      'Clearing a backyard that was completely overgrown — jungle to paradise',
      'Precision felling a dead tree between two fences without touching either one',
      'Rigging a heavy limb with ropes over a pool, lowering it perfectly',
      'Removing a tree that grew into power lines — no room for error',
      'A massive trunk hit the ground and the whole yard shook',
    ],
    facts: [
      'A mature oak can weigh over 50,000 pounds — thats 25 tons of wood we have to control',
      'The average tree removal generates enough wood chips to fill a dump truck and a half',
      'Some trees have root systems that extend 2-3x the width of their canopy',
      'A chainsaw chain moves at about 60 mph — thats why we train for years before climbing',
      'Dead trees can lose 30% of their structural integrity in a single season',
    ],
    energy: 'Calm confidence turning to awe. "Watch this" energy. Let the work speak for itself. Slow dramatic moments.',
    hookStyle: 'Visual shock — something that looks impossible or dangerous. Make them think "no way".',
    ctaStyle: 'Casual mention of free estimates. "Got a tree giving you anxiety? Hit us up."',
  },
  before_after: {
    angles: [
      'Overgrown nightmare property transformed into a clean showcase yard',
      'A tree was blocking all the sunlight — now the lawn actually grows',
      'Storm damage cleanup — yard looked like a warzone, now its magazine-worthy',
      'Trimmed back trees that were touching the roof and clogging gutters for years',
      'Removed three dead trees and the property value probably jumped 15 grand',
      'The neighbors couldnt believe it was the same house',
      'Cleared the view — they can finally see the sunset from their porch',
    ],
    facts: [
      'Well-maintained trees add 7-19% to property value according to USDA studies',
      'Overgrown trees touching your roof can void your homeowners insurance',
      'A single large tree can increase property value by $7,000 to $15,000',
      'Dead limbs over a roof cost homeowners an average of $3,000-$10,000 in damage annually',
      'HOAs report that tree maintenance violations are in their top 3 complaints',
      'Proper tree spacing improves airflow and can reduce your cooling bill by 25%',
    ],
    energy: 'Storytelling — "let me show you what we walked into." Build suspense, then the satisfying reveal.',
    hookStyle: 'Start with the ugly before shot and a reaction. "We showed up and I couldnt believe it."',
    ctaStyle: 'End on the reveal — "If your yard looks like that before picture, you know who to call."',
  },
  did_you_know: {
    angles: [
      'That white fungus growing on your oak? Heres what it actually means',
      'Why your tree is dropping leaves in summer — its not because of the heat',
      'The real reason tree companies charge what they charge — breaking down a quote',
      'That crack in your tree trunk — when its fine and when to panic',
      'Why topping trees is the worst thing you can do (and why cheap companies still do it)',
      'How to tell if your tree is actually dead vs just stressed',
      'The one thing 90% of homeowners get wrong about tree roots',
      'Why that tree in your yard might be worth more than your car',
      'What certified arborist actually means and why it matters',
      'The silent killer — how root rot takes down healthy-looking trees',
    ],
    facts: [
      'Tree topping reduces property value by up to $10,000 and kills most trees within 5 years',
      'A single mature tree produces enough oxygen for 4 people per year',
      'Trees communicate through underground fungal networks called mycorrhizae — they literally warn each other about pests',
      'The most expensive tree ever removed in the US cost over $200,000 — it was a historic live oak in downtown Savannah',
      'Lightning strikes kill about 100 trees per year per square mile in Florida alone',
      'A healthy tree can absorb 48 pounds of CO2 per year and release enough oxygen for two people',
      'Oak wilt can kill a red oak in as little as 3 weeks — and it spreads through root connections to neighboring trees',
      'Emerald ash borer has killed over 100 million ash trees in the US since 2002',
      'Proper pruning cuts heal 80% faster than improper ones — the tree literally seals the wound with new bark',
      'Some trees can live for thousands of years — the oldest known tree is over 5,000 years old',
      'Tree roots typically extend 2-3 times beyond the drip line — thats way further than most people think',
      'Mulch volcanoes (piling mulch against the trunk) kill more suburban trees than any disease',
    ],
    energy: 'Educational but casual — like a buddy who happens to know a lot about trees. "Most people dont know this but..."',
    hookStyle: 'Curiosity gap — drop a surprising fact that makes them need to hear the explanation.',
    ctaStyle: 'Soft — "Follow for more tree tips" or "Save this so you know what to look for"',
  },
  day_in_life: {
    angles: [
      'First call at 6am, what our trucks look like loaded up, crew meeting, first job site',
      'The hardest tree we took down this week — and why it was worth it',
      'What a $3,000 tree removal actually looks like start to finish',
      'Rain delay turned into equipment maintenance day — what it really takes to run this',
      'Training the new guy on his first big climb — passing on the knowledge',
      'Behind the scenes of a crane removal — the setup nobody sees',
      'What happens to all the wood? Our recycling and firewood process',
      'Emergency call at 5pm — a tree fell on a car and the family is freaking out',
    ],
    facts: [
      'The average arborist works 250+ feet of rope per day',
      'Our trucks carry over $50,000 worth of equipment every single day',
      'Tree work is consistently ranked in the top 5 most dangerous jobs in America',
      'A good climbing arborist can make $25-$45/hour — its skilled labor, not just cutting',
      'Most tree crews start work before 7am to beat the heat — we do 8-10 hours of physical labor daily',
      'Each chainsaw we carry gets sharpened every single morning — a dull chain is a dangerous chain',
    ],
    energy: 'Real, raw, unfiltered. Show the grind, the sweat, the early mornings. People love authenticity.',
    hookStyle: 'Start mid-action — already in the tree, already on the job. "4am alarm, lets get it."',
    ctaStyle: 'Casual — "Follow along for more days on the job" or "This is what we love to do"',
  },
  price_transparency: {
    angles: [
      'Why that tree removal quote was $3,500 — every single line item explained',
      'The real cost of tree work — labor, insurance, equipment, dump fees, profit',
      'Why our quote is higher than the other guy — and why that might save you money',
      'What happens when you hire the cheapest tree company — horror stories',
      'How to read a tree service estimate so you dont get ripped off',
      'The $800 tree job that turned into a $15,000 insurance claim because they hired unlicensed',
      'Breaking down why stump grinding costs what it costs',
      'Tree trimming: whats a fair price and whats a ripoff?',
    ],
    facts: [
      'Tree service companies pay $3,000-$15,000/year just for liability insurance — unlicensed guys pay zero',
      'Workers comp insurance for tree work is the highest rate of any industry at $30-$50 per $100 of payroll',
      'A decent professional chainsaw costs $800-$1,200 and needs replacing every 2-3 years',
      'Dump fees for tree debris average $40-$80 per ton depending on your area',
      'The average tree removal costs $750-$2,000, but can go up to $15,000+ for large or complex jobs',
      'A tree service truck, chipper, and stump grinder together represent $150,000-$300,000 in equipment',
      'Crane rentals for tree work cost $500-$2,000 per day plus the operator',
      'If an unlicensed tree worker gets hurt on your property, YOU can be liable for their medical bills',
    ],
    energy: 'Straight talk, no BS. Respect the viewers money. "Im gonna be real with you." Honest and direct.',
    hookStyle: 'Money-focused hook — a number that makes them stop. "This tree cost $4,200 to remove. Heres why."',
    ctaStyle: 'Trust-building — "We give free estimates and well explain every line item. No surprises."',
  },
  storm_damage: {
    angles: [
      'Emergency call — tree went through the roof during last nights storm',
      'This is what a derecho does to a neighborhood in 15 minutes',
      'Three trees down on one property — triage and prioritization in action',
      'The tree that was "fine" last week... until 60mph winds hit',
      'Why you should check your trees BEFORE storm season — prevention saves thousands',
      'Insurance claim help — documenting storm damage the right way for maximum coverage',
      'Emergency vs regular removal — why storm pricing is higher and why its fair',
      '72 hours after the storm — the jobs are still coming in nonstop',
    ],
    facts: [
      'Trees with co-dominant stems (V-shaped trunks) are 5x more likely to fail in storms',
      'A tree falling on your house during a storm can cause $10,000-$100,000+ in damage',
      'Most homeowner insurance covers storm-damaged tree removal from structures but NOT from your yard',
      'After major storms, unlicensed "storm chasers" flood the area — always verify credentials',
      'Winds of just 45mph can bring down dead or weakened trees — you dont need a hurricane',
      'The average wait time for tree removal after a major storm is 2-4 weeks — being a regular customer gets you priority',
      'Proper pruning can reduce wind resistance by 30-40% and prevent storm damage before it happens',
      'Crown thinning removes 15-20% of a trees canopy and dramatically reduces wind load during storms',
    ],
    energy: 'Urgent but helpful. "Listen, if you see this, call someone NOW." Be the expert people trust in a crisis.',
    hookStyle: 'Dramatic real footage or setup — "This just happened two hours ago." Urgency and shock.',
    ctaStyle: 'Helpful urgency — "Save our number before storm season. When it hits, were booked for weeks."',
  },
};

/** TikTok/YouTube video script generator — type-specific with real knowledge */
export async function generateVideoScript(
  company: CompanyContext,
  videoType: string,
  details: { what?: string; where?: string; duration?: string }
): Promise<{ hook: string; script: string; shotList: string[]; hashtags: string[]; caption: string }> {
  const typeConfig = VIDEO_TYPE_PROMPTS[videoType] ?? VIDEO_TYPE_PROMPTS.satisfying_removal;

  // Pick random angle and facts for variety so scripts never repeat
  const angle = typeConfig.angles[Math.floor(Math.random() * typeConfig.angles.length)];
  const shuffledFacts = [...typeConfig.facts].sort(() => Math.random() - 0.5);
  const selectedFacts = shuffledFacts.slice(0, 3);

  const servicesStr = company.services?.length
    ? `They offer: ${company.services.join(', ')}.`
    : 'They do tree removal, trimming, stump grinding, and emergency storm work.';
  const locationStr = company.city && company.state
    ? `${company.city}, ${company.state}`
    : company.city ?? 'their local area';

  const raw = await aiChat([
    {
      role: 'system',
      content: `You write VIRAL TikTok/Reels scripts for tree service companies. You are a former arborist who became a content creator — you know the industry inside and out, and you know what gets views.

YOUR VOICE: Sound like you're talking to a buddy at a barbecue who asked about your job. Use contractions, natural pauses ("..."), filler phrases ("honestly", "look", "here's the thing", "no seriously", "I'm not even kidding"), and spoken rhythm. NEVER sound like a commercial, ad copy, or corporate script.

YOUR KNOWLEDGE: You are deeply knowledgeable about arboriculture, tree biology, equipment, safety, pricing, insurance, and local tree species. Weave in real expertise naturally — don't lecture, just drop knowledge casually like it's obvious to you.

CRITICAL RULES:
- Hook MUST stop the scroll in under 2 seconds (controversy, shock, curiosity gap, or visual payoff)
- Write ONLY spoken words — zero stage directions, zero [brackets], zero formatting
- 90-130 words (35-50 seconds at natural pace)
- Include at least ONE specific, surprising fact or number
- Include at least ONE moment of genuine expertise that makes the viewer think "this person really knows their stuff"
- End with a natural CTA — NOT "call us today" or "link in bio" corporate garbage
- Every script must feel DIFFERENT from the last — vary structure, tone, pacing, and hook style

ENERGY FOR THIS VIDEO TYPE: ${typeConfig.energy}
HOOK STYLE: ${typeConfig.hookStyle}
CTA STYLE: ${typeConfig.ctaStyle}`,
    },
    {
      role: 'user',
      content: `Write a "${videoType.replace(/_/g, ' ')}" script for ${company.name} in ${locationStr}.
${servicesStr}

CREATIVE DIRECTION: Base this script around this angle — "${angle}"

REAL FACTS TO WEAVE IN (use 1-2 naturally, don't force all of them):
${selectedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${details.what ? `Additional context: ${details.what}` : ''}

Return JSON only — no markdown, no backticks:
{
  "hook": "the first spoken line (scroll-stopper, under 10 words)",
  "script": "the FULL spoken script including the hook — conversational, zero brackets, zero stage directions, just natural speech",
  "shotList": ["shot 1 visual", "shot 2 visual", "shot 3 visual", "shot 4 visual", "shot 5 visual"],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
  "caption": "platform caption under 150 chars with 1-2 emoji"
}`,
    },
  ], { model: 'claude', maxTokens: 1000, temperature: 0.95 });

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  // Fallback — still uses the angle for variety
  const cityTag = company.city?.toLowerCase().replace(/\s/g, '') ?? 'local';
  return {
    hook: `You won't believe what we found inside this tree...`,
    script: `You won't believe what we found inside this tree. So this homeowner calls us, says the tree looks fine from the outside right? We get up there and the whole center is hollow. I'm talking completely rotted out from the inside. This thing could have come down in the next storm and it would have landed right on their kid's bedroom. That's the scary part... trees can look perfectly healthy and be completely compromised on the inside. We took it down safe, section by section. If you've got a big tree near your house that you're not sure about, seriously, just get it looked at. We'll come out for free.`,
    shotList: ['Close-up of hollow tree trunk interior', 'Wide shot showing tree near house', 'Arborist climbing and inspecting', 'Controlled section removal', 'Clean yard final shot'],
    hashtags: [`#treeservice`, `#${cityTag}`, '#treeremoval', '#arborist', '#treework', '#satisfying', '#beforeandafter', '#localbusiness'],
    caption: `${company.name} — keeping ${company.city ?? 'your neighborhood'} safe one tree at a time 🌳`,
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
