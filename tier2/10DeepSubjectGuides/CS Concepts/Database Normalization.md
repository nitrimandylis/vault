---
id: database-normalization
category: concept
subject: CS HL
level: tier2
created: 2026-04-15T12:00:00Z
updated: 2026-04-15T12:00:00Z
---

# Database Normalization

## Definition
Process of organizing data to reduce redundancy and improve integrity.

## Normal Forms

| Form | Rule | Goal |
|------|------|------|
| 1NF | Atomic values, no repeating groups | Eliminate duplicates |
| 2NF | 1NF + no partial dependencies | Full dependency on PK |
| 3NF | 2NF + no transitive dependencies | Eliminate columns dependent on non-key |

## Key Concepts
- **Primary Key** — unique identifier
- **Foreign Key** — references another table
- **Dependency** — attribute depends on key

## IB Exam Focus
- Identify normalization problems
- Draw entity-relationship diagrams
- SQL queries on normalized data

## Appears in
- [[CS HL – Core Guide]]
- [[CS IA – Project Hub]]

## Related
- [[OOP Principles]]