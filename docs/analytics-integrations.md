# Post analytics: getting real figures from the networks

Status: **on hold** (decided 2026-09-26). Publishing stays on Buffer. Figures
will come from each network's own API, starting with Meta. Until then the
weekly report lists the week's posts automatically and the figures are typed
in by hand.

## Why not Buffer

- Buffer's API returns a `metrics` list per post, but its post-metrics queries
  are experimental and not meant for reporting; engagement, reach and
  impressions are shown in Buffer's dashboard only.
  ([What is Buffer's API?](https://support.buffer.com/article/859-does-buffer-have-an-api))
- Checked on 2026-09-26 with *Paramètres → Intégrations → Tester les
  statistiques des posts* (team only): the last 5 Facebook posts on "Marketing
  Hub" came back with every figure at 0, while Buffer's own dashboard showed a
  comment on one of them. The API does not pass the figures on.
- Meta also stopped giving Buffer clicks, organic impressions and engaged
  users for Facebook Pages.
  ([Facebook metric descriptions](https://support.buffer.com/article/520-facebook-metric-descriptions))

Alternatives looked at: Postiz (free if self-hosted, has an analytics API, but
needs a server and our own app approvals on every network anyway), Ayrshare
(about $149/month), Zernio (young, untested). Going to the networks directly
costs nothing and needs the same approvals.

## Order

1. **Meta**: Facebook Pages and Instagram Business accounts. Largest audience
   for our clients; the same Meta app will serve WhatsApp Business.
2. **TikTok**: Display API.
3. **LinkedIn**: Community Management API; strictest approval.

One app per network for FlowCom (not one per client). Each client connects
their account once. No network charges for API access or review.

## Meta: step by step

Rule: never paste the App Secret or any token in a chat, a file, a screenshot
or the source. They go into `fc_companysecrets1` through a flow, like the
Buffer and AI keys.

1. **Developer account**: [developers.facebook.com](https://developers.facebook.com),
   signed in with a team member's Facebook account that manages the Pages.
2. **Business portfolio**: [business.facebook.com](https://business.facebook.com)
   for Africa Univ Tech. *Business settings → Security Center → Start
   verification*: legal name, address, a registration document, and a phone
   number or email on our domain. Usually the slowest step.
3. **Create the app**: *My Apps → Create app*, type **Business**, linked to the
   business portfolio.
4. **Basics** (*App settings → Basic*): icon, category, **privacy policy URL**,
   **data deletion** instructions or URL, terms URL. These pages still need to
   be written and hosted on our website.
5. **Products**: *Facebook Login for Business*; *Instagram API with Facebook
   Login* (Instagram Business accounts linked to a Page).
6. **Test in development mode** (works right away for people with a role on the
   app): [Graph API Explorer](https://developers.facebook.com/tools/explorer/),
   choose the app and a Page we manage, grant:
   - `pages_show_list`, `pages_read_engagement`, `read_insights`
   - `instagram_basic`, `instagram_manage_insights`

   Then read one post:
   - `GET /{page-post-id}?fields=message,created_time,reactions.summary(total_count),comments.summary(total_count),shares`
   - `GET /{page-post-id}/insights?metric=post_impressions_unique` (reach)
   - Instagram: `GET /{ig-media-id}/insights?metric=reach,likes,comments,shares,saved`

   Metric names change with Graph API versions: check the current
   [Page insights reference](https://developers.facebook.com/docs/graph-api/reference/insights/)
   before building. An invalid metric in the list fails the whole call.
7. **App Review** (*App Review → Permissions and features*): request Advanced
   Access for the permissions above, with a screencast of FlowCom showing each
   one in use and test credentials. Answer usually within days to a few weeks.

Open question to confirm early: in development mode the app already works for
the people who have a role on it. Since our team administers the clients'
Pages, part of the use may work before review. Plan on doing the review anyway.

## TikTok

- [TikTok for Developers](https://developers.tiktok.com): create an app, add
  *Login Kit* and the *Display API*, scope `video.list` (plus `user.info.basic`).
- Figures per video: `view_count`, `like_count`, `comment_count`,
  `share_count` ([List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v1-video-list)).
- The app is reviewed before it works for other accounts.
- Figures are snapshots: no webhook, so FlowCom has to fetch them regularly.

## LinkedIn

- [Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview):
  registered legal organisation, verified company Page, business email.
- Two tiers: Development (limited calls), then Standard, which needs a
  screencast for every use case in the request form.
- Figures: `organizationalEntityShareStatistics` gives impressions, clicks,
  likes, comments, shares and engagement, for the last 12 months only
  ([Organization Share Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics)).

## FlowCom side (to build once an app exists)

- **Secrets**: add the network as a provider in `fc_companysecrets1`
  (SaveCompanySecret flow's provider choice) and in `fc_companyintegration`
  for the non-secret "connected" status. The Settings → Integrations page
  (team only) gets a row per network.
- **Server-side calls**: a flow per network like `BufferCall` (for example
  `MetaCall`: company id + Graph path in, JSON out) so tokens never reach the
  browser.
- **Connect step**: team-only "Connect this client's Page / account" in
  Settings, storing the Page token (long-lived) through the flow.
- **Collecting figures**: a scheduled flow (daily) that reads recent posts'
  figures and writes them to `fc_campaignmetrics` (source `meta`, `tiktok`,
  `linkedin`; the `fc_source` choice already has `meta_ads`/`linkedin_ads`, add
  organic values) and to the weekly report's post rows.
- **Screens that then fill in by themselves**: weekly report (posts of the
  week), campaign results, workspace figures, Publications.
- **Client screens never name the provider** (see the rule about Buffer): they
  say "réseaux" and send clients to their FlowCom manager when something is
  missing.

## Before starting

- [ ] Privacy policy and data deletion pages written and online
- [ ] Meta business verification submitted
- [ ] Meta app created (Business type) and linked to the portfolio
- [ ] Graph API Explorer test on one of our Pages
- [ ] Decide which team member owns the developer accounts
