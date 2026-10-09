# Recurring entry editing plan

Status: implemented and locally validated on 2026-10-08, following user approval.
The implementation is in the working tree; no deployment or Drive synchronization was performed.

## Agreed behavior

When saving a recurring entry with an actual amount or description change, offer:

| UI option | Existing entries affected | Entries generated later |
| --- | --- | --- |
| Solo esta transacción | Selected entry only | Keep the existing series rules |
| Esta y las futuras transacciones | Same series, occurrence index at or above the selected index | Use the new values from that index onward |
| Toda la serie | All existing entries in the same series | Use the new values throughout the series |

- Propagate only fields actually changed in the form. Changing the amount must not overwrite other months' descriptions, and changing the description must not flatten their amounts.
- The user confirmed that a future-scope change replaces already scheduled later changes for the modified fields. Preserve later changes for every other field.
- The user confirmed that date changes affect only the selected entry, even when the amount/description scope is future or series. Explain this in the scope selector when the date also changes.
- Determine scope by `recurrenceId` and `occurrenceIndex`, never by matching descriptions, amounts, array order, or edited transaction dates. “Current” means the selected occurrence, including when editing history.
- Apply this to both indefinite recurrences and finite monthly installment series, for expenses and incomes. A finite series must still end at its existing occurrence limit.
- Non-recurring entries, date-only edits, and saves without actual changes do not need a scope selector. No-change saves must not write storage or change timestamps.
- Cancelling the scope selector, tapping its backdrop, or pressing Escape saves nothing and keeps the edited form available. Prevent repeated save taps while selecting a scope.
- Whole-series selection must clearly state that previous months will also change. Do not preselect a broader scope.

Example: changing October rent with future scope leaves September and earlier amounts unchanged and applies the October amount to November onward. A later December change starts a new effective value in December. A subsequent October future-scope edit replaces the December change for the fields edited in October.

## Pre-implementation evidence

- `NewEntryModalComponent.handleSave()` closes the form and emits the complete amount/date/description payload immediately.
- `BalancePage.handleEntryUpdated()` and `MovementDetailPage.handleEntryUpdated()` are the two production callers of `EntryService.updateEntry()`. Balance also serves the historical month detail route.
- `EntryService.updateEntry()` edits one stored entry, preserves its recurrence metadata, and stamps `updatedAt`.
- Deletion already selects `single`, `future`, or `series` through `EntryActionService` and applies scope in `EntryService.removeEntry()`.
- `ensureRecurringEntriesUpTo()` groups by recurrence ID, prefers occurrence zero as its template, and copies that entry's amount/description for missing occurrences. Editing existing future rows alone cannot change future generation. Editing occurrence zero alone can unintentionally change later generation.
- Recurrence generation commits a captured array in a promise microtask. An intervening edit/delete/import can be overwritten by that captured array. Treat this as a code-inspection risk to reproduce with a focused test before fixing the affected path.
- Installment projections in `entry-series-display.util.ts` use the inspected entry's amount for every ungenerated installment. They must resolve the same effective values as generation.
- JSON export writes the entry array. JSON import replaces the collection after normalization. Drive synchronization merges by entry ID and `updatedAt`, then exports the same JSON. Recurrence equality and normalization currently enumerate known fields explicitly.
- Excel duplicate detection first checks retained `idempotencyInfo`, then checks amount/type/date proximity. Editing display values must not regenerate or transfer bank import keys to another occurrence.

Read-only inspection of the supplied JSON found 1,349 entries, 228 recurring entries in 29 series, and 963 entries with import keys. No duplicate entry IDs or duplicate series/index pairs were found. Existing series include different monthly amounts, renamed occurrences, and excluded months. Rent has 11 occurrences with four distinct amounts; its October amount differs from occurrence zero. These differences must not be interpreted automatically as recurring rules.

Read-only inspection of the three XLSX files confirmed the CMR description/installment columns and the BICE provisional `Abonos y cargos` section. This was structural inspection, not execution of the application's import flow.

## Minimum persistent representation

Keep the entry-array export, local-storage key, entry IDs, and recurrence IDs. Add optional effective-value metadata inside `EntryRecurrence`; do not split a series into new IDs and do not add a second independent storage collection.

