// Shopify's email-only newsletter mutation is currently available only in unstable.
// Keep its version explicit; never fall back to Admin consent writes or own DOI mail.
export const subscribeMutation = `mutation NewsletterSubscribe($email:String!) {
  customerEmailMarketingSubscribe(email:$email) {
    customerUserErrors { field message code }
  }
}`;
export async function subscribeCustomer(env, email, fetcher=fetch) {
  const response=await fetcher('https://k4csqj-h1.myshopify.com/api/unstable/graphql.json', {
    method:'POST',
    headers:{'Content-Type':'application/json','X-Shopify-Storefront-Access-Token':env.SHOPIFY_STOREFRONT_TOKEN},
    body:JSON.stringify({query:subscribeMutation,variables:{email}}),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error('SHOPIFY');
  const result=await response.json();
  const payload=result.data?.customerEmailMarketingSubscribe;
  if (result.errors?.length || !payload || !Array.isArray(payload.customerUserErrors) || payload.customerUserErrors.length) throw Error('SHOPIFY');
}
