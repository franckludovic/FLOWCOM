# FlowCom Dataverse migration

## Target architecture

FlowCom will use one Power Platform environment during the first Dataverse phase.
Companies are tenant boundaries inside that environment. Every company-owned
business table must be created as **User or Team owned** (not Organization owned),
and each company's rows will be assigned to that company's owning team. Access is
granted through Dataverse teams and security roles rather than Supabase RLS.

The Code App remains the React/Vite user interface. Dataverse becomes the system of
record. Server-side provider calls move to Azure Functions exposed through secured
Power Platform custom connectors. Provider credentials are stored in Azure Key
Vault; Dataverse stores only connection metadata and a reference/identifier.

## Migration map

| Supabase component | Dataverse target | Notes |
| --- | --- | --- |
| `profiles` | Entra users plus `fc_profile` | The Entra user is the identity; the profile table stores FlowCom preferences. Never copy `api_key`. |
| `companies` | `fc_company` | Remove the shared `is_active` preference. Active company remains a user-local preference. |
| `company_members` | `fc_companymembership` plus Dataverse team membership | Keep an explicit membership table for the app UI; use teams/security roles for enforcement. |
| `products` | `fc_product` | Required relationship to `fc_company`. |
| `audience_segments` | `fc_audiencesegment` | Required relationship to `fc_company`. |
| `key_messages` | `fc_keymessage` | Required relationship to `fc_company`. |
| `calendar_items` | `fc_calendaritem` | Use Dataverse Date Only for `post_date`; use choices for `format`, `channel`, and `status`. |
| `library_items` | `fc_libraryitem` | Use choices for `format`, `tone`, and `status`; keep long text as multiline columns. |
| `roadmap_milestones` | `fc_roadmapmilestone` | Alternate key: company + milestone id. |
| `weekly_reports` | `fc_weeklyreport` | JSON fields become multiline text initially; normalize later only if reporting requires it. |
| `content_scores` | `fc_contentscore` | Alternate key: company + library item. |
| `company_integrations` | `fc_companyintegration` | Safe provider/account metadata only. |
| `company_integration_secrets` | Azure Key Vault | Do not migrate access tokens into Dataverse columns. |
| Supabase Edge Functions | Azure Functions + custom connectors | Buffer, Groq, and image generation remain server-side. |

## Migration order

1. Create the Dataverse solution, publisher, tables, relationships, choices, and
   alternate keys from `dataverse/flowcom-schema.json`. Choose **User or Team** for
   ownership on every table containing customer/company data; this choice cannot be
   changed later.
2. Configure Dataverse security roles and company teams. Test owner, admin, editor,
   and viewer isolation with two test companies.
3. Add Dataverse tables to the Code App with the Power Apps CLI and commit the
   generated services.
4. Replace the Supabase auth context with the Code App/Entra identity and map the
   signed-in user to `fc_profile`.
5. Replace the company context and page-level Supabase queries with a Dataverse
   repository layer. Keep the existing UI types while this layer is changed.
6. Move the six Edge Functions to Azure Functions. Secure them with Entra ID and
   expose only the required operations through custom connectors.
7. Move provider credentials to Azure Key Vault and store only safe metadata in
   `fc_companyintegration`.
8. Remove the Supabase client, Supabase auth screens, and Supabase dependencies only
   after the Dataverse smoke tests pass.

## Deliberate decisions

- No production data migration is required. Existing dummy rows are disposable.
- The Supabase schema remains a reference until the Dataverse smoke test passes; it
  is not used for new features during this migration.
- Dataverse is the source of truth for application data after cutover.
- External providers are not replaced: Buffer, Groq, Hugging Face, Cloudinary, and
  the social networks still require their own APIs and credentials.
