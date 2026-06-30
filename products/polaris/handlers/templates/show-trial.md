# {{trial.name}}

- Protocol: {{trial.protocol_id}}
- Phase: {{trial.phase}}
- Status: {{trial.status}}
- Therapeutic area: {{trial.therapeutic_area}}
- Sponsor: {{trial.sponsor}}
- Enrollment: {{trial.current_enrollment}} / {{trial.target_enrollment}}
- Start: {{trial.start_date}}
- Estimated end: {{trial.estimated_end_date}}

{{#principal_investigator}}
**Principal investigator:** {{name}} ({{role}})
{{/principal_investigator}}

## Conditions
{{#conditions}}
- {{name}} ({{severity}})
{{/conditions}}

## Sites
{{#sites}}
- {{name}} — {{city}}, {{state}}, {{country}}
{{/sites}}

## Eligibility criteria

### Inclusion
{{#criteria.inclusion}}
- Age: {{age_min}}–{{age_max}}
- ECOG max: {{ecog_max}}
{{#custom}}- {{.}}
{{/custom}}
{{/criteria.inclusion}}

### Exclusion
{{#criteria.exclusion}}
{{#custom}}- {{.}}
{{/custom}}
{{/criteria.exclusion}}

{{#faq}}
## Frequently asked questions

{{faq}}
{{/faq}}

{{#consentSummary}}
## Consent summary

{{consentSummary}}
{{/consentSummary}}
