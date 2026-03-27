// generate-contract — Renders an AI-generated tree service contract as HTML and stores in Supabase Storage
// POST { estimateId, sections }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { estimateId, sections } = await req.json()

    if (!estimateId || !sections) {
      return new Response(JSON.stringify({ error: 'Missing estimateId or sections' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch estimate with related data
    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .select('*, customers(*)')
      .eq('id', estimateId)
      .single()

    if (estError || !estimate) {
      return new Response(JSON.stringify({ error: 'Estimate not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch company and contract settings
    const { data: company } = await supabase
      .from('companies')
      .select('name, phone, address, city, state, zip, email, website, logo_url')
      .eq('id', estimate.company_id)
      .single()

    const { data: contractSettings } = await supabase
      .from('contract_settings')
      .select('*')
      .eq('company_id', estimate.company_id)
      .single()

    // Merge: AI-generated scope/schedule + saved settings for boilerplate sections
    const cs = contractSettings || {} as Record<string, unknown>
    const mergedSections = {
      scopeOfWork: sections.scopeOfWork || '',
      workSchedule: sections.workSchedule || 'Work will be scheduled at a mutually agreed upon date and time.',
      paymentTerms: (cs.payment_terms as string) || sections.paymentTerms || '',
      propertyAccess: (cs.property_access_text as string) || sections.propertyAccess || '',
      liabilityAndInsurance: (cs.liability_text as string) || sections.liabilityAndInsurance || '',
      cancellation: (cs.cancellation_text as string) || sections.cancellation || '',
      cleanup: (cs.cleanup_text as string) || sections.cleanup || '',
      warranty: (cs.warranty_text as string) || sections.warranty || '',
      additionalTerms: sections.additionalTerms || '',
      // Tree service specifics from settings
      permitText: cs.permit_clause ? (cs.permit_text as string) || '' : '',
      utilityText: cs.utility_clause ? (cs.utility_text as string) || '' : '',
      stumpGrindingText: cs.stump_grinding_clause ? (cs.stump_grinding_text as string) || '' : '',
      craneText: cs.crane_clause ? (cs.crane_text as string) || '' : '',
      // Custom clauses
      additionalClauses: (cs.additional_clauses as string[]) || [],
      // Section visibility
      includeScope: cs.include_scope !== false,
      includeSchedule: cs.include_schedule !== false,
      includePayment: cs.include_payment !== false,
      includeAccess: cs.include_access !== false,
      includeLiability: cs.include_liability !== false,
      includeCancellation: cs.include_cancellation !== false,
      includeCleanup: cs.include_cleanup !== false,
      includeWarranty: cs.include_warranty !== false,
      includeAdditional: cs.include_additional !== false,
      // Deposit info
      depositRequired: cs.deposit_required === true,
      depositPercent: (cs.deposit_percent as number) || 50,
    }

    const companyName = company?.name || 'Company'
    const customer = estimate.customers
    const lineItems: { description: string; qty: number; rate: number; amount: number }[] =
      Array.isArray(estimate.line_items) ? estimate.line_items : []

    const contractDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #2d5016; padding-bottom: 20px; }
  .company-info h1 { font-size: 26px; color: #2d5016; margin-bottom: 4px; }
  .company-info p { font-size: 12px; color: #555; line-height: 1.5; }
  .contract-badge { background: #2d5016; color: white; padding: 8px 20px; border-radius: 4px; font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .party { width: 48%; }
  .party h3 { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 1px; margin-bottom: 6px; }
  .party p { font-size: 13px; color: #333; line-height: 1.5; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 15px; color: #2d5016; border-bottom: 1px solid #e0e0d8; padding-bottom: 6px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section p { font-size: 13px; color: #333; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  thead th { background: #f5f5f0; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: 0.5px; border-bottom: 2px solid #ddd; }
  thead th:last-child, tbody td:last-child { text-align: right; }
  tbody td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
  .totals { margin-left: auto; width: 260px; margin-bottom: 20px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .totals-row.total { border-top: 2px solid #2d5016; padding-top: 10px; margin-top: 4px; font-size: 16px; font-weight: bold; color: #2d5016; }
  .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
  .sig-block { width: 45%; }
  .sig-block .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .sig-block .line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 12px; color: #555; }
  .sig-block .date-line { border-top: 1px solid #333; margin-top: 20px; padding-top: 6px; font-size: 12px; color: #555; }
  .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
</style>
</head>
<body>

<div class="header">
  <div class="company-info">
    <h1>${escapeHtml(companyName)}</h1>
    ${company?.phone ? `<p>${escapeHtml(company.phone)}</p>` : ''}
    ${company?.address ? `<p>${escapeHtml(company.address)}${company.city ? `, ${escapeHtml(company.city)}` : ''}${company.state ? `, ${escapeHtml(company.state)}` : ''} ${company.zip || ''}</p>` : ''}
    ${company?.email ? `<p>${escapeHtml(company.email)}</p>` : ''}
    ${company?.website ? `<p>${escapeHtml(company.website)}</p>` : ''}
  </div>
  <div class="contract-badge">SERVICE CONTRACT</div>
</div>

<div class="parties">
  <div class="party">
    <h3>Contractor</h3>
    <p><strong>${escapeHtml(companyName)}</strong></p>
    ${company?.address ? `<p>${escapeHtml(company.address)}${company.city ? `, ${escapeHtml(company.city)}` : ''}${company.state ? `, ${escapeHtml(company.state)}` : ''} ${company.zip || ''}</p>` : ''}
    ${company?.phone ? `<p>${escapeHtml(company.phone)}</p>` : ''}
  </div>
  <div class="party">
    <h3>Client</h3>
    <p><strong>${escapeHtml(customer?.name || estimate.customer_name || 'Customer')}</strong></p>
    ${customer?.phone || estimate.customer_phone ? `<p>${escapeHtml(customer?.phone || estimate.customer_phone || '')}</p>` : ''}
    ${customer?.email || estimate.customer_email ? `<p>${escapeHtml(customer?.email || estimate.customer_email || '')}</p>` : ''}
  </div>
</div>

<p style="font-size: 13px; color: #555; margin-bottom: 20px;"><strong>Contract Date:</strong> ${contractDate} &nbsp;&nbsp; <strong>Estimate #:</strong> ${estimateId.slice(0, 8).toUpperCase()}</p>

${(() => {
  let sectionNum = 0
  const s = (title: string, content: string) => {
    sectionNum++
    return `<div class="section"><h2>${sectionNum}. ${title}</h2><p>${escapeHtml(content)}</p></div>`
  }
  const parts: string[] = []

  if (mergedSections.includeScope) {
    sectionNum++
    parts.push(`<div class="section">
  <h2>${sectionNum}. Scope of Work</h2>
  <p>${escapeHtml(mergedSections.scopeOfWork)}</p>
  <table>
    <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>${lineItems.map(item => `
      <tr>
        <td>${escapeHtml(item.description || '')}</td>
        <td>${item.qty || 1}</td>
        <td>$${(item.rate || 0).toFixed(2)}</td>
        <td>$${(item.amount || (item.qty || 1) * (item.rate || 0)).toFixed(2)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>$${(estimate.subtotal || 0).toFixed(2)}</span></div>
    <div class="totals-row"><span>Tax</span><span>$${(estimate.tax || 0).toFixed(2)}</span></div>
    <div class="totals-row total"><span>Total</span><span>$${(estimate.total || 0).toFixed(2)}</span></div>
  </div>
</div>`)
  }

  if (mergedSections.includeSchedule) parts.push(s('Work Schedule', mergedSections.workSchedule))

  if (mergedSections.includePayment) {
    let paymentContent = mergedSections.paymentTerms
    if (mergedSections.depositRequired) {
      paymentContent += ` A deposit of ${mergedSections.depositPercent}% ($${(estimate.total * mergedSections.depositPercent / 100).toFixed(2)}) is required before work begins. The remaining balance of $${(estimate.total * (100 - mergedSections.depositPercent) / 100).toFixed(2)} is due upon completion.`
    }
    parts.push(s('Payment Terms', paymentContent))
  }

  if (mergedSections.includeAccess) parts.push(s('Property Access & Preparation', mergedSections.propertyAccess))
  if (mergedSections.includeLiability) parts.push(s('Liability & Insurance', mergedSections.liabilityAndInsurance))
  if (mergedSections.includeCancellation) parts.push(s('Cancellation Policy', mergedSections.cancellation))
  if (mergedSections.includeCleanup) parts.push(s('Cleanup & Debris Removal', mergedSections.cleanup))
  if (mergedSections.includeWarranty) parts.push(s('Warranty', mergedSections.warranty))

  // Tree service specific clauses
  if (mergedSections.utilityText) parts.push(s('Utility Line Safety', mergedSections.utilityText))
  if (mergedSections.stumpGrindingText) parts.push(s('Stump Grinding', mergedSections.stumpGrindingText))
  if (mergedSections.craneText) parts.push(s('Crane Operations', mergedSections.craneText))
  if (mergedSections.permitText) parts.push(s('Permits', mergedSections.permitText))

  // AI-generated additional terms
  if (mergedSections.additionalTerms) parts.push(s('Additional Terms', mergedSections.additionalTerms))

  // Custom clauses from settings
  if (mergedSections.includeAdditional && mergedSections.additionalClauses.length > 0) {
    sectionNum++
    parts.push(`<div class="section"><h2>${sectionNum}. Custom Terms</h2>${mergedSections.additionalClauses.map((c: string) => `<p>${escapeHtml(c)}</p>`).join('')}</div>`)
  }

  return parts.join('\n')
})()}

<p style="font-size: 13px; color: #333; margin-top: 20px;">By signing below, both parties agree to the terms and conditions outlined in this contract.</p>

<div class="signatures">
  <div class="sig-block">
    <div class="label">Contractor</div>
    <div class="line">${escapeHtml(companyName)}</div>
    <div class="date-line">Date</div>
  </div>
  <div class="sig-block">
    <div class="label">Client</div>
    <div class="line">${escapeHtml(customer?.name || estimate.customer_name || 'Customer')}</div>
    <div class="date-line">Date</div>
  </div>
</div>

<div class="footer">
  <p>${escapeHtml(companyName)} — Professional Tree Service</p>
</div>

</body>
</html>`

    // Store in Supabase Storage
    const storagePath = `contracts/${estimateId}.html`
    const { error: uploadError } = await supabase.storage
      .from('generated-videos')
      .upload(storagePath, new TextEncoder().encode(html), {
        contentType: 'text/html',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    const { data: { publicUrl } } = supabase.storage
      .from('generated-videos')
      .getPublicUrl(storagePath)

    // Update estimate with contract URL
    await supabase
      .from('estimates')
      .update({ contract_url: publicUrl })
      .eq('id', estimateId)

    return new Response(JSON.stringify({
      success: true,
      contractUrl: publicUrl,
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
