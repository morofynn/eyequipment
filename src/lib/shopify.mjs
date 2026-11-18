export const lookupQuery = `query NewsletterCustomer($query:String!) { customers(first:2,query:$query) { nodes { id defaultEmailAddress { emailAddress marketingState } } } }`;
export const createMutation = `mutation NewsletterCreate($input:CustomerInput!) { customerCreate(input:$input) { customer { id } userErrors { message } } }`;
export const consentMutation = `mutation NewsletterConsent($input:CustomerEmailMarketingConsentUpdateInput!) { customerEmailMarketingConsentUpdate(input:$input) { customer { id } userErrors { message } } }`;
export const statusQuery = `query NewsletterConfirmation($id:ID!) { customer(id:$id) { id defaultEmailAddress { marketingState } } }`;
let cachedToken;
export async function accessToken(env,fetcher=fetch) {
  if(env.SHOPIFY_ADMIN_TOKEN)return env.SHOPIFY_ADMIN_TOKEN;
  if(cachedToken?.client===env.SHOPIFY_CLIENT_ID && cachedToken.expires>Date.now()+60000)return cachedToken.value;
  const response=await fetcher('https://k4csqj-h1.myshopify.com/admin/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.SHOPIFY_CLIENT_ID,client_secret:env.SHOPIFY_CLIENT_SECRET}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('SHOPIFY_AUTH');
  const data=await response.json();
  if(!data.access_token || !data.expires_in)throw Error('SHOPIFY_AUTH');
  cachedToken={client:env.SHOPIFY_CLIENT_ID,value:data.access_token,expires:Date.now()+data.expires_in*1000};
  return cachedToken.value;
}
export async function graphql(env, query, variables, fetcher=fetch) {
  const token=await accessToken(env,fetcher);
  const response = await fetcher('https://k4csqj-h1.myshopify.com/admin/api/2026-10/graphql.json', {method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(10000)});
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
