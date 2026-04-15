---
id: linked-lists
category: concept
subject: CS HL
level: tier2
created: 2026-04-15T12:00:00Z
updated: 2026-04-15T12:00:00Z
---

# Linked Lists

## Definition
Linear data structure where nodes contain data + pointer to next node.

## Types
- **Singly linked** — one direction
- **Doubly linked** — both directions
- **Circular** — last node points to first

## Operations
| Operation | Array | Linked List |
|-----------|-------|-------------|
| Access | O(1) | O(n) |
| Insert/Delete | O(n) | O(1)* |

*At head; tail requires O(n) to find

## IB Exam Focus
- Traversing, inserting, deleting
- Compare with arrays for efficiency

## Appears in
- [[CS HL – Core Guide]]
- [[Recursion]]

## Related
- [[Binary Trees]]
- [[Big O Notation]]