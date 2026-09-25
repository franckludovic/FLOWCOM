# FLOWCOM handoff context

Updated: 2026-09-25 (Africa/Douala)

This file is a continuation brief for another model or future session. It contains project context, the work already completed, the current blocker, and the safest next steps. It intentionally contains no API keys, access tokens, passwords, or secret values.

## User’s goal

FLOWCOM is being migrated from the previous Supabase/edge-function AI path toward Power Platform and Dataverse. The application should:

1. Store company data in Dataverse.
2. Store each company’s AI/API secret securely in Dataverse.
3. Call an AI provider through a Power Automate flow.
4. Keep the application model-agnostic so the model can be changed later.
5. Eventually allow multiple providers such as Groq, OpenAI, and Anthropic.

## Project location

Repository/workspace:

`C:\Users\Metatron\Desktop\FLOWCOM`

The app is a Vite/React/TypeScript application. The Power Platform code-app configuration is in `power.config.json`.

## Current environment and Power Platform objects

Power Platform environment:

`7a0e4eed-419e-ec1f-b18f-db53cd2b62f3` (shown as “Franck’s Env”)

Solution:

- Display name: `FlowCom core`
- Solution ID: `76d1352c-45b7-f111-aaae-70a8a5114222`

Code app:

- App ID: `ee37bbf2-90e2-4725-95f3-5ef5cd4f2575`

Cloud flows:

- `SaveCompanySecret`
  - Workflow entity ID: `bff88e57-78b7-f111-aaae-70a8a5114222`
  - Workflow name: `6b03f808-0c38-8373-3ff6-81504e04372f`
- `ModelCall`
  - Workflow entity ID: `114fe044-12b8-f111-aaae-70a8a5114222`
  - Workflow name: `1f545c59-d618-d849-f16a-884f01a8e4e5`

## Dataverse work completed

The `FlowCom core` solution contains custom tables including:

- Company (`fc_company`)
- Company Secrets (`fc_companysecret`, entity set shown as `fc_companysecrets1`)
- Company Membership
- Company Integration
- FlowCom Profile
- Product
- Audience Segment
- Key Message
- Calendar Item
- Library Item
- Roadmap Milestone
- Weekly Report
- Content Score

The `Company Secrets` table has these important columns:

- Access Token: logical name `fc_accesstoken` / schema display shown as `fc_AccessToken`; column security was enabled.
- Company: lookup; schema name `fc_Company`, logical name `fc_company`; related table is Company.
- Provider: choice; logical name `fc_provider`; current choices include `Groq`, `Buffer`, and `HF`.
- Status: choice; current value used by the flow is `Connected`.
- Secret Label: primary name column.

The Company lookup metadata was checked in Power Apps. Its logical name is definitely `fc_company`. Its related Company table primary key is expected to be `fc_companyid`.

## SaveCompanySecret flow

Trigger: `Power Apps (V2)` with text inputs:

- `companyId`
- `provider`
- `accessToken`

Intended behavior:

1. List rows from Company Secrets for the company.
2. Filter the returned rows by provider.
3. If a matching row exists, update it.
4. Otherwise, add a new row.

Important field mapping:

- Company = `companyId`
- Access Token = `accessToken`
- Provider = the Dataverse choice `Groq` for the current implementation
- Status = `Connected`

Provider must not be left blank on either the Update row or Add a new row branch. The app currently sends the provider text `Groq`.

The flow has no secret value documented here. Never put the actual token into this file or into screenshots.

The frontend calls this flow in production from `src/contexts/AuthContext.tsx`:

```ts
SaveCompanySecretService.Run({
  text: companyId,
  text_1: 'Groq',
  text_2: key,
})
```

## ModelCall flow

Trigger: `Power Apps (V2)` with these text inputs:

- `companyId`
- `provider`
- `model`
- `messages`
- `temperature`
- `maxTokens`

Current intended flow:

1. List Company Secrets for the company.
2. Filter the rows to the requested provider.
3. Check whether a matching secret exists.
4. If yes, call the provider HTTP endpoint.
5. Return the model’s message content to Power Apps.
6. If no secret exists, return `No API key was found for this company and provider.`

Current provider implementation:

- Provider: Groq
- HTTP method: `POST`
- Endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Headers: `Content-Type: application/json` and `Authorization: Bearer <secret>`
- Body contains dynamic model, messages, temperature, and max_tokens.

The flow is called `ModelCall` deliberately. `Groq` is the current provider, not the model. A model-agnostic design means the model is a separate input. Provider-agnostic routing for OpenAI/Anthropic will require additional branches later.

## Frontend changes already completed

### AI client rename

The shared AI client was renamed from Groq-specific naming to model-agnostic naming:

- `src/lib/groq.ts` was renamed to `src/lib/model.ts`.
- `src/lib/groq.test.ts` was renamed to `src/lib/model.test.ts`.
- `GroqMessage` became `ModelMessage`.
- `callGroq` became `callModel`.
- `callGroqJSON` became `callModelJSON`.
- Groq-specific validation/error helper names were changed to model-neutral names.