Proposed shape (names may be adjusted to existing conventions):

```ts
valueSchedule?: {
  revision: string;
  baseline: { amount: number; description: string | null };
  changes: Array<{
    fromOccurrenceIndex: number;
    amount?: number;
    description?: string | null;
  }>;
};
```

- The baseline separates series defaults from the actual values of occurrence zero. Effective changes are partial patches sorted by index. `null` explicitly clears a description and survives JSON serialization; a missing property means “leave this field unchanged.”
- Resolve each field from the baseline plus changes at or before the requested occurrence index. One small shared utility should serve storage generation and installment projections.
- Store identical schedule metadata on surviving members of a series, as the application already does for exclusions and termination. Keep occurrence-specific amounts, descriptions, dates, and bank keys on their own entries.
- New series can initialize the baseline at creation. For legacy series, capture the template currently used by generation before the first edit that needs a schedule. Keep existing occurrence values and exclusions verbatim; do not infer propagation from historical differences or infer that the latest actual amount is the default.
- A single edit changes the materialized occurrence, not its series schedule. Capturing a baseline before editing occurrence zero prevents unintended propagation. Existing materialized rows remain authoritative exceptions; resolving a schedule must not routinely rewrite them.
- Future edits patch existing rows from the cutoff, add/replace the effective patch at that cutoff, and remove the same fields from later patches. Retain unrelated fields and remove empty patches. Whole-series edits update the modified baseline fields and remove later patches for those fields.
- Never recreate excluded occurrences, extend a terminated series, or alter anchor dates, numbering, entry types, or import identities as a side effect of editing values.
- Schedule metadata must survive deletion of the first occurrence or of the occurrence where a value change started. Deleting future occurrences must still truncate termination; unused later schedule patches can be pruned consistently.
- Updating shared schedule metadata can change timestamps on earlier records even though their displayed values remain unchanged. Use one operation timestamp and document/test this distinction for synchronization.

## Implementation sequence and affected files

1. **Define the data contract and effective-value rules.** Extend `entry-data.model.ts` with the shared scope type and optional schedule. Use an edit payload containing only changed fields; preserve the distinction between omitted description and explicitly cleared description. Add a small schedule resolver and focused tests. Keep `updateEntry()` defaulting to single so existing callers retain their contract.
2. **Implement scoped mutation in `EntryService`.** Validate the complete operation before committing once. Broader scopes can propagate only amount/description; handle a submitted date once on the selected entry. Preserve each entry's own import keys and identity. Validate indices, finite integer amounts, supported fields, explicit clears, and schedule structure at import/storage boundaries. A malformed schedule in an import must reject the import before replacing data, rather than silently discarding the user's future rules.
3. **Make persistence/generation coherent.** Use the effective-value resolver for missing occurrences. Recheck current state before a deferred generation commit and recompute if the captured state is stale. Do not change Angular's signal scheduling casually. Write durable storage before publishing the in-memory mutation so a storage exception cannot publish half of a bulk edit; cover that failure path.
4. **Preserve the rules through JSON and Drive.** Update recurrence normalization, equality, restore, import, and merge paths. Include schedule-only changes in equality. Resolve replicated schedules by their own revision within each series, independently of which row happens to be selected as the template; an absent older schedule cannot erase a newer one. Preserve the existing per-entry merge policy for materialized transactions. Test that an old or newly added remote member cannot revert the schedule, and that a newer single edit does not become a recurring default.
5. **Add the scope selector to the existing editor.** Reuse `EntryActionService` for a shared edit helper that selects scope through Ionic's existing action sheet and applies the update. Have the editor await its result before marking the form saved or closing it. Replace the two duplicated page update handlers and their edit-event bindings with this shared path; leave the existing creation output unchanged. This lets cancellation, a missing target, or a persistence exception keep the form open without adding an event acknowledgement protocol. Keep validation and the existing unsaved-change guard. Recheck that the target still exists when applying an edit after an asynchronous selector. Return a clear saved/cancelled outcome, show a localized failure on exceptions, and preserve the draft on failure.
6. **Update affected display and tests.** Resolve projected installment amounts through the same utility. Existing actual values still take precedence. Update page mocks/specs and add an editor spec, which currently does not exist. Verify balances, historical months, trends, movement detail, and installment labels after edits. Keep the bank parsers and duplicate matching unchanged unless a scoped-edit regression test proves a required adjustment.

