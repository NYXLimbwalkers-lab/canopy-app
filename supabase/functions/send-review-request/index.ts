// send-review-request — Sends SMS review request via Twilio after job completion
// Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
// POST { companyId, customerPhone, customerName, reviewUrl? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { companyId, customerPhone, customerName, reviewUrl } = await req.json()

    if (!companyId || !customerPhone) {
      return new Response(JSON.stringify({ error: 'Missing companyId or customerPhone' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up company name for the message
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()

    const companyName = company?.name || 'us'

    // Build the review URL — use GBP profile link if none provided
    let link = reviewUrl
    if (!link) {
      const { data: gbp } = await supabase
        .from('gbp_profiles')
        .select('place_id, website')
        .eq('company_id', companyId)
        .single()

      if (gbp?.place_id) {
        link = `https://search.google.com/local/writereview?placeid=${gbp.place_id}`
      } else if (gbp?.website) {
        link = gbp.website
      }
    }

    // Craft the message (under 160 chars for single SMS)
    const firstName = (customerName || '').split(' ')[0]
    const greeting = firstName ? `Hi ${firstName}! ` : 'Hi! '
    let message: string

    if (link) {
      message = `${greeting}Thanks for choosing ${companyName}! Would you take 30 seconds to leave us a review? It means the world to us. ${link}`
    } else {
      message = `${greeting}Thanks for choosing ${companyName}! We'd love a review if you have a moment. Search "${companyName}" on Google and tap "Write a review". Thank you!`
    }

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const credentials = btoa(`${accountSid}:${authToken}`)

    // Clean phone number — ensure E.164 format
    let toNumber = customerPhone.replace(/[^\d+]/g, '')
    if (!toNumber.startsWith('+')) {
      toNumber = toNumber.startsWith('1') ? `+${toNumber}` : `+1${toNumber}`
    }

    const twilioResp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Body: message,
      }),
    })

    const twilioData = await twilioResp.json()

    if (!twilioResp.ok) {
      throw new Error(`Twilio error: ${twilioData.message || twilioData.code || 'Unknown error'}`)
    }

    return new Response(JSON.stringify({
      success: true,
      messageSid: twilioData.sid,
      to: toNumber,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
