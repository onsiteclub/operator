# Lot Extraction Scenarios

The lot number is the **single most valuable field** in a material request —
it answers "where does this go?". Without it, the machinist cannot deliver,
and the request is useless until the operator calls back.

This document catalogues every way a lot identifier can appear in a
construction-worker SMS. It serves three purposes:

1. **Prompt engineering**: the `request-ingest` system prompt (OpenAI GPT-4o)
   should handle every pattern here. Whenever the AI misses one, add it here
   and extend the prompt.
2. **Test cases**: use as fixtures for future integration tests of the ingest
   edge function.
3. **Prumo training data**: annotated examples feed the eventual proprietary
   model. Each scenario = one labelled pair `(raw_text, expected_lot)`.

---

## Recognition targets

For every scenario, the AI must output a `lot` string **preserved exactly as
written** (no normalization: `22A` stays `22A`, `70-C` stays `70-C`, leading
zeros kept).

---

## 1. Explicit English markers

| Raw text | Expected lot |
|---|---|
| `lot 15` | `15` |
| `LOT 15` | `15` |
| `Lot 15` | `15` |
| `l15` | `15` |
| `L15` | `15` |
| `L 15` | `15` |
| `lt 15` | `15` |
| `lt15` | `15` |
| `lot15` | `15` |
| `#15` | `15` |
| `# 15` | `15` |
| `house 15` | `15` |
| `unit 15` | `15` |
| `plot 15` | `15` |
| `block 15` | `15` |

## 2. Portuguese markers

| Raw text | Expected lot |
|---|---|
| `lote 15` | `15` |
| `LOTE 15` | `15` |
| `lt 15` | `15` |
| `casa 15` | `15` |
| `bloco 15` | `15` |
| `unidade 15` | `15` |

## 3. Spanish markers

| Raw text | Expected lot |
|---|---|
| `lote 15` | `15` |
| `casa 15` | `15` |
| `parcela 15` | `15` |
| `unidad 15` | `15` |

## 4. Tagalog / Filipino markers

| Raw text | Expected lot |
|---|---|
| `bahay 15` | `15` |
| `lote 15` | `15` |
| `bloke 15` | `15` |

## 5. French markers

| Raw text | Expected lot |
|---|---|
| `lot 15` | `15` |
| `maison 15` | `15` |
| `unité 15` | `15` |

## 6. Letter and dash suffixes (keep literally)

| Raw text | Expected lot |
|---|---|
| `lot 22A` | `22A` |
| `lot 22a` | `22a` |
| `lot 70-C` | `70-C` |
| `lot 15-B` | `15-B` |
| `lot 15.A` | `15.A` |
| `lot 15/A` | `15/A` |
| `L15B` | `15B` |
| `lot15b` | `15b` |
| `lot 015` | `015` |

## 7. Prepositions / connectors

| Raw text | Expected lot |
|---|---|
| `for lot 15` | `15` |
| `to lot 15` | `15` |
| `at lot 15` | `15` |
| `send to 15` | `15` |
| `deliver to 15` | `15` |
| `for 15` (in context of material order) | `15` |
| `on 15` | `15` |
| `para o 15` (pt) | `15` |
| `pro lote 15` (pt slang) | `15` |
| `al lote 15` (es) | `15` |

## 8. Position variance

| Raw text | Expected lot |
|---|---|
| `lot 15 - 10 2x6` (start) | `15` |
| `need 10 2x6 lot 15` (end) | `15` |
| `send 10 2x6 to lot 15 please` (middle) | `15` |
| `15 - 10 2x6` (bare number at start, dash context) | `15` |
| `10 2x6 - 15` (bare number at end, dash context) | `15` |

## 9. Bare number — context-dependent

A bare number is a lot ONLY when it is not the quantity or material spec.

| Raw text | Expected lot | Rationale |
|---|---|---|
| `15 10 2x6` | `15` | first number, clearly a lot preceding qty+material |
| `10 2x6 15` | `15` | last isolated number after material = lot |
| `send 10` | `null` | 10 is the quantity, no lot mentioned |
| `just 2x6` | `null` | no number at all |
| `2x6` | `null` | dimension, not lot |
| `10` (just this) | `null` | ambiguous, do not guess |

## 10. Multiple lots in one message

Return one order object per lot.

| Raw text | Expected orders |
|---|---|
| `lot 15 and lot 22` | `[{lot:"15", ...}, {lot:"22", ...}]` |
| `lot 15, 22, 30` | `[{lot:"15"}, {lot:"22"}, {lot:"30"}]` |
| `15: 10 2x6; 22: 5 plywood` | `[{lot:"15", material:"2x6", quantity:10}, {lot:"22", material:"plywood", quantity:5}]` |

## 11. Typos and informalities

| Raw text | Expected lot |
|---|---|
| `lott 15` | `15` |
| `lott15` | `15` |
| `loot 15` | `15` |
| `lor 15` (common mobile typo for lot) | `15` |
| `lte 15` | `15` |
| `lot15` | `15` |

## 12. Emoji / media captions

| Raw text | Expected lot |
|---|---|
| `📸 lot 15` | `15` |
| `📷 lote 15` | `15` |
| `pic lot 15` | `15` |
| `photo 15` | `15` |

## 13. Question / mixed intent (not a pure order)

These should still extract lot if present, even if the message is a question.

| Raw text | Expected lot |
|---|---|
| `can you bring more 2x6 to lot 15?` | `15` |
| `what do I need for lot 22A?` | `22A` |
| `is lot 15 ready?` | `15` |

## 14. Real-world examples observed (seed set)

> Add entries here as new formats arrive in production. Each entry should
> link to the `frm_material_requests.id` that inspired it.

| Raw text | Expected lot | Source request id |
|---|---|---|
| `2 2x6 lot 15` | `15` | `d4cf525c-ccbc-49b2-a584-2951bc947c1f` |

---

## Hard negatives — do NOT extract lot

| Raw text | Why |
|---|---|
| `send more 2x6` | no lot, no plausible bare number |
| `machine is down` | not an order |
| `break at 10` (time) | "at 10" is context for time, not lot |
| `2x6 8ft` | these are dimensions, never a lot |

---

## Maintenance

When a worker's message fails to extract a lot but clearly contained one:

1. Add the `raw_message` and `expected_lot` to the relevant table above.
2. Copy the same pattern into the `LOT EXTRACTION` section of
   `supabase/functions/request-ingest/index.ts` (SYSTEM_PROMPT).
3. Redeploy `request-ingest`.
4. Retest via SMS.

Over time, this file becomes the authoritative extraction spec and the
training-set ground truth for the Prumo AI that replaces GPT-4o.