Production `src/lib/model.ts` calls `ModelCallService.Run`. It currently sends:

- `text`: company ID
- `text_1`: `Groq`
- `text_2`: requested model or default `openai/gpt-oss-120b`
- `text_3`: JSON string of messages
- `text_4`: temperature as text
- `text_5`: max tokens as text

The default model should be reviewed after the flow reaches the HTTP step. It must be a model currently supported by the selected provider/account.

### Generated flow services

Generated files include:

- `src/generated/models/ModelCallModel.ts`
- `src/generated/services/ModelCallService.ts`
- `src/generated/models/SaveCompanySecretModel.ts`
- `src/generated/services/SaveCompanySecretService.ts`
- `.power/schemas/logicflows/ModelCall.Schema.json`
- `.power/schemas/logicflows/SaveCompanySecret.Schema.json`

### Other frontend fixes

- Dataverse error handling was improved in `src/lib/dataverse.ts` so object-shaped errors are serialized instead of appearing only as `[object Object]`.
- Memory form hydration was updated in `src/pages/Memory.tsx` so it refreshes when the active company becomes available.
- The Company save issue caused by a too-long Short Description was diagnosed from the Dataverse truncation error. The user shortened the description and the company then saved.

## Current failure and what it means

The browser reports:

```text
POST https://...environment.api.powerplatform.com/.../triggers/manual/run?api-version=2015-02-01-preview 502 (Bad Gateway)
```

This is only the Power Apps/Power Automate wrapper error. It does not prove that the API key is invalid.

The latest confirmed `ModelCall` run was inspected in Power Automate run history. The run reached `List rows 2` and failed before `Filter array`, `Condition`, or the HTTP action.

The confirmed latest internal error was:

```text
Action 'List_rows_2' failed:
Could not find a property named '_fc_company_value'
on type 'Microsoft.Dynamics.CRM.fc_companysecret'.
```

Earlier, before the property error, the filter also failed once because it was generated without a space:

```text
_fc_company_value eq33e2ff6c-...
```

The missing-space problem was corrected by entering the filter as an `fx` expression token. However, `_fc_company_value` itself is not accepted by the current `List rows 2` action/table metadata.

## Immediate next step

In `ModelCall` → `List rows 2` → `Filter rows`, replace the current expression with this expression through the **Expression** picker:

```text
concat('fc_company/fc_companyid eq ', string(triggerBody()?['text']))
```

Use the expression editor, not plain text. Do not add `@`, `@{}`, backticks, or quotes around the GUID. After pressing **OK/Update**, the field should show a purple `fx` token.

This uses the lookup navigation-property pattern rather than the rejected `_fc_company_value` property. Microsoft’s Dataverse documentation describes filtering related lookup values through a navigation-property path and using OData-style filter expressions.

Save the flow and retry one AI recommendation. Then inspect the newest `ModelCall` run:

1. If `List rows 2` succeeds, inspect `Filter array`.
2. If `Filter array` is empty, verify the Company Secrets row’s Company and Provider values.
3. If the HTTP step fails with `401`, inspect the secured Access Token read permission and Authorization header; do not expose the key.
4. If HTTP fails with `400` or “model not found,” change the model input to one listed as available by the provider.
5. If HTTP succeeds but the Power Apps response fails, inspect the Respond to a Power App or flow action and its content expression.

## Secret and permission checks

The Access Token column is secured. The Dataverse connection used by the flows is the user connection `tankeu.frank@africauniv.tech` / Microsoft Dataverse. If the flow can find the row but the token is empty, the connection user or its column-security profile needs read access to `fc_accesstoken`.

Do not disable security permanently. If necessary for diagnosis, first confirm the flow connection and column-security read permission. Never paste the token into chat, screenshots, source code, or this file.

## Complete input and secret map

This section lists every input name and secret-related location so another model can continue without guessing. Actual credential values are intentionally redacted.

### SaveCompanySecret trigger inputs

The Power Apps (V2) trigger has three text inputs. The generated schema uses the generic internal names below:

| User-facing input | Generated internal name | Meaning | Secret? |
|---|---|---|---|
| `companyId` | `text` | Dataverse Company row GUID | No |
| `provider` | `text_1` | Current value `Groq` | No |
| `accessToken` | `text_2` | The provider API key/token entered by the company owner | **Yes; value redacted** |

Frontend production call in `src/contexts/AuthContext.tsx`:

```ts
SaveCompanySecretService.Run({
  text: companyId,
  text_1: 'Groq',
  text_2: key,
})
```

The `key` variable is the sensitive value typed by the user. It must not be copied into source code, logs, screenshots, chat, or this handoff file.

### SaveCompanySecret Dataverse destinations

