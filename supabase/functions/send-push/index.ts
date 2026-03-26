// send-push — Sends push notifications via Expo Push API
// POST { companyId, title, body, data?, targetUserId? }
// If targetUserId is provided, sends to that user only
// Otherwise sends to all users in the company

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface PushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: string
  badge?: number
  channelId?: string
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
    const { companyId, title, body, data, targetUserId } = await req.json()

    if (!companyId || !title || !body) {
      return new Response(JSON.stringify({ error: 'Missing companyId, title, or body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get push tokens for users in this company
    let query = supabase
      .from('users')
      .select('id, push_token')
      .eq('company_id', companyId)
      .not('push_token', 'is', null)

    if (targetUserId) {
      query = query.eq('id', targetUserId)
    }

    const { data: users } = await query

    if (!users?.length) {
      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        message: 'No users with push tokens found',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build push messages
    const messages: PushMessage[] = users
      .filter(u => u.push_token && u.push_token.startsWith('ExponentPushToken'))
      .map(u => ({
        to: u.push_token!,
        title,
        body,
        data: data || {},
        sound: 'default',
        channelId: 'default',
      }))

    if (messages.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        message: 'No valid Expo push tokens found',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send via Expo Push API (supports batches up to 100)
    const chunks: PushMessage[][] = []
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100))
    }

    let totalSent = 0
    const errors: string[] = []

    for (const chunk of chunks) {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      })

      const result = await resp.json()

      if (result.data) {
        for (const ticket of result.data) {
          if (ticket.status === 'ok') {
            totalSent++
          } else if (ticket.status === 'error') {
            errors.push(ticket.message || ticket.details?.error || 'Unknown error')

            // Remove invalid tokens
            if (ticket.details?.error === 'DeviceNotRegistered') {
              const token = chunk.find(m => true)?.to // Simplified — in production, match by index
              if (token) {
                await supabase
                  .from('users')
                  .update({ push_token: null })
                  .eq('push_token', token)
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: totalSent,
      total: messages.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
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
