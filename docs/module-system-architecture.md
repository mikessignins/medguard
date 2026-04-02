# Modular Product Architecture

## Goal

Make MedGuard easy to extend with new business-paid forms and workflows without:

- adding new columns to `public.businesses`
- creating disruptive one-off schema changes every time
- rewriting RLS for each new feature
- duplicating billing, export, purge, and audit logic

The recommended pattern is:

- stable module registry in the database
- per-business module enablement
- versioned form definitions
- generic submission engine for future modules
- shared web/iOS module registry in code

This lets you keep the current core modules working while future modules plug into a cleaner foundation.

## Database Model

Use these stable tables:

1. `public.modules`
2. `public.business_modules`
3. `public.module_form_versions`
4. `public.module_submissions`

Those are introduced in:

- [012_module_engine_foundation.sql](/Volumes/1tbusb/MedM8_WebApp/docs/migrations/012_module_engine_foundation.sql)

### Why this is the right split

`public.businesses` should stay focused on tenant identity and branding:

- name
- contact details
- branding
- reminder interval
- platform-level settings

`public.business_modules` should carry entitlements and per-business module configuration:

- whether a module is enabled
- role-specific behavior overrides
- site or workflow config
- billing/config flags for that business

This is the key move that keeps future changes non-destructive.

## Recommended Rollout

### Phase 1

Add the new module tables and seed:

- `emergency_declaration`
- `confidential_medication`

Map the existing `confidential_med_dec_enabled` value into `business_modules`.

Do not remove current legacy tables yet.

### Phase 2

Keep existing forms on their current tables:

- `submissions`
- `medication_declarations`

But use `business_modules` as the source of truth for module enablement in both apps.

### Phase 3

Build all future customer-specific modules on:

- `module_form_versions`
- `module_submissions`

This avoids adding a fresh table every time.

### Phase 4

Optionally migrate legacy form types into the generic engine later if it becomes worthwhile.

## Shared Module Registry In Code

Both apps should have a registry keyed by module ID.

The database tells you which modules are enabled.
The app registry tells you how each enabled module should behave in UI.

### Web shape

```ts
export type ModuleKey =
  | 'emergency_declaration'
  | 'confidential_medication'
  | 'fatigue_assessment'
  | 'fit_for_work_plus'

export type ModuleSurface =
  | 'worker_home'
  | 'medic_queue'
  | 'medic_exports'
  | 'admin_reporting'
  | 'superuser_config'

export interface ModuleRegistryEntry {
  key: ModuleKey
  title: string
  category: 'core' | 'optional' | 'custom'
  icon: string
  roles: Array<'worker' | 'medic' | 'admin' | 'superuser'>
  surfaces: ModuleSurface[]
  submissionBackend: 'legacy_emergency' | 'legacy_medication' | 'module_engine'
  supportsExport: boolean
  supportsPurge: boolean
  isBillable: boolean
}

export const MODULE_REGISTRY: Record<ModuleKey, ModuleRegistryEntry> = {
  emergency_declaration: {
    key: 'emergency_declaration',
    title: 'Emergency Declaration',
    category: 'core',
    icon: 'alert-triangle',
    roles: ['worker', 'medic', 'admin', 'superuser'],
    surfaces: ['worker_home', 'medic_queue', 'medic_exports', 'admin_reporting'],
    submissionBackend: 'legacy_emergency',
    supportsExport: true,
    supportsPurge: true,
    isBillable: true,
  },
  confidential_medication: {
    key: 'confidential_medication',
    title: 'Confidential Medication Declaration',
    category: 'optional',
    icon: 'shield-plus',
    roles: ['worker', 'medic', 'admin', 'superuser'],
    surfaces: ['worker_home', 'medic_queue', 'medic_exports', 'admin_reporting'],
    submissionBackend: 'legacy_medication',
    supportsExport: true,
    supportsPurge: true,
    isBillable: true,
  },
  fatigue_assessment: {
    key: 'fatigue_assessment',
    title: 'Fatigue Assessment',
    category: 'custom',
    icon: 'moon',
    roles: ['worker', 'medic', 'admin', 'superuser'],
    surfaces: ['worker_home', 'medic_queue', 'admin_reporting'],
    submissionBackend: 'module_engine',
    supportsExport: true,
    supportsPurge: true,
    isBillable: true,
  },
  fit_for_work_plus: {
    key: 'fit_for_work_plus',
    title: 'Fit For Work Plus',
    category: 'custom',
    icon: 'clipboard-check',
    roles: ['worker', 'medic', 'admin', 'superuser'],
    surfaces: ['worker_home', 'medic_queue', 'admin_reporting'],
    submissionBackend: 'module_engine',
    supportsExport: false,
    supportsPurge: false,
    isBillable: false,
  },
}
```

### iOS shape