Production file reach: `entry-data.model.ts`, `entry.service.ts`, `entry-action.service.ts`, `new-entry-modal.component.ts` and its template if explanatory copy is needed, `balance.page.ts` and its template, `movement-detail.page.ts` and its template, `entry-series-display.util.ts`, and a shared effective-value utility. Settings and sync already delegate serialization/merging to `EntryService`; change their production code only if the revised contract requires it. No environment, deployment, routing, dependency, or production-secret changes are expected.

## Regression and acceptance checks

| Area | Required checks |
| --- | --- |
| Scope and changed fields | All three scopes; amount only, name only, both; explicit description clear; editing past and future occurrences; same names in unrelated series; recurring incomes; non-recurring and no-change saves |
| Generation | Pre-generated future rows and months not generated yet; multiple effective changes; a later single exception; editing occurrence zero; restart; JSON round trip; finite last occurrence; excluded months; generation racing with edit/delete/import |
| Deletion | Single/future/whole-series after editing; deleting occurrence zero; deleting a change-start occurrence; no resurrection of deleted months; no continuation past truncated termination |
| Compatibility | Existing array and supported wrapper JSON formats; legacy records without timestamps or schedules; preserve all existing IDs, dates, keys, exclusions, types, and heterogeneous actual values; malformed schedule import leaves storage untouched |
| Synchronization | Schedule-only differences; older backup merged into newer data; newer schedule merged into older data; mixed replicas; missing occurrence zero; stale newly added member; repeated merge; explicit clear; generate the next month after each merge |
| Excel imports | Reimport the same CMR/BICE row after editing its linked entry: retained bank key still detects the duplicate; other occurrences do not inherit that key; confirmed potential duplicate attaches a key only to its matched entry; installment conversion still works |
| Editor and persistence | Three choices visible for recurring value edits; cancellation/backdrop/Escape preserves draft; double-tap saves once; date-only edits skip selector; mixed date/value edits move only selected date; failed persistence does not publish or lose the draft |
| Views | Current balance, historical balance, trends, registered/projected series amounts, and finite series numbering/end month remain consistent |

Use small synthetic fixtures derived from the structural cases in the attachments. Keep complete personal transaction backups and bank statements outside the repository. Exercise the supplied files only in disposable local data, with no writes to the source files and no Drive synchronization.

During implementation, run the focused service/action/editor/page/series/import/settings specs, then the complete no-watch suite, `npm run lint`, and `npm run build:local` under Node 22. Complete manual editor flows from Balance, historical Balance, and Movement Detail, including mobile overlay cancellation. A successful round trip is not enough: generate an additional month afterward and verify its effective values. No tests or builds were run during the original planning-only review. The implementation validation is recorded below.

## Boundaries and release risks

- Backward input compatibility is required: the updated app must accept current exports without rewriting history. Forward compatibility with an old app is not available automatically: its normalizer will strip unknown schedule metadata. Do not claim a new backup can be safely round-tripped through an old app. Keep an untouched pre-change backup before rollout or rollback.
- The existing Drive merge is a timestamp-based, whole-entry merge. It does not provide field-level conflict resolution for simultaneous offline edits, and it can independently generate duplicate series/index entries on different devices. This plan must preserve that policy while adding schedule reconciliation; a general multi-device synchronization redesign is outside scope. Reconcile the latest schedule deterministically and test mixed replicas before accepting the feature.
- Bank rows newly received with a different source amount/key may still require the existing manual duplicate review. Preserving original keys guarantees repeat recognition for the same imported source row; it does not make a changed bank row the same transaction automatically.
- Do not automatically reinterpret existing single edits as recurring changes, change recurrence dates/frequency/termination through the editor, add IPC calculations, or add a rule-management screen. The requested scope selector and effective-value persistence are sufficient.

## Version/API evidence

The lockfile resolves Angular core to 21.2.15, Ionic Angular/core to 8.8.8, and `read-excel-file` to 7.0.3. Reuse the project's existing standalone Ionic imports and Angular output bindings.

