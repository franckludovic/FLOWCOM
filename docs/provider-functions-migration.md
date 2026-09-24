# Provider API migration

The React Code App must never receive Groq or Buffer secrets. The migration target is:

```text
Power Apps Code App
  -> Power Platform custom connector
  -> Azure Functions (Entra-protected)
  -> Azure Key Vault (provider secrets)
  -> Groq / Buffer
```

Dataverse `fc_companyintegration` stores only the provider, connection status,
external account metadata, and a `keyvault:<secret-name>` reference. The secret
value itself stays in Key Vault.

## What is in this repository

The `functions/` folder contains the first Azure Functions implementation:

- `POST /api/integrations/groq` validates and stores a Groq key.
- `POST /api/integrations/buffer` validates a Buffer token and stores its first organization.
- `POST /api/providers/groq` proxies Groq chat requests.
- `POST /api/providers/buffer` proxies Buffer GraphQL requests.
- `POST /api/providers/image` generates an image using the Hugging Face secret.
- `POST /api/members/invite` invites an Entra user and creates their Dataverse membership.

Every route reads the Entra object ID supplied by App Service Authentication. The
company-scoped routes check the caller's `fc_companymembership` row before reading
or writing company data. The functions use managed identity for Dataverse, Key
Vault, and Microsoft Graph.

## Azure setup required before deployment

Create or choose an Azure Function App running Node.js 20+ and deploy the compiled
`functions` project. Enable App Service Authentication with Microsoft Entra ID and
require authentication. Configure these application settings:

```text
DATAVERSE_URL=https://<org>.crm.dynamics.com
KEY_VAULT_URL=https://<vault>.vault.azure.net
```

Grant the Function App's managed identity:

1. Key Vault Secrets User on the vault.
2. A Dataverse application user/service principal with permission to read profiles
   and memberships, and read/write `fc_companyintegration`.
3. Microsoft Graph application permission `User.Invite.All`, with admin consent,
   if member invitations are enabled.

Store the Hugging Face token as the Key Vault secret `flowcom-huggingface` and add
`INVITATION_REDIRECT_URL` as a Function App setting.

Then create a Power Platform custom connector using `functions/openapi.yaml`. The
Code App should call that connector through its generated Power Apps data-source
service. Do not add a direct browser `fetch` to the Function App URL: hosted Code
Apps can block arbitrary network destinations through their content-security policy.

## Local build

From the repository root:

```powershell
cd functions
npm install
npm run build
```

Copy `local.settings.example.json` to `local.settings.json` only for local testing.
Never commit that file or any provider token.

## Cutover order

1. Deploy the Function App and configure identity/permissions.
2. Test the six routes with an authenticated Entra token and two test companies.
3. Create the custom connector and add it to the Code App.
4. Replace the remaining Supabase provider calls in `src/lib/groq.ts`,
   `src/contexts/BufferContext.tsx`, and the Header integration handlers with the
   generated connector service.
5. Only after that smoke test succeeds, remove the corresponding Supabase Edge
   Functions.