The flow writes to the `Company Secrets` table (`fc_companysecret`):

| Dataverse field | Intended value | Secret? |
|---|---|---|
| Company (`fc_company`) | `companyId` GUID | No |
| Provider (`fc_provider`) | Choice `Groq` | No |
| Access Token (`fc_accesstoken`, schema shown as `fc_AccessToken`) | `accessToken` / `key` | **Yes; stored in secured column** |
| Status (`fc_status`) | Choice `Connected` | No |
| Secret Label (`fc_Newcolumn`) | Any non-secret label required by the table | No |

Provider choice values observed in Power Apps:

- Groq: `122370000`
- Buffer: `122370001`
- HF: `122370002`

The flow should use the actual Dataverse choice `Groq`, not a model name and not `Grok`. `Grok` is a different xAI product; the current endpoint is Groq.

### ModelCall trigger inputs

The Power Apps (V2) trigger has six text inputs:

| User-facing input | Generated internal name | Meaning | Secret? |
|---|---|---|---|
| `companyId` | `text` | Dataverse Company row GUID | No |
| `provider` | `text_1` | Current value `Groq` | No |
| `model` | `text_2` | Provider model identifier | No |
| `messages` | `text_3` | JSON string containing chat messages | No, but may contain business data |
| `temperature` | `text_4` | Numeric generation setting | No |
| `maxTokens` | `text_5` | Maximum output token count | No |

Frontend production call in `src/lib/model.ts`:

```ts
ModelCallService.Run({
  text: body.companyId,
  text_1: 'Groq',
  text_2: options.model ?? 'openai/gpt-oss-120b',
  text_3: JSON.stringify(body.messages),
  text_4: String(options.temperature ?? 0.7),
  text_5: String(options.max_tokens ?? 2048),
})
```

### Secret retrieval and HTTP construction

The intended ModelCall sequence is:

1. Use `companyId` to find the Company Secrets row.
2. Match the Provider choice to `Groq`.
3. Read the secured `fc_accesstoken` value using the flow’s Dataverse connection.
4. Build the HTTP header:

```text
Authorization: Bearer <value read from fc_accesstoken>
```

5. POST to the Groq-compatible chat-completions endpoint.

The actual `<value read from fc_accesstoken>` is deliberately not present in this document. If the HTTP action later reports `401`, verify that the flow connection has read access to the secured Access Token column before replacing the key.

### Secret locations checklist

- Source of the secret: company owner’s API-key input in the app.
- Save flow input: `SaveCompanySecret.text_2`.
- Dataverse destination: `Company Secrets.fc_accesstoken` / `fc_AccessToken`.
- Protection: Dataverse column security is enabled.
- Model flow retrieval: `ModelCall` → `List rows 2` result → matching Company Secrets row.
- HTTP use: Authorization Bearer header built from the retrieved token.
- Frontend storage: production code should not persist the raw key in React profile data or browser storage.

If a future handoff needs the key itself, the user must enter it directly into the appropriate secure Power Platform field or secret manager. It should never be placed in a repository Markdown file.

## Provider/model design decision

Keep the Dataverse column named `Provider`.

Current choice:

- `Groq`

Future choices can include:

- `OpenAI`
- `Anthropic`

Do not rename the provider choice to `Model`. The provider identifies the API service; the model identifies the model selected at runtime. To add another provider later, add a provider-specific branch with its endpoint, authentication header, request shape, response extraction, and secret lookup.

## Useful files

- `src/lib/model.ts` — production model-call client.
- `src/contexts/AuthContext.tsx` — production API-key save call.
- `src/lib/dataverse.ts` — Dataverse mappings and error handling.
- `src/pages/Memory.tsx` — company memory form hydration.
- `power.config.json` — code-app data-source and flow configuration.
- `.power/schemas/logicflows/ModelCall.Schema.json` — generated ModelCall trigger/response schema.
- `.power/schemas/logicflows/SaveCompanySecret.Schema.json` — generated secret-save trigger schema.

## Do not repeat unnecessarily

- Do not refill the company form just because the AI flow returns 502; the company save issue was a separate Short Description truncation issue.
- Do not re-enter or share the API key until the `List rows 2` lookup succeeds.
- Do not rename `Provider` to `Model`.
- Do not treat browser console messages about the Microsoft Graph profile photo (`404`) or service worker cache as the cause of the AI failure. The relevant error is the Power Platform flow run.

## Definition of done

The migration is complete for the current Groq provider when:

- Company data saves and reloads from Dataverse.
- Company Secrets saves a row with the correct Company, Provider, Status, and secured Access Token.
- ModelCall’s List rows, Filter array, Condition, HTTP, and Respond actions all succeed.
- Dashboard/Workspace AI recommendations return content.
- Errors shown in the frontend identify the failed stage instead of only showing `[object Object]` or a generic 502.

Provider expansion is a later phase after the Groq path works end-to-end.