The current Ionic documentation page now labels itself v9, so it must not serve as version-specific evidence for this app. The official [Ionic 8.8.8 action-sheet source](https://github.com/ionic-team/ionic-framework/blob/v8.8.8/core/src/components/action-sheet/action-sheet.tsx) and installed 8.8.8 declarations confirm button data and the dismissal promise used to select a scope. Version-specific Angular documentation was unavailable during review; the plan introduces no new Angular API, and runtime/editor behavior remains part of implementation validation.


## Implementation and validation — 2026-10-08

Implemented the three edit scopes using changed-field payloads and a shared `EntryActionService` editor path. Scope cancellation keeps the draft open; no-change saves do not persist or stamp records, including dates with fractional seconds. Amount/description propagation leaves dates, import keys, types, IDs, exclusions and finite limits on their original occurrences.

Schedules are initialized lazily before the first value edit, using the same legacy template as generation. Single exceptions never change the rules. Future edits replace later patches only for modified fields; whole-series edits update those baseline fields. Shared metadata is stamped once per operation, including earlier members whose displayed values remain unchanged. A single edit on a series with existing rules retains their revision.

JSON normalization and storage restoration validate schedule structure before replacing data. Merge reconciles the latest schedule revision from both replicas independently of the per-entry timestamp policy, with a deterministic tie-break. Storage is written before publishing changes. The generation race was reproduced on the original code (`Expected 1000 to be 2000`) and fixed by recomputing pending generation when its captured collection is stale.

The additional production reach is `trends-data.util.ts`: chart and month-detail installment projections now share effective values and retain actual future exceptions. This also avoids omitting already materialized future installments. No bank-parser, synchronization-service, environment, routing, deployment or dependency-contract changes were necessary. `npm ci` restored the lockfile versions before validation: Angular 21.2.15 and Ionic 8.8.8. Version-specific Angular documentation remained unavailable; installed declarations and runtime/component tests were used. Ionic dismissal data was checked against the official 8.8.8 source linked above and the installed source/types.

Validation completed under Node 22.22.3:

- Focused service, action, editor, page, schedule/series, trends, import and settings specs: **689 passed**.
- Complete no-watch Chrome suite: **924 passed**.
- `npm run lint`: passed.
- `npm run build:local`: passed.
- `git diff --check`: passed for the implementation working tree.
- Karma's initial sandbox run could not bind its port (`EPERM`); validation ran successfully on the host. An outdated Angular build cache after dependency reinstallation was cleared before the original-code race reproduction. These environment failures were not counted as passing checks.

Manual local-browser acceptance used three disposable synthetic installments at 390 × 844, without authentication or Drive synchronization:

- Balance swipe-to-edit: October amount changed from 1,200 to 2,500 with future scope; August/September stayed 1,000/1,100. Escape and backdrop cancellation retained the 2,500 draft and re-enabled Save.
- Historical Balance: a September description-only single edit preserved its 1,100 amount and October's 2,500 amount.
- Movement Detail: a whole-series description change preserved heterogeneous amounts and changed only the selected September date. The scope selector explained the date restriction and warned that whole-series scope includes previous months. A subsequent date-only edit closed without a scope selector.
- Series display and Trends: November–January projected 2,500, with the new shared description; the finite numbering/end month stayed at 6 installments ending January 2027.
- Actual JSON export and reimport: the export contained the 1,000 baseline, October effective amount patch, shared description, original IDs and occurrence-specific dates. After restoration, opening November generated **Serie editada, 2,500, Cuota 4 de 6**, rather than merely verifying the existing rows.

Repository test fixtures contain no personal backup or bank-statement data. Synthetic CMR/BICE parser regressions verify retained import-key duplicate recognition after scoped edits, no key transfer to generated occurrences, confirmed-key attachment only to the matched occurrence, and installment conversion. The supplied personal files were not changed or imported during this implementation.

Not validated: a production deployment/build with generated production credentials, live Drive access, physical-device Safari/Ionic behavior, or end-to-end reimport of the supplied personal XLSX statements. Existing whole-entry offline conflict and duplicate-occurrence merge limitations remain unchanged. Older app versions can strip the new schedule metadata; retain a pre-upgrade backup for rollback.
