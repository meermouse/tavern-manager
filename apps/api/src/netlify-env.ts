// Imported first by the Netlify functions: deployed functions always run in
// production mode (Secure cookies, no dev login, no mock data), while
// `netlify dev` keeps the local-development defaults.
if (!process.env.NETLIFY_DEV) process.env.NODE_ENV = 'production';
// Functions have no lasting disk: the auction listings kept between hourly fetches go in Netlify Blobs.
process.env.AUCTION_LISTINGS_STORE ||= 'netlify';
export {};
