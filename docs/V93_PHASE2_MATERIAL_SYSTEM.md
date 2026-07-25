# v93 Phase 2 native material system

Phase 2 removes visible text-bearing handwritten PNG labels from the learner UI.
Native text is now the authoritative visible label. Text-free inline vectors provide
brand, state, and answer-feedback character without duplicating wording.

The old `public/handwritten-ui` files and `HandwrittenAsset.tsx` remain temporarily for
rollback compatibility. They must not be imported by visible TSX files. The
`test:v93-materials` gate enforces this boundary.

See the external Phase 2 audit for scope and validation details.
