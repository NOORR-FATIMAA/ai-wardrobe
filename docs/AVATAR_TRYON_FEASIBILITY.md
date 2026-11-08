# 3D Avatar & Virtual Try-On: Feasibility Study

*Status: research notes, October 2026. Licences, prices and vendor status change quickly. Re-check primary sources before committing to any option.*

## Summary

| Capability | Feasible for a student budget? | Recommended route |
|---|---|---|
| Outfit preview boards from the user's own photos | **Yes, now** | Pure app code, no AI cost |
| Approximate body-shape avatar from height/weight/measurements | **Yes** | Anny body model (Apache-2.0) → glTF → render in app |
| Avatar shape estimated from body photos | **Research only, or paid licence** | SMPL-family methods; commercial use needs a licence |
| 2D "try-on" images (outfit drawn onto a photo/avatar render) | **Yes, pay-per-use** | Hosted try-on API, or self-host FASHN VTON v1.5 (Apache-2.0) |
| Physically accurate 3D garment draping and fit | **No (not near-term)** | Needs 3D garment patterns we cannot get from photos |

Recommended order: preview boards → measurement-based avatar → 2D try-on → (later) photo-based shape. Accurate fit simulation stays out of scope, and the app must never claim it.

## 1. Outfit preview boards (do first)

Compose the outfit's item photos into an editorial flat-lay or "mannequin column" (outerwear/top/bottom/shoes stacked). This gives most of the "visualise before getting dressed" value with zero inference cost and no body data.

- Improve inputs with background removal: on-device subject lifting (iOS Vision, Android ML Kit Subject Segmentation) via a small native module, or a hosted remover.
- Fits the existing data model: `outfits` + `outfit_items` already order the pieces.

## 2. Body-shape avatar from measurements (privacy-friendly)

**Anny** (NAVER LABS Europe) is a parametric human body model released under **Apache-2.0**. It is driven by age, height, weight and proportions, calibrated on WHO population statistics, and it covers all ages and body types. Caveat: its optional `smplx` topology for SMPL-X interoperability inherits SMPL-X's **non-commercial** licence, so use only the native topology.

Pipeline:
1. User enters height, weight and optional measurements (the `profiles.measurements` column already exists) and picks a skin tone from a palette. Skin tone is chosen, never inferred from a photo.
2. A small Python service (PyTorch) generates the mesh and exports glTF. It runs as an on-demand serverless GPU/CPU job or a cached batch, not inside Supabase Edge Functions (Deno can't run PyTorch).
3. The app renders it with `three.js` through `expo-gl`/`@react-three/fiber`, or with `react-native-filament`.

Honest framing: "an approximate figure based on the numbers you entered." No body photos are needed, which removes most of the privacy burden.

## 3. Avatar shape from photos (defer)

Most single-image body-shape estimators (HMR 2.0, ICON/ECON, etc.) are built on SMPL/SMPL-X, which is **free for non-commercial research only**. Commercial use needs a licence, for example via Meshcapade, which offers commercial and R&D tiers (their published pricing started around €2,000/year for a micro commercial tier; verify). For a university demo, research use is fine. For a startup, budget for the licence or stay with option 2.

If built, it requires the **separate** `consent_body_photos` flag (already in the schema). Process photos once, keep only the derived shape parameters, delete the photos immediately, and never use them for training.

Vendor risk: Ready Player Me (the most popular avatar SDK) was acquired by Netflix in December 2025 and shut down its public service on 31 January 2026. Prefer open models or exportable formats (glTF) over closed avatar platforms.

## 4. 2D virtual try-on images

Image-based try-on models take a person image (a real photo, or a render of the avatar) plus a garment image and produce a picture of the person wearing it.

| Option | Licence / cost | Notes |
|---|---|---|
| **FASHN VTON v1.5** (open weights) | Apache-2.0 per the release post | ~1B params, runs on consumer GPUs; self-host on a serverless GPU and pay per second |
| Hosted try-on APIs (FASHN, Google Vertex AI virtual try-on, fal.ai-hosted models) | roughly **$0.04–0.08 per image** (secondary sources) | Easiest to integrate; check current official pricing and data-retention terms |
| CatVTON, IDM-VTON | **CC BY-NC-SA (non-commercial)** | Fine for a class demo; not for a commercial product |

Design implications:
- Try-on works one garment at a time (top, bottom, dress). Full outfits need chained calls, which multiplies cost and artefacts. Cache results per (avatar, outfit).
- Running try-on on the **avatar render** instead of a user photo avoids sending body photos to third parties at all.
- Label every output "AI visualisation: style preview, not an accurate fit."
- Gate behind the daily AI allowance (`consume_ai_call`) and charge it a higher weight than text calls.

## 5. Physically accurate garment simulation (out of scope)

Real cloth draping (CLO3D, Marvelous Designer) needs garment sewing patterns and fabric parameters. A photo of a shirt doesn't give us those, and research on recovering them is not production-ready. Treat accurate fit estimation as a long-term research goal, not a product promise.

## Sources

- Anny licence and design: NAVER LABS Europe, https://europe.naverlabs.com/research/publications/human-mesh-modeling-for-anny-body/ · https://pypi.org/project/anny/
- FASHN VTON v1.5 open release: https://fashn.ai/blog/fashn-vton-1-5-open-source-release
- Open-source VTON licence overview: https://fashn.ai/blog/so-you-want-to-build-a-virtual-try-on-app-a-developers-guide-to-not-getting
- Try-on API price comparison (secondary): https://fal.ai/learn/tools/best-virtual-try-on-apis-2026 · https://cloudprice.net/models/google-virtual-try-on-1
- IDM-VTON licence (repo README mirror): https://cdn.jsdelivr.net/gh/yisol/idm-vton@main/README.md
- Meshcapade / SMPL licensing: https://meshcapade.com/assets/avatar-tech
- Ready Player Me shutdown: https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/ · https://genies.com/blog/ready-player-me-discontinued-alternatives
