# Polaris

The patient-facing clinical trial discovery product. One product, three units:

| Unit | What it is | Hires it to… |
| --- | --- | --- |
| `handlers/` | Surface-agnostic business logic. Accepts a frozen `InvocationContext`, returns plain data. | be the single source of behavior both surfaces share |
| `cli/` | `bionova-polaris` — a libcli CLI for staff and power users | search, inspect, and manage trials from a terminal |
| `site/` | Next.js + Tailwind web app | let patients and physicians discover trials in a browser |

Both surfaces dispatch into the same `handlers/`. The CLI renders with
`libformat`; the web renders with React. No handler hand-authors
patient-facing copy. Every explainer, FAQ, consent summary, site description,
patient story, and therapy description is generated from `story.dsl` and read
from a seed table.

## Personas

| Persona | Hires Polaris to… |
| --- | --- |
| Patient / Advocate | find trials relevant to their condition without reading dense protocols |
| Clinical Development Staff | manage trial listings and monitor enrollment interest |
| Referring Physician | search on behalf of patients, bookmark and share trial details |
