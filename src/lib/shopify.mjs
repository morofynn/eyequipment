export const lookupQuery = `query NewsletterCustomer($query:String!) { customers(first:2,query:$query) { nodes { id defaultEmailAddress { emailAddress marketingState } } } }`;
export const createMutation = `mutation NewsletterCreate($input:CustomerInput!) { customerCreate(input:$input) { customer { id } userErrors { message } } }`;
export const consentMutation = `mutation NewsletterConsent($input:CustomerEmailMarketingConsentUpdateInput!) { customerEmailMarketingConsentUpdate(input:$input) { customer { id } userErrors { message } } }`;
export const statusQuery = `query NewsletterConfirmation($id:ID!) { customer(id:$id) { id defaultEmailAddress { marketingState } } }`;
export async function graphql(env, query, variables, fetcher=fetch) {
  const response = await fetcher('https://k4csqj-h1.myshopify.com/admin/api/2026-10/graphql.json', {method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':env.SHOPIFY_ADMIN_TOKEN},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw Error('SHOPIFY');
  const result = await response.json();
  if (result.errors || !result.data) throw Error('SHOPIFY');
  return result.data;
}
export async function consent(env, id, state, fetcher=fetch) {
  const result = await graphql(env, consentMutation, {input:{customerId:id,emailMarketingConsent:{marketingState:state,marketingOptInLevel:'CONFIRMED_OPT_IN',consentUpdatedAt:new Date().toISOString()}}}, fetcher);
  if (result.customerEmailMarketingConsentUpdate.userErrors.length) throw Error('SHOPIFY');
}
export async function pendingCustomer(env, email, fetcher=fetch) {
  const escaped = email.replace(/[\\"]/g,'\\$&');
  const result = await graphql(env, lookupQuery, {query:`email:"${escaped}"`}, fetcher);
  const existing = result.customers.nodes.find(x=>x.defaultEmailAddress?.emailAddress?.toLowerCase()===email);
  if (existing?.defaultEmailAddress.marketingState==='SUBSCRIBED') return null;
  if (existing) {
    if (existing.defaultEmailAddress.marketingState!=='PENDING') await consent(env, existing.id, 'PENDING', fetcher);
    return existing.id;
  }
  const created = await graphql(env, createMutation, {input:{email,locale:'de',tags:['newsletter'],emailMarketingConsent:{marketingState:'PENDING',marketingOptInLevel:'CONFIRMED_OPT_IN'}}}, fetcher);
  if (created.customerCreate.userErrors.length || !created.customerCreate.customer) throw Error('SHOPIFY');
  return created.customerCreate.customer.id;
}
