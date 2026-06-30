# Trial search results

{{#query.condition}}Condition: {{query.condition}}
{{/query.condition}}{{#query.phase}}Phase: {{query.phase}}
{{/query.phase}}{{#query.status}}Status: {{query.status}}
{{/query.status}}{{#query.location}}Location: {{query.location}}
{{/query.location}}
{{total}} trial(s) found.

{{#trials}}
## {{name}} ({{id}})

- Phase: {{phase}}
- Status: {{status}}
- Therapeutic area: {{therapeutic_area}}
- Enrollment: {{current_enrollment}} / {{target_enrollment}}
- Sites: {{sites_count}}
- Conditions:
{{#conditions}}  - {{name}} ({{id}})
{{/conditions}}

{{/trials}}
{{^trials}}
No trials matched.
{{/trials}}
