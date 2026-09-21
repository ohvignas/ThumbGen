---
name: link_studio_miniature
description: Creates, links or unlinks a canvas miniature on a local ThumbGen video fiche, with at most three A/B test slots.
---

# link_studio_miniature

Connects real canvas projects to a Vidéos / studio fiche. Local SQLite only; no YouTube Test & Compare, no Notion, and no paid API.

## Actions

- `create`: create a new `proj_…` canvas named from the fiche and link it.
- `link`: link an existing canvas project; `project_id` is required.
- `unlink`: detach an existing canvas project; `project_id` is required.

Use `list_projects` first when the user needs to choose an existing project id. A fiche accepts three linked miniatures maximum for its A/B test.

This is a studio linking tool. Never call `generate_sketch` or `apply_workflow` from a Vidéos / studio fiche. To design or edit the miniature, the user opens its canvas separately.