```swift
enum ModuleKey: String, Codable, CaseIterable {
    case emergencyDeclaration = "emergency_declaration"
    case confidentialMedication = "confidential_medication"
    case fatigueAssessment = "fatigue_assessment"
    case fitForWorkPlus = "fit_for_work_plus"
}

enum ModuleSurface: String, Codable {
    case workerHome = "worker_home"
    case medicQueue = "medic_queue"
    case medicExports = "medic_exports"
    case adminReporting = "admin_reporting"
    case superuserConfig = "superuser_config"
}

enum ModuleBackend {
    case legacyEmergency
    case legacyMedication
    case moduleEngine
}

struct ModuleRegistryEntry {
    let key: ModuleKey
    let title: String
    let category: String
    let systemImage: String
    let roles: [UserRole]
    let surfaces: [ModuleSurface]
    let submissionBackend: ModuleBackend
    let supportsExport: Bool
    let supportsPurge: Bool
    let isBillable: Bool
}

let moduleRegistry: [ModuleKey: ModuleRegistryEntry] = [
    .emergencyDeclaration: ModuleRegistryEntry(
        key: .emergencyDeclaration,
        title: "Emergency Declaration",
        category: "core",
        systemImage: "cross.case.fill",
        roles: [.worker, .medic, .admin, .superuser],
        surfaces: [.workerHome, .medicQueue, .medicExports, .adminReporting],
        submissionBackend: .legacyEmergency,
        supportsExport: true,
        supportsPurge: true,
        isBillable: true
    ),
    .confidentialMedication: ModuleRegistryEntry(
        key: .confidentialMedication,
        title: "Confidential Medication Declaration",
        category: "optional",
        systemImage: "pills.fill",
        roles: [.worker, .medic, .admin, .superuser],
        surfaces: [.workerHome, .medicQueue, .medicExports, .adminReporting],
        submissionBackend: .legacyMedication,
        supportsExport: true,
        supportsPurge: true,
        isBillable: true
    ),
]
```

## Service Pattern

Build one module service in each app:

- fetch enabled modules for a business
- merge database enablement with app registry metadata
- expose a list of active modules per role and screen

The helper RPCs should stay business-scoped for normal users and only allow cross-business reads for superusers.

### Web service shape

```ts
export interface EnabledBusinessModule {
  module_key: string
  module_name: string
  category: string
  enabled: boolean
  config: Record<string, unknown>
  current_version: number
  is_billable: boolean
  billing_category: string | null
}

export async function getBusinessModules(
  supabase: SupabaseClient,
  businessId: string
) {
  const { data, error } = await supabase.rpc('get_enabled_business_modules', {
    p_business_id: businessId,
  })

  if (error) throw error

  return (data ?? []).map((row) => {
    const registry = MODULE_REGISTRY[row.module_key as ModuleKey]
    return {
      ...row,
      registry,
    }
  })
}
```

### iOS service shape

```swift
struct EnabledBusinessModule: Decodable, Identifiable {
    let moduleKey: String
    let moduleName: String
    let category: String
    let enabled: Bool
    let config: [String: String]?
    let currentVersion: Int
    let isBillable: Bool
    let billingCategory: String?

    var id: String { moduleKey }

    enum CodingKeys: String, CodingKey {
        case moduleKey = "module_key"
        case moduleName = "module_name"
        case category
        case enabled
        case config
        case currentVersion = "current_version"
        case isBillable = "is_billable"
        case billingCategory = "billing_category"
    }
}
```

## Rendering Pattern

Do not make the dashboards directly ask “is confidential med dec enabled?”

Instead:

- fetch enabled modules
- filter them by role
- render sections/cards based on `surfaces`

For example:

- worker home shows enabled modules where `surfaces` includes `worker_home`
- medic queue shows enabled modules where `surfaces` includes `medic_queue`
- admin reporting shows only reporting-capable modules

This gives you a modular UI, not just a modular schema.

## Future Module Workflow

When a customer asks for a new form:

1. add a row to `public.modules`
2. add a row to `public.module_form_versions`
3. enable it for the specific business in `public.business_modules`
4. add renderers in web and iOS for that module key
5. store future submissions in `public.module_submissions`

No critical tenant schema change is needed.

## Billing Pattern

Billing should move toward module metadata rather than hand-built per-form logic.

Use:

- `modules.is_billable`
- `modules.billing_category`

Then your reporting layer can aggregate from:

- legacy tables for current modules
- `module_submissions` for future modules

Eventually you can centralize billing behind one reporting function.

## RLS Pattern

For future module submissions, keep one shared rule set:

- workers: own rows only
- medics: same business and assigned sites only
- admins: aggregate/reporting only
- superusers: aggregate/reporting only

Avoid inventing bespoke row policies for every new module.

## Practical Recommendation

Do not migrate legacy emergency and confidential-medication submissions immediately.

Use this foundation to:

- stop adding more columns like `confidential_med_dec_enabled`
- launch future business-specific forms cleanly
- progressively standardize new modules on one engine

That gives you the flexibility you want without destabilizing the current product.
