# apple-vision-ocr-fallback — Delta Spec (capability retired)

## REMOVED Requirements

### Requirement: An iOS native module exposes Apple Vision text recognition
**Reason**: The iOS Vision OCR TurboModule is deleted; Gemma 4's vision pass transcribes in-photo text on both platforms.
**Migration**: Superseded by `gemma-vision-enrichment` (text field of the enrichment contract).

### Requirement: TextRecognitionService falls back to Apple Vision on iOS
**Reason**: The iOS Vision OCR TurboModule is deleted; Gemma 4's vision pass transcribes in-photo text on both platforms.
**Migration**: Superseded by `gemma-vision-enrichment` (text field of the enrichment contract).
