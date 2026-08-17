---
title: Fud AI Food Analysis Prompt & Schema Extraction
id: fud-ai-food-analysis
version: 1
last_synced: 2026-08-17
status: reference
code_refs: []
depends_on: []
---

# Fud AI Food Analysis Prompt & Schema Extraction Notes

> **Purpose**: Serve as the prompt and data structure foundation for a custom nutrition logging agent (Vercel `/api/analyze-photo` + `/api/analyze-text`).
> **Source**: [Fud AI](https://github.com/apoorvdarshan/fud-ai) (MIT), `ios/calorietracker/Services/GeminiService.swift`
> **Core finding**: Fud AI's "AI recognition" = one prompt + one JSON schema + direct BYOK LLM call, with no server-side API to call; these source code assets can be legally extracted and reused.
> **Pull date**: 2026-08-16

---

## 1. Three JSON Schemas

### 1.1 Food Analysis (with emoji, for text input)

```json
{"name":"...","calories":0,"protein":0.0,"carbs":0.0,"fat":0.0,
 "serving_size_grams":0.0,"emoji":"🍽️",
 "sugar":0.0,"added_sugar":0.0,"fiber":0.0,
 "saturated_fat":0.0,"monounsaturated_fat":0.0,"polyunsaturated_fat":0.0,"trans_fat":0.0,
 "cholesterol":0.0,"caffeine":0.0,
 "creatine":0.0,"beta_alanine":0.0,"l_citrulline":0.0,"l_carnitine":0.0,"l_arginine":0.0,"taurine":0.0,"betaine":0.0,"hmb":0.0,
 "sodium":0.0,"potassium":0.0,"calcium":0.0,"iron":0.0,"magnesium":0.0,"zinc":0.0,
 "vitamin_a":0.0,"vitamin_c":0.0,"vitamin_d":0.0,"vitamin_b12":0.0,"vitamin_e":0.0,"vitamin_k":0.0,"folate":0.0,"omega_3":0.0,
 "ingredients":[],"unit_options":[]}
```

### 1.2 Food Analysis (without emoji, for image input)

Same as above but with the `emoji` field removed; everything else is identical.

### 1.3 Nutrition Label (separate schema, reads the label instead of estimating)

```json
{"name":"Product Name",
 "calories_per_100g":0.0,"protein_per_100g":0.0,"carbs_per_100g":0.0,"fat_per_100g":0.0,
 "serving_size_grams":0.0,
 "sugar_per_100g":0.0,"added_sugar_per_100g":0.0,"fiber_per_100g":0.0,
 "saturated_fat_per_100g":0.0,"monounsaturated_fat_per_100g":0.0,"polyunsaturated_fat_per_100g":0.0,"trans_fat_per_100g":0.0,
 "cholesterol_per_100g":0.0,"caffeine_per_100g":0.0,
 "creatine_per_100g":0.0,"beta_alanine_per_100g":0.0,"l_citrulline_per_100g":0.0,"l_carnitine_per_100g":0.0,"l_arginine_per_100g":0.0,"taurine_per_100g":0.0,"betaine_per_100g":0.0,"hmb_per_100g":0.0,
 "sodium_per_100g":0.0,"potassium_per_100g":0.0,"calcium_per_100g":0.0,"iron_per_100g":0.0,"magnesium_per_100g":0.0,"zinc_per_100g":0.0,
 "vitamin_a_per_100g":0.0,"vitamin_c_per_100g":0.0,"vitamin_d_per_100g":0.0,"vitamin_b12_per_100g":0.0,"vitamin_e_per_100g":0.0,"vitamin_k_per_100g":0.0,"folate_per_100g":0.0,"omega_3_per_100g":0.0,
 "unit_options":[]}
```

> Nutrition labels are standardized to **per 100g / per 100ml**; if the label gives per-serving values, they are converted using the serving size. This is the "label reading" path, far more precise than photo-based food estimation.

---

## 2. Three Instruction Blocks (Appended to Every Prompt)

### 2.1 Nutrient Unit Rules

```
Calories are integers. Protein/carbs/fat are decimal gram values when needed.
serving_size_grams is the estimated weight in grams.
Nutrients are numbers:
  sugar/fiber/fats/omega_3/creatine/beta_alanine/l_citrulline/l_carnitine/l_arginine/taurine/betaine/hmb in grams;
  cholesterol/caffeine/sodium/potassium/calcium/iron/magnesium/zinc/vitamin_c/vitamin_e in milligrams;
  vitamin_a/vitamin_d/vitamin_b12/vitamin_k/folate in micrograms.
Only report sports-nutrition compounds when explicitly present in a label or description; otherwise use 0.
```

**Key points**: Calories are integers; macros are in grams (decimals allowed); sports-nutrition compounds (creatine, beta-alanine, etc.) are reported only when explicitly present, otherwise 0; micronutrients are tiered into grams / milligrams / micrograms.

### 2.2 Serving Unit Options (unit_options)

```
unit_options is required and must always be a JSON array. Each item must be a complete object with this exact schema (the values are schema examples only; never copy them):
{"unit":"slice","quantity":2.0,"grams_per_unit":60.0}
quantity is the number of units in the whole analyzed amount, and grams_per_unit is the grams in one unit.
For every item, quantity * grams_per_unit must approximately equal serving_size_grams.
Do not include g/gram/grams as an option.
Return [] when there is no reliable non-gram unit. An empty array is a complete, valid answer.
Never invent a count from the food name or total grams. Only return a countable unit when its quantity is stated in the user's text, visible in the image or label, or strongly implied by the described or visible analyzed portion. Do not assume quantity is 1 merely because the food is commonly sold or served as one piece.
```

**Key points**: Countable units must satisfy `quantity x grams_per_unit ~ total grams`; **grams are the source of truth**; never fabricate a count from the food name or total weight; when uncertain, return `[]` (an empty array is a valid answer). This design is structurally identical to XunJi's (训记, a Chinese fitness tracking app) `units` conversion system.

### 2.3 Ingredient Breakdown (ingredients)

```
ingredients is required. For a meal with multiple meaningful foods, return each food once using this exact object shape:
{"name":"...","grams":0.0,"calories":0,"protein":0.0,"carbs":0.0,"fat":0.0}
Ingredient grams and macros must describe the analyzed amount and add up approximately to the meal totals.
Return [] for a nutrition label, a single simple food, or when a reliable breakdown is not possible.
```

**Key points**: Mixed meals are decomposed into multiple ingredients whose totals sum to approximately the meal totals; return `[]` for nutrition labels, single simple foods, or when reliable decomposition is not possible. **This is the critical field for solving the Chinese mixed-dish problem.**

---

## 3. Prompts for Each Scenario (Original Text)

### 3.1 Text Input `analyzeTextInput`

```
Estimate the nutritional content for: {description}
Parse any quantities, brands, and multiple items from the text. If a brand is mentioned, use that brand's known nutritional data. If multiple items are described, sum up the total nutrition.
Respond ONLY with JSON:
{foodAnalysisJSONShape}
{nutrientUnitsInstruction}
{servingUnitOptionsInstruction}
{ingredientBreakdownInstruction}
When supported by the text, use slice/piece for discrete foods, ml/cup/fl oz for liquids, tbsp/tsp for spooned foods, and can/packet for packaged foods.
Include a single food emoji that best represents the food. Use null for any nutrient you cannot estimate.
```

**Key points**: Parse quantities, brands, and multiple foods from the text; sum multiple foods together; `null` means "cannot estimate" -- **better to leave blank than fabricate a number**.

### 3.2 Single Image `analyzeFood`

```
Analyze this food image. Identify the food and estimate its nutritional content.

Respond ONLY with a JSON object in this exact format, no other text:
{foodAnalysisJSONShapeWithoutEmoji}

{nutrientUnitsInstruction}
{servingUnitOptionsInstruction}
{ingredientBreakdownInstruction}
When supported by the image, use slice/piece for discrete foods, ml/cup/fl oz for liquids, tbsp/tsp for spooned foods, and can/packet for packaged foods. For a whole or mostly-whole divisible food, count only clearly visible pieces or slices and derive grams_per_unit from serving_size_grams / quantity.
Give your best estimate for the visible food amount shown in the image. For whole/mostly-whole cakes, pizzas, pies, loaves, or similar foods, estimate the total visible item/remaining item weight rather than defaulting to one slice. Use null for any nutrient you cannot estimate.
```

**Key points**: Can optionally include a user description as context (`Additional context from the user about this meal: ...`); **for whole cakes/pizzas/loaves, estimate the entire remaining item weight rather than defaulting to a single slice**.

### 3.3 Auto-Detect (Food or Nutrition Label) `autoAnalyze`

```
Analyze this image. It could be either a photo of food OR a nutrition facts label.

If it's a food photo: identify the food and estimate nutritional content for the serving shown.
If it's a nutrition label: read the values and calculate for one serving size as listed on the label.

Respond ONLY with JSON:
{foodAnalysisJSONShapeWithoutEmoji}
{nutrientUnitsInstruction}
{servingUnitOptionsInstruction}
{ingredientBreakdownInstruction}
When supported by the image or label, use slice/piece for discrete foods, ml/cup/fl oz for liquids, tbsp/tsp for spooned foods, and can/packet for packaged foods. For a whole or mostly-whole divisible food, count only clearly visible pieces or slices and derive grams_per_unit from serving_size_grams / quantity.
Use null for any nutrient you cannot estimate.
```

### 3.4 Multi-Image (Multiple Angles / Multiple Ingredients / Scale Readings) `multiPhotoAnalysisPrompt`

Standard multi-image deduplication rules:
```
Use every image once. Do not double-count the same food shown from multiple angles. When separate ingredients are shown, combine their nutrition into one meal total. Read visible scale weights and nutrition labels when available; prefer those measurements over visual portion estimates.
Treat the photos as multiple views of the same item unless there are clearly separate foods.
```

**Progressive Meal Mode** (progressiveMeal, for scale-assisted logging, additional rules):
```
These images are a chronological progressive-meal sequence in the exact order the user captured or selected them.
- Photo 1 shows the first ingredient on the plate. Each later photo shows the same plate after one or more new ingredients were added.
- Compare each photo with the previous photo. Return foods already present only once, and add each newly visible food as its own ingredient.
- When the photos show reliable cumulative scale totals with the same plate and tare, the first ingredient weight is the first reading. Each later added weight is the current scale total minus the previous scale total.
- If the scale was visibly tared or reset before a photo, use that photo's reading directly for the newly added ingredient.
- Never subtract unreadable, incompatible, or decreasing readings. In that case estimate only the newly added food from the visual change and user context.
- The final meal weight should match the latest reliable cumulative reading, and ingredient weights and macros should add up approximately to the meal totals.
```

**Key points**: Multi-image must **deduplicate** (the same food from multiple angles counts only once); prioritize scale readings and label numbers over visual estimates; progressive meal = later photo minus earlier photo (weight-difference method), falling back to visual estimation when readings are unreliable.

### 3.5 Nutrition Label `analyzeNutritionLabel`

```
Read this nutrition label image. Extract the nutritional values per 100g (or per 100ml).
If the label shows per-serving values, convert them to per-100g using the serving size.

For the name, identify the product or brand name visible on the packaging or label.
If no name is visible, describe the food type (e.g. "Protein Bar", "Yogurt", "Cereal").

Respond ONLY with JSON:
{nutritionLabelJSONShape}

{servingUnitOptionsInstruction}
All nutrient and serving-size values should be numbers. If serving size or any nutrient is not available, use null. Only include a label serving unit such as slice, piece, tbsp, cup, ml, fl oz, can, or packet when its quantity is actually printed or otherwise visible on the label.
```

---

## 4. Related Logic Worth Reusing (Same File / Same Repo)

| Module | File | Description |
|---|---|---|
| "What if" meal preview | GeminiService.swift `suggestMealWhatIf` | Today's logged meals + pending meal -> compare against goals, suggest portion reduction / substitution / add protein, with specific numbers |
| Nutrient goal estimation | `suggestOptionalNutrientGoals` | Sets micronutrient goals (fiber, sodium, vitamins, etc.) based on general adult standards |
| Adaptive calorie target | `calculateGoals` | Formula + recent actual calorie average + weight trend to estimate true maintenance calories |
| BMR/TDEE/macro formulas | UserProfile.swift | Katch-McArdle (with body fat) / Mifflin-St Jeor (without body fat) -> TDEE -> calories / protein / fat / carbs |
| Weight thermodynamics prediction | WeightAnalysisService.swift | 30/60/90-day weight projections, predicted vs. actual, missed-logging detection |

---

## 5. Chinese Localization Recommendations (For Our Vercel Solution)

1. **Reuse schemas directly**. Keep field names in English (consistent with training records: `name/cal/protein/carbs/fat`). Replace example foods in prompts with Chinese examples (e.g. `{"name":"鸡胸肉","calories":165,...}` -- chicken breast).
2. **Supplement unit instructions with Chinese units**: `slice/piece` -> 片/个/块 (slice/piece/chunk), `ml/cup/fl oz` -> 毫升/杯 (ml/cup), `tbsp/tsp` -> 汤匙/茶匙 (tablespoon/teaspoon), `can/packet` -> 罐/袋 (can/bag).
3. **Chinese mixed dishes are the focus**: The `ingredients` decomposition field is most valuable for stir-fries, rice-topped dishes, and soups. Chinese-language prompts should include explicit examples (e.g. "Qingjiao Chao Rou (stir-fried pork with green peppers) -> decompose into green peppers + sliced pork, each with gram weights").
4. **Value calibration strategy** (going beyond Fud AI): After the LLM outputs JSON, look up each `name` in FatSecret or the XunJi (训记) food database for per-100g reference values. If a database match exists, override the LLM estimate with the database value; if not, keep the LLM value and flag it as "estimated".
5. **Confirmation UI is mandatory**: Recognition result -> user reviews grams item by item / substitutes foods -> confirm and save (consistent with XunJi's (训记) API "confirm before write" pattern and Fud AI's "review before log" flow).
6. **Photos are not stored by default**: Discard after recognition for maximum privacy simplicity. Add Blob thumbnail storage later only if "look back at what I ate" becomes a needed feature.

---

## 6. Implementation Checklist (For Building `/api/analyze-photo`)

- [ ] Serverless proxy for LLM keys (never expose to the frontend), supporting Gemini/OpenAI etc.
- [ ] Three schema constants (food with emoji / food without emoji / nutrition label)
- [ ] Three instruction block constants (nutrient units / unit_options / ingredients)
- [ ] Single-image prompt + multi-image prompt + label prompt (Chinese-localized versions)
- [ ] JSON parsing + error tolerance (LLMs occasionally wrap output in markdown or truncate)
- [ ] FatSecret / XunJi (训记) database value calibration layer
- [ ] Confirmation UI + save to database + daily summary
