# {{condition.name}}

- Severity: {{condition.severity}}
- ICD-10: {{#condition.icd10}}{{.}} {{/condition.icd10}}
- Also known as: {{#condition.synonyms}}{{.}}; {{/condition.synonyms}}

{{#explainer}}
## About this condition

{{explainer}}
{{/explainer}}
{{^explainer}}
No explainer available yet.
{{/explainer}}
