# Hiro Design Rules

## Operator Surfaces
- Treat Hiro's browser canvas as an operator workspace, not a landing page and not a chat transcript.
- Prioritize orientation, status, comparison, and action over marketing copy.
- The default visual direction is deep slate with teal and warm gold accents. Do not revert to generic purple SaaS styling.
- Keep typography restrained: use one display moment, utility labels in mono, and tight spacing discipline.

## Canvas Widgets
- Canvas widgets mount inside an existing shell. Do not recreate full-page browser chrome unless the task explicitly needs a self-contained app view.
- Prefer semantic HTML and the built-in canvas classes: `canvas-report`, `canvas-stack`, `canvas-grid`, `canvas-panel`, `canvas-label`, `canvas-stat`, `canvas-badge-row`, `canvas-badge`, `canvas-table-wrap`, `canvas-actions`, `canvas-note`, `canvas-divider`.
- Large tables should be wrapped in `canvas-table-wrap`.
- Inline scripts are allowed when the widget needs interactivity. Keep them self-contained and lightweight.
- Avoid external CDN dependencies unless there is no practical inline alternative.

## Product UI
- Default to layout before cards. Use cards only when a card is the interaction.
- A section should have one job and one dominant idea.
- Dense data is acceptable if the hierarchy stays obvious in one scan.
- Motion should clarify state or affordance, not decorate routine product UI.

## Copy
- Use utility copy for product surfaces.
- Headings should describe what the operator is seeing or deciding.
- Supporting text should explain scope, freshness, or decision value in one sentence.
- If a sentence sounds like homepage marketing, rewrite it until it sounds operational.
